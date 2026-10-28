import { z } from "zod";

import {
  Prisma,
  readProjectProgressBaseline,
  readProjectProgressEvidence,
  type ProjectProgressEvidence,
  type ProjectProgressSourceAccess,
} from "@bloqer/database";
import { can, type PermissionModule } from "@bloqer/domain";
import { calendarPartsInTimeZone, formatCalendarDate } from "@bloqer/utils";

import { suggestCertificationFromProgress } from "../certification/certification-measurement-pure";
import {
  serializeMoneyDecimal,
  serializeQtyDecimal,
  serializeRatePctDecimal,
} from "../finance/money-decimal";
import { requireProjectAccess } from "../security/access";
import {
  getTenantModuleGate,
  assertTenantModuleEnabledWithGate,
} from "../tenant-modules/tenant-module.service";
import { ServiceContext, ServiceError } from "../types";
import { compareWbsCodes } from "../budget/wbs-code-rules";
import { isCrossCompany } from "../company-scope";
import { defaultReportDateRange, monthLabel, parseFilterDate } from "./report-month";
import {
  aggregateProjectProgressCoverage,
  projectProgressCostsAt,
  projectProgressPlanPct,
  resolveProjectProgressPhysical,
  type ProjectProgressCostEvent,
} from "./project-progress-pure";
import type {
  ProjectProgressFilters,
  ProjectProgressFinancial,
  ProjectProgressPending,
  ProjectProgressReportResult,
  ProjectProgressRow,
} from "./project-progress.types";

export * from "./project-progress.types";

const ZERO = new Prisma.Decimal(0);
const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  });
const filtersSchema = z.object({
  dateFrom: dateSchema.optional(),
  dateTo: dateSchema.optional(),
  budgetId: z.string().uuid().optional(),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .optional(),
});

export function parseProjectProgressFilters(
  raw: Record<string, string | undefined>,
): ProjectProgressFilters {
  const parsed = filtersSchema.safeParse(
    Object.fromEntries(
      Object.entries(raw).filter(([, value]) => value !== "" && value !== undefined),
    ),
  );
  if (!parsed.success)
    throw new ServiceError(
      "VALIDATION",
      "Revisá las fechas, el presupuesto y la moneda del reporte.",
    );
  const result = parsed.data;
  const today = formatCalendarDate(calendarPartsInTimeZone());
  if (result.dateTo && result.dateTo > today)
    throw new ServiceError("VALIDATION", "El corte no puede ser posterior a hoy.");
  if (result.dateFrom && result.dateFrom > (result.dateTo ?? today))
    throw new ServiceError(
      "VALIDATION",
      "El inicio del período debe ser anterior o igual al corte.",
    );
  if (result.dateFrom) {
    const end = result.dateTo ?? today;
    const visibleMonths =
      (Number(end.slice(0, 4)) - Number(result.dateFrom.slice(0, 4))) * 12 +
      Number(end.slice(5, 7)) -
      Number(result.dateFrom.slice(5, 7)) +
      1;
    if (visibleMonths > 120)
      throw new ServiceError(
        "VALIDATION",
        "La ventana de evolución admite hasta 120 meses. Acotá Desde; el acumulado anterior se conserva.",
      );
  }
  return result;
}

export function projectProgressSourceAccess(
  ctx: ServiceContext,
  enabled: (module: PermissionModule) => boolean,
): ProjectProgressSourceAccess {
  const has = (module: PermissionModule) => enabled(module) && can(ctx.roles, "VIEW", module);
  return {
    jobsite: enabled("JOBSITE_LOG") && (has("JOBSITE_LOG") || can(ctx.roles, "VIEW", "PROJECTS")),
    schedule: enabled("SCHEDULE") && (has("SCHEDULE") || can(ctx.roles, "VIEW", "PROJECTS")),
    certifications: has("CERTIFICATIONS"),
    ar: has("AR"),
    costs:
      has("AP") &&
      has("BUDGETS") &&
      (!enabled("PROCUREMENT") || has("PROCUREMENT") || has("PURCHASE_ORDERS")) &&
      (!enabled("SUBCONTRACTS") || has("SUBCONTRACTS")),
    procurement: enabled("PROCUREMENT"),
    subcontracts: enabled("SUBCONTRACTS"),
  };
}

const dateKey = (value: Date) => value.toISOString().slice(0, 10);
const money = serializeMoneyDecimal;
const rate = serializeRatePctDecimal;
function ratio(numerator: Prisma.Decimal, denominator: Prisma.Decimal) {
  return denominator.gt(0) ? rate(numerator.div(denominator).mul(100)) : null;
}

/** Existing cost-control allocation: invoice line FK, then OC weights; no new cost rule. */
export function projectProgressCostEvents(
  data: ProjectProgressEvidence,
  ids: Set<string>,
  currency: string,
) {
  const events: ProjectProgressCostEvent[] = [];
  let unallocatedCount = 0;
  let foreignCount = 0;
  let incompleteCount = 0;
  function push(event: ProjectProgressCostEvent, sourceCurrency: string) {
    if (!ids.has(event.wbsNodeId)) {
      if (!event.wbsNodeId) unallocatedCount++;
      return;
    }
    if (sourceCurrency !== currency) {
      foreignCount++;
      return;
    }
    events.push(event);
  }
  for (const order of data.orders)
    for (const line of order.lines)
      push(
        {
          wbsNodeId: line.wbsNodeId ?? "",
          date: dateKey(order.issueDate),
          committed: line.lineSubtotal,
          commitmentId: `po-line:${line.id}`,
        },
        order.currency,
      );
  for (const sub of data.subcontracts)
    for (const line of sub.lines)
      push(
        {
          wbsNodeId: line.wbsNodeId ?? "",
          date: dateKey(sub.contractDate),
          committed: line.lineTotal,
          commitmentId: `sub-line:${line.id}`,
        },
        sub.currency,
      );
  for (const cert of data.subCerts)
    for (const line of cert.lines)
      push(
        {
          wbsNodeId: line.subcontractLine.wbsNodeId ?? "",
          date: dateKey(cert.certificationDate),
          accrued: line.lineTotal,
          accruedLinked: line.lineTotal,
          commitmentId: `sub-line:${line.subcontractLine.id}`,
        },
        cert.subcontract.currency,
      );
  for (const invoice of data.supplierInvoices) {
    if (invoice.subcontractCertificationId) continue;
    if (
      invoice.documentKind === "CREDIT_NOTE" &&
      !invoice.purchaseOrderId &&
      !invoice.lines.some((line) => line.purchaseOrderLineId)
    ) {
      if (
        invoice.lines.length &&
        invoice.lines.every((line) => line.wbsNodeId != null && !ids.has(line.wbsNodeId))
      )
        continue;
      const parent = invoice.referencedSupplierInvoice;
      const sameScope =
        parent &&
        parent.tenantId === invoice.tenantId &&
        parent.companyId === invoice.companyId &&
        parent.projectId === invoice.projectId &&
        parent.currency === invoice.currency &&
        parent.status === "ISSUED" &&
        parent.issueDate <= invoice.issueDate;
      if (!sameScope) {
        incompleteCount++;
        for (const line of invoice.lines)
          push(
            {
              wbsNodeId: line.wbsNodeId ?? "",
              date: dateKey(invoice.issueDate),
              accrued: line.lineSubtotal.negated(),
            },
            invoice.currency,
          );
        continue;
      }
      const commitmentsByWbs = new Map<string, Set<string>>();
      const parentWbs = new Set<string>();
      const addParent = (wbs: string | null, commitment: string | null) => {
        if (!wbs) return;
        parentWbs.add(wbs);
        if (!commitment) return;
        const entries = commitmentsByWbs.get(wbs) ?? new Set<string>();
        entries.add(commitment);
        commitmentsByWbs.set(wbs, entries);
      };
      const parentLinked = parent.lines.some((line) => line.purchaseOrderLineId);
      if (parentLinked)
        for (const line of parent.lines) {
          const wbs = line.purchaseOrderLine?.wbsNodeId ?? line.wbsNodeId;
          if (line.purchaseOrderLineId) addParent(wbs, `po-line:${line.purchaseOrderLineId}`);
          else {
            const matches = parent.purchaseOrder?.lines.filter((p) => p.wbsNodeId === wbs) ?? [];
            if (matches.length) for (const match of matches) addParent(wbs, `po-line:${match.id}`);
            else addParent(wbs, null);
          }
        }
      else if (parent.purchaseOrder)
        for (const line of parent.purchaseOrder.lines)
          addParent(line.wbsNodeId, `po-line:${line.id}`);
      else if (parent.subcontractCertification)
        for (const line of parent.subcontractCertification.lines)
          addParent(line.subcontractLine.wbsNodeId, `sub-line:${line.subcontractLine.id}`);
      else for (const line of parent.lines) addParent(line.wbsNodeId, null);
      for (const line of invoice.lines) {
        const wbsNodeId = line.wbsNodeId ?? "";
        const commitments = commitmentsByWbs.get(wbsNodeId);
        const attributable = parentWbs.has(wbsNodeId) && (!commitments || commitments.size <= 1);
        if (!attributable) incompleteCount++;
        const commitmentId =
          attributable && commitments?.size === 1 ? [...commitments][0] : undefined;
        const amount = line.lineSubtotal.negated();
        push(
          {
            wbsNodeId,
            date: dateKey(invoice.issueDate),
            accrued: amount,
            ...(commitmentId ? { accruedLinked: amount, commitmentId } : {}),
          },
          invoice.currency,
        );
      }
      if (!invoice.lines.length) {
        incompleteCount++;
        unallocatedCount++;
      }
      continue;
    }
    const signed = (value: Prisma.Decimal) =>
      invoice.documentKind === "CREDIT_NOTE" ? value.negated() : value;
    const po = invoice.purchaseOrder;
    const anyLinked = invoice.lines.some((line) => line.purchaseOrderLineId);
    if (po && !anyLinked) {
      const base = po.lines.reduce((sum, line) => sum.plus(line.lineSubtotal), ZERO);
      const amount = signed(
        invoice.lines.length
          ? invoice.lines.reduce((sum, line) => sum.plus(line.lineSubtotal), ZERO)
          : invoice.totalAmount,
      );
      if (!base.gt(0)) {
        unallocatedCount++;
        continue;
      }
      for (const line of po.lines) {
        const share = amount.mul(line.lineSubtotal).div(base);
        push(
          {
            wbsNodeId: line.wbsNodeId ?? "",
            date: dateKey(invoice.issueDate),
            accrued: share,
            accruedLinked: share,
            commitmentId: `po-line:${line.id}`,
          },
          invoice.currency,
        );
      }
    } else if (invoice.lines.length) {
      for (const line of invoice.lines) {
        const wbsNodeId = line.purchaseOrderLine?.wbsNodeId ?? line.wbsNodeId ?? "";
        const amount = signed(line.lineSubtotal);
        if (line.purchaseOrderLineId) {
          push(
            {
              wbsNodeId,
              date: dateKey(invoice.issueDate),
              accrued: amount,
              accruedLinked: amount,
              commitmentId: `po-line:${line.purchaseOrderLineId}`,
            },
            invoice.currency,
          );
        } else {
          push({ wbsNodeId, date: dateKey(invoice.issueDate), accrued: amount }, invoice.currency);
          const related = po?.lines.filter((l) => l.wbsNodeId === wbsNodeId) ?? [];
          const relatedBase = related.reduce((s, l) => s.plus(l.lineSubtotal), ZERO);
          if (relatedBase.gt(0))
            for (const l of related)
              push(
                {
                  wbsNodeId,
                  date: dateKey(invoice.issueDate),
                  accruedLinked: amount.mul(l.lineSubtotal).div(relatedBase),
                  commitmentId: `po-line:${l.id}`,
                },
                invoice.currency,
              );
        }
      }
    } else unallocatedCount++;
  }
  for (const payment of data.payments) {
    const invoice = payment.supplierInvoice;
    const anyLinked = invoice.lines.some((line) => line.purchaseOrderLineId);
    const shares = anyLinked
      ? invoice.lines.map((line) => ({
          id: line.purchaseOrderLine?.wbsNodeId ?? line.wbsNodeId,
          amount: line.lineTotal,
        }))
      : invoice.purchaseOrder
        ? invoice.purchaseOrder.lines.map((line) => ({
            id: line.wbsNodeId,
            amount: line.lineTotal,
          }))
        : invoice.subcontractCertification
          ? invoice.subcontractCertification.lines.map((line) => ({
              id: line.subcontractLine.wbsNodeId,
              amount: line.lineTotal,
            }))
          : invoice.lines.map((line) => ({ id: line.wbsNodeId, amount: line.lineTotal }));
    const total = shares.reduce((sum, share) => sum.plus(share.amount), ZERO);
    if (!total.gt(0)) {
      unallocatedCount++;
      continue;
    }
    for (const share of shares)
      push(
        {
          wbsNodeId: share.id ?? "",
          date: dateKey(payment.paymentDate),
          paid: payment.amount.mul(share.amount).div(total),
        },
        payment.currency,
      );
  }
  return { events, unallocatedCount, foreignCount, incompleteCount };
}

export async function getProjectProgressReport(
  projectId: string,
  rawFilters: ProjectProgressFilters,
  ctx: ServiceContext,
): Promise<ProjectProgressReportResult> {
  if (!can(ctx.roles, "VIEW", "PROJECTS") && !can(ctx.roles, "VIEW", "BUDGETS"))
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver avances del proyecto.");
  const filters = parseProjectProgressFilters(rawFilters);
  const project = await requireProjectAccess(projectId, ctx);
  if (isCrossCompany(project.companyId, ctx))
    throw new ServiceError("FORBIDDEN", "El proyecto pertenece a otra empresa.");
  const gate = await getTenantModuleGate(ctx);
  assertTenantModuleEnabledWithGate(gate, "PROJECTS");
  assertTenantModuleEnabledWithGate(gate, "BUDGETS");
  const scope = {
    tenantId: ctx.tenantId,
    companyId: project.companyId,
    activeCompanyId: ctx.companyId,
    projectId,
  };
  const baseline = await readProjectProgressBaseline(scope);
  if (!baseline.project) throw new ServiceError("NOT_FOUND", "Proyecto no encontrado.");
  if (!baseline.budgets.length) return { type: "NO_APPROVED_BUDGETS" };
  if (filters.budgetId && !baseline.budgets.some((b) => b.id === filters.budgetId))
    throw new ServiceError("NOT_FOUND", "Presupuesto no encontrado o fuera del alcance vigente.");
  const candidates = filters.budgetId
    ? baseline.budgets.filter((b) => b.id === filters.budgetId)
    : baseline.budgets;
  const availableCurrencies = [...new Set(baseline.budgets.map((b) => b.currency))].sort();
  const selectedCurrencies = [...new Set(candidates.map((b) => b.currency))].sort();
  const currency =
    filters.currency ?? (selectedCurrencies.includes("ARS") ? "ARS" : selectedCurrencies[0]!);
  if (!selectedCurrencies.includes(currency))
    throw new ServiceError("VALIDATION", "La moneda no corresponde al alcance seleccionado.");
  const budgets = candidates.filter((b) => b.currency === currency);
  const budgetIds = budgets.map((b) => b.id);
  const defaults = defaultReportDateRange(12);
  const dateTo = filters.dateTo ?? defaults.dateTo;
  const dateFrom =
    filters.dateFrom ??
    (dateTo < defaults.dateFrom ? `${dateTo.slice(0, 4)}-01-01` : defaults.dateFrom);
  const openingDate = new Date(`${dateFrom}T00:00:00Z`);
  openingDate.setUTCDate(openingDate.getUTCDate() - 1);
  const openingCut = dateKey(openingDate);
  const access = projectProgressSourceAccess(ctx, (module) => gate.isEnabled(module));
  const budgetAmounts = can(ctx.roles, "VIEW", "BUDGETS");
  const data = await readProjectProgressEvidence(
    scope,
    budgetIds,
    parseFilterDate(dateTo, true),
    access,
  );
  const nodes = data.nodes.sort((a, b) => compareWbsCodes(a.code, b.code));
  const ids = new Set(nodes.map((node) => node.id));
  const costData = projectProgressCostEvents(data, ids, currency);
  const costsAvailable = access.costs && costData.foreignCount === 0;
  const exposureAvailable = costsAvailable && costData.incompleteCount === 0;
  const notes = [
    "Acumulados desde el inicio hasta el corte; el período seleccionado no reinicia los saldos.",
    "Las fechas de ejecución y documentos se leen con sus estados actuales; este reporte no reconstruye estados históricos.",
    "La curva planificada es una referencia del plan actual, ponderada por el mismo costo directo que el físico; no es una línea base histórica.",
    "Facturado y cobrado incluyen impuestos según comprobantes; certificado usa el importe contractual. Sus diferencias no son automáticamente un saldo.",
    "AR incluye comprobantes vinculados a las certificaciones del alcance; ventas directas sin presupuesto vinculado quedan fuera de esta comparación contractual.",
    "Cronograma completo actual del proyecto (no acotado por presupuesto/corte). Sus tareas pendientes describen la situación de hoy.",
    "Los pendientes comerciales son acciones actuales: descuentan certificaciones y facturas vigentes incluso posteriores al corte; no reconstruyen una bandeja histórica.",
  ];
  const warnings: string[] = [];
  if (costData.incompleteCount)
    warnings.push(
      "Hay notas de crédito sin un vínculo inequívoco al compromiso de la factura de origen. El devengado con EDT se conserva; la exposición no se calcula hasta revisar la trazabilidad.",
    );
  const sectionsExcluded: string[] = [];
  if (candidates.length !== budgets.length)
    warnings.push(
      "El alcance se presenta por moneda original. Otros presupuestos en distinta moneda no se suman a esta vista.",
    );
  if (costData.foreignCount)
    warnings.push(
      "Hay documentos de costo de otra moneda en las partidas seleccionadas. Las capas de costo no son comparables y se muestran sin calcular.",
    );
  for (const [key, label] of [
    ["jobsite", "Libro de obra"],
    ["schedule", "Cronograma"],
    ["certifications", "Certificaciones"],
    ["ar", "Facturación y cobranzas"],
    ["costs", "Costos"],
  ] as const) {
    if (!access[key])
      sectionsExcluded.push(`${label}: fuente no disponible por permisos o módulos habilitados.`);
  }
  if (!budgetAmounts)
    sectionsExcluded.push("Importes presupuestados: requiere permiso de presupuestos.");
  const measurements = new Map<string, { date: string; pct: string | null; qty: string }[]>();
  for (const log of data.logs)
    if (log.status === "APPROVED")
      for (const p of log.progress) {
        const entries = measurements.get(p.wbsNodeId) ?? [];
        entries.push({
          date: dateKey(log.logDate),
          pct: p.physicalPct == null ? null : rate(p.physicalPct),
          qty: serializeQtyDecimal(p.quantityCompleted),
        });
        measurements.set(p.wbsNodeId, entries);
      }
  const tasksByWbs = new Map<string, typeof data.scheduleItems>();
  const scheduleParentIds = new Set(data.scheduleItems.map((i) => i.parentId).filter(Boolean));
  for (const item of data.scheduleItems)
    if (item.type === "TASK" && !scheduleParentIds.has(item.id))
      for (const link of item.wbsLinks) {
        const entries = tasksByWbs.get(link.wbsNodeId) ?? [];
        entries.push(item);
        tasksByWbs.set(link.wbsNodeId, entries);
      }
  const budgetCost = nodes.reduce(
    (sum, node) => sum.plus(node.costItem?.totalCostDirect ?? ZERO),
    ZERO,
  );
  const budgetSale = nodes.reduce(
    (sum, node) => sum.plus(node.costItem?.totalSalePrice ?? ZERO),
    ZERO,
  );
  const budgetBaseComplete =
    nodes.length > 0 &&
    nodes.every((node) => node.costItem != null && node.costItem.totalCostDirect.gte(0));
  if (!budgetBaseComplete)
    warnings.push(
      "Base presupuestaria incompleta: hay partidas sin CostItem o con costo directo inválido. Los montos y porcentajes globales sobre presupuesto no se calculan; los importes reales autorizados se conservan.",
    );
  const activeCerts = data.certifications.filter(
    (c) => c.status === "ISSUED" || c.status === "APPROVED",
  );
  const nativeInvoices = data.invoices.filter((i) => i.currency === currency);
  const arAvailable =
    access.ar &&
    nativeInvoices.length === data.invoices.length &&
    data.invoices.every(
      (i) => i.receivable?.collections.every((c) => c.currency === currency) ?? true,
    );
  if (access.ar && !arAvailable)
    warnings.push(
      "Hay facturas o cobranzas de otra moneda en el alcance. La sección AR está incompleta y no se calcula sin una conversión comparable.",
    );
  const physicalAt = (cut: string) =>
    nodes.map((node) => ({
      node,
      value: resolveProjectProgressPhysical(
        measurements.get(node.id) ?? [],
        node.costItem == null ? null : serializeQtyDecimal(node.costItem.quantity),
        cut,
      ),
    }));
  const planAt = (cut: string) =>
    nodes.map((node) => {
      const mapped = tasksByWbs.get(node.id) ?? [];
      const task = mapped.length === 1 ? mapped[0] : null;
      return {
        cost: node.costItem == null ? null : node.costItem.totalCostDirect.toFixed(4),
        pct: task
          ? projectProgressPlanPct(
              task.startDate ? dateKey(task.startDate) : null,
              task.endDate ? dateKey(task.endDate) : null,
              cut,
            )
          : null,
      };
    });
  const coverageAt = (cut: string) =>
    aggregateProjectProgressCoverage(
      physicalAt(cut).map(({ node, value }) => ({
        cost: node.costItem == null ? null : node.costItem.totalCostDirect.toFixed(4),
        ...value,
      })),
    );
  const financialAt = (cut: string): ProjectProgressFinancial => {
    const certified = activeCerts
      .filter((c) => dateKey(c.issueDate ?? c.periodEnd) <= cut)
      .reduce((sum, c) => sum.plus(c.totalAmount), ZERO);
    const invoices = nativeInvoices.filter((i) => dateKey(i.issueDate) <= cut);
    const invoiced = invoices.reduce((sum, i) => sum.plus(i.totalAmount), ZERO);
    let collected = ZERO;
    let balance = ZERO;
    let overdue = ZERO;
    for (const invoice of invoices) {
      if (!invoice.receivable || invoice.receivable.status === "CANCELLED") continue;
      const collections = invoice.receivable.collections
        .filter((c) => c.currency === currency && dateKey(c.collectionDate) <= cut)
        .reduce((sum, c) => sum.plus(c.amount), ZERO);
      const credits = invoice.receivable.creditApplications
        .filter((c) => dateKey(c.creditNoteSalesInvoice.issueDate) <= cut)
        .reduce((sum, c) => sum.plus(c.amount), ZERO);
      collected = collected.plus(collections);
      const remaining = Prisma.Decimal.max(
        ZERO,
        invoice.receivable.originalAmount.minus(collections).minus(credits),
      );
      balance = balance.plus(remaining);
      if (dateKey(invoice.dueDate) < cut) overdue = overdue.plus(remaining);
    }
    const costs = projectProgressCostsAt(costData.events, cut);
    const accrued = [...costs.values()].reduce((sum, row) => sum.plus(row.accrued), ZERO);
    const exposure = [...costs.values()].reduce((sum, row) => sum.plus(row.exposure), ZERO);
    const paid = [...costs.values()].reduce((sum, row) => sum.plus(row.paid), ZERO);
    return {
      budgetSale: budgetAmounts && budgetBaseComplete ? money(budgetSale) : null,
      budgetCost: budgetAmounts && budgetBaseComplete ? money(budgetCost) : null,
      certified: access.certifications ? money(certified) : null,
      invoiced: arAvailable ? money(invoiced) : null,
      collected: arAvailable ? money(collected) : null,
      receivableBalance: arAvailable ? money(balance) : null,
      overdueBalance: arAvailable ? money(overdue) : null,
      costAccrued: costsAvailable ? money(accrued) : null,
      costExposure: exposureAvailable ? money(exposure) : null,
      costPaid: costsAvailable ? money(paid) : null,
      certifiedPct:
        access.certifications && budgetAmounts && budgetBaseComplete
          ? ratio(certified, budgetSale)
          : null,
      costAccruedPct: costsAvailable && budgetBaseComplete ? ratio(accrued, budgetCost) : null,
      costExposurePct: exposureAvailable && budgetBaseComplete ? ratio(exposure, budgetCost) : null,
      costPaidPct: costsAvailable && budgetBaseComplete ? ratio(paid, budgetCost) : null,
      collectionPct: arAvailable ? ratio(collected, invoiced) : null,
    };
  };
  const physical = coverageAt(dateTo);
  const plan = aggregateProjectProgressCoverage(planAt(dateTo));
  if (physical.hasLegacy)
    warnings.push(
      "Hay porcentajes físicos anteriores al 01/06/2026 con semántica ambigua: requieren revisión y no integran el avance validado.",
    );
  if (physical.invalidCount)
    warnings.push(
      "Hay mediciones ambiguas o fuera del alcance: se conserva su evidencia y no se validan.",
    );
  if (physical.zeroCostCount)
    warnings.push(
      `${physical.zeroCostCount} partida(s) sin peso de costo directo; visibles en detalle, no aportan al porcentaje ponderado.`,
    );
  if (physical.pct == null)
    warnings.push(
      "El físico global no está validado: revisá cobertura y base. El avance observado conserva el alcance sin medir en el denominador.",
    );
  if (plan.pct == null)
    warnings.push(
      "Referencia del plan incompleta: se requiere una tarea primaria inequívoca y fechas válidas por partida con peso.",
    );
  const pending: ProjectProgressPending[] = [];
  const costs = projectProgressCostsAt(costData.events, dateTo);
  const budgetById = new Map(budgets.map((b) => [b.id, b]));
  const rows: ProjectProgressRow[] = physicalAt(dateTo).map(({ node, value }) => {
    const ci = node.costItem;
    const certLines = activeCerts
      .filter((c) => dateKey(c.issueDate ?? c.periodEnd) <= dateTo)
      .flatMap((c) => c.lines)
      .filter((l) => l.wbsNodeId === node.id);
    const certQty = certLines.reduce((sum, line) => sum.plus(line.currentQty), ZERO);
    const certAmount = certLines.reduce((sum, line) => sum.plus(line.periodAmount), ZERO);
    const currentCertifiedQty = activeCerts
      .flatMap((c) => c.lines)
      .filter((l) => l.wbsNodeId === node.id)
      .reduce((sum, l) => sum.plus(l.currentQty), ZERO);
    const suggestion =
      value.pct != null && ci && access.certifications
        ? suggestCertificationFromProgress({
            progressPct: rate(value.pct),
            budgetQty: serializeQtyDecimal(ci.quantity),
            previousQty: serializeQtyDecimal(currentCertifiedQty),
            unitSalePrice: ci.unitSalePrice.toFixed(4),
          })
        : null;
    const rowCost = costs.get(node.id);
    const issues = [...value.issues];
    if (!ci) issues.push("Sin base presupuestaria de costo/cantidad.");
    if (ci?.totalCostDirect.isZero())
      issues.push("Partida sin peso en el avance global (costo directo cero).");
    const mapped = tasksByWbs.get(node.id) ?? [];
    const planPct =
      mapped.length === 1
        ? projectProgressPlanPct(
            mapped[0]!.startDate ? dateKey(mapped[0]!.startDate!) : null,
            mapped[0]!.endDate ? dateKey(mapped[0]!.endDate!) : null,
            dateTo,
          )
        : null;
    if (planPct == null)
      issues.push("Sin tarea primaria inequívoca con fechas para el plan comparable.");
    const href = `/proyectos/${projectId}/control-costos/${node.id}`;
    if (exposureAvailable && ci && rowCost?.exposure.gt(ci.totalCostDirect))
      pending.push({
        id: `cost-overrun-${node.id}`,
        kind: "COST_OVERRUN",
        title: `${node.code} · ${node.name}`,
        detail:
          "La exposición de costo documentada supera el costo directo presupuestado de la partida.",
        href,
        amount: money(rowCost.exposure.minus(ci.totalCostDirect)),
      });
    if (access.jobsite && value.pct == null)
      pending.push({
        id: `physical-${node.id}`,
        kind: "PHYSICAL_MISSING",
        title: `${node.code} · ${node.name}`,
        detail: value.issues.join(" "),
        href: `/proyectos/${projectId}/libro-obra`,
      });
    if (value.pct?.lt(100))
      pending.push({
        id: `remaining-${node.id}`,
        kind: "PHYSICAL_REMAINING",
        title: `${node.code} · ${node.name}`,
        detail: `Pendiente físico: ${rate(new Prisma.Decimal(100).minus(value.pct))}%.`,
        href: `/proyectos/${projectId}/cronograma`,
      });
    if (suggestion && new Prisma.Decimal(suggestion.quantity).gt(0))
      pending.push({
        id: `certify-${node.id}`,
        kind: "CERTIFICATION_PENDING",
        title: `${node.code} · ${node.name}`,
        detail:
          "Ejecución aprobada al corte pendiente de medir; descuenta todas las certificaciones vigentes, incluidas las posteriores al corte. Sugerencia revisable.",
        href: `/proyectos/${projectId}/certificaciones`,
        ...(budgetAmounts ? { amount: suggestion.amount } : {}),
        qty: suggestion.quantity,
        unit: ci?.unit ?? "",
      });
    return {
      wbsNodeId: node.id,
      wbsCode: node.code,
      wbsName: node.name,
      budgetId: node.budgetId,
      budgetName: budgetById.get(node.budgetId)!.name,
      unit: ci?.unit ?? "",
      budgetQty: serializeQtyDecimal(ci?.quantity ?? ZERO),
      budgetCost: budgetAmounts && ci ? money(ci.totalCostDirect) : null,
      budgetSale: budgetAmounts && ci ? money(ci.totalSalePrice) : null,
      physicalPct: value.pct == null ? null : rate(value.pct),
      physicalQty:
        access.jobsite && measurements.has(node.id) ? serializeQtyDecimal(value.qty) : null,
      physicalRemainingQty:
        value.pct != null && ci
          ? serializeQtyDecimal(ci.quantity.mul(new Prisma.Decimal(100).minus(value.pct)).div(100))
          : null,
      physicalRemainingPct:
        value.pct == null ? null : rate(new Prisma.Decimal(100).minus(value.pct)),
      planPct: planPct == null ? null : rate(planPct),
      certifiedQty: access.certifications ? serializeQtyDecimal(certQty) : null,
      certifiedAmount: access.certifications ? money(certAmount) : null,
      pendingCertifyQty: suggestion?.quantity ?? null,
      pendingCertifyAmount: budgetAmounts ? (suggestion?.amount ?? null) : null,
      costAccrued: costsAvailable ? money(rowCost?.accrued ?? ZERO) : null,
      costExposure: exposureAvailable ? money(rowCost?.exposure ?? ZERO) : null,
      costPaid: costsAvailable ? money(rowCost?.paid ?? ZERO) : null,
      issues,
      href,
    };
  });
  for (const log of data.logs)
    if (log.status === "SUBMITTED" && log.progress.length)
      pending.push({
        id: log.id,
        kind: "JOBSITE_PENDING",
        title: "Parte enviado pendiente de aprobación",
        detail: "Su avance todavía no integra el físico reconocido.",
        date: dateKey(log.logDate),
        href: `/proyectos/${projectId}/libro-obra/${log.id}`,
      });
  for (const cert of data.certifications) {
    if (dateKey(cert.issueDate ?? cert.periodEnd) > dateTo) continue;
    if (cert.status === "ISSUED")
      pending.push({
        id: `approve-${cert.id}`,
        kind: "CERTIFICATION_APPROVAL",
        title: `Certificación ${cert.number} pendiente de aprobación`,
        detail: "Emitida; resta la aprobación del cliente.",
        href: `/proyectos/${projectId}/certificaciones/${cert.id}`,
      });
    if (access.ar && cert.status === "APPROVED" && !cert.salesInvoices.length)
      pending.push({
        id: `invoice-${cert.id}`,
        kind: "INVOICE_PENDING",
        title: `Certificación ${cert.number} sin factura emitida`,
        detail: "Aprobada; revisar la facturación correspondiente.",
        href: `/proyectos/${projectId}/certificaciones/${cert.id}`,
        amount: money(cert.totalAmount),
      });
  }
  const today = formatCalendarDate(calendarPartsInTimeZone());
  const parentIds = new Set(data.scheduleItems.map((i) => i.parentId).filter(Boolean));
  const leaves = data.scheduleItems.filter((i) => !parentIds.has(i.id));
  const tasks = leaves.filter((i) => i.type === "TASK");
  for (const task of tasks) {
    if (task.status === "BLOCKED")
      pending.push({
        id: `blocked-${task.id}`,
        kind: "SCHEDULE_BLOCKED",
        title: task.name,
        detail: task.blockReason ?? "Tarea bloqueada.",
        href: `/proyectos/${projectId}/cronograma`,
      });
    if (task.endDate && dateKey(task.endDate) < today && task.status !== "COMPLETED")
      pending.push({
        id: `late-${task.id}`,
        kind: "SCHEDULE_DELAYED",
        title: task.name,
        detail: "Tarea vigente con fecha fin vencida y todavía sin completar.",
        date: dateKey(task.endDate),
        href: `/proyectos/${projectId}/cronograma`,
      });
  }
  const financial = financialAt(dateTo);
  if (financial.overdueBalance && new Prisma.Decimal(financial.overdueBalance).gt(0))
    pending.push({
      id: "overdue-ar",
      kind: "RECEIVABLE_OVERDUE",
      title: "Saldo de clientes vencido al corte",
      detail: "Facturas emitidas menos cobranzas y notas de crédito aplicadas hasta el corte.",
      href: `/proyectos/${projectId}/cuentas-por-cobrar`,
      amount: financial.overdueBalance,
    });
  if (costData.unallocatedCount) {
    warnings.push(
      `${costData.unallocatedCount} línea(s) de costo sin EDT no integran los indicadores del alcance; revisá su imputación.`,
    );
    pending.push({
      id: "cost-unallocated",
      kind: "COST_UNALLOCATED",
      title: "Costos sin imputación a una partida",
      detail: "Los importes sin vínculo EDT quedan fuera del avance contractual por partida.",
      href: `/proyectos/${projectId}/control-costos`,
    });
  }
  const series = [];
  let cursor = `${dateFrom.slice(0, 7)}-01`;
  while (cursor <= dateTo) {
    const next = new Date(`${cursor}T00:00:00Z`);
    next.setUTCMonth(next.getUTCMonth() + 1);
    const end = new Date(next);
    end.setUTCDate(end.getUTCDate() - 1);
    const cut = dateKey(end) < dateTo ? dateKey(end) : dateTo;
    const f = financialAt(cut);
    const p = coverageAt(cut);
    const planPoint = aggregateProjectProgressCoverage(planAt(cut));
    series.push({
      periodKey: cursor.slice(0, 7),
      periodLabel: monthLabel(cursor.slice(0, 7)),
      physicalPct: p.pct,
      physicalObservedPct: p.observedPct,
      physicalCoveragePct: p.coveragePct,
      planPct: planPoint.pct,
      planObservedPct: planPoint.observedPct,
      certified: f.certified,
      invoiced: f.invoiced,
      collected: f.collected,
      costAccrued: f.costAccrued,
      costExposure: f.costExposure,
      costPaid: f.costPaid,
    });
    cursor = dateKey(next);
  }
  const opening = financialAt(openingCut);
  const latest = (dates: string[]) =>
    dates
      .filter((date) => date <= dateTo)
      .sort()
      .at(-1) ?? null;
  const validJobsiteNodes = new Set(
    physicalAt(dateTo)
      .filter(({ value }) => value.pct != null)
      .map(({ node }) => node.id),
  );
  const sourceDates = {
    jobsite: access.jobsite
      ? latest(
          data.logs
            .filter(
              (log) =>
                log.status === "APPROVED" &&
                log.progress.some((progress) => validJobsiteNodes.has(progress.wbsNodeId)),
            )
            .map((log) => dateKey(log.logDate)),
        )
      : null,
    certifications: access.certifications
      ? latest(activeCerts.map((cert) => dateKey(cert.issueDate ?? cert.periodEnd)))
      : null,
    invoices: arAvailable
      ? latest(nativeInvoices.map((invoice) => dateKey(invoice.issueDate)))
      : null,
    collections: arAvailable
      ? latest(
          nativeInvoices.flatMap(
            (invoice) =>
              invoice.receivable?.collections
                .filter((collection) => collection.currency === currency)
                .map((collection) => dateKey(collection.collectionDate)) ?? [],
          ),
        )
      : null,
    costs: costsAvailable ? latest(costData.events.map((event) => event.date)) : null,
  };
  const durationWeight = leaves.reduce(
    (sum, item) => sum.plus(item.durationDays && item.durationDays > 0 ? item.durationDays : 1),
    ZERO,
  );
  const scheduleWeighted = leaves.reduce(
    (sum, item) =>
      sum.plus(
        item.progressPct.mul(item.durationDays && item.durationDays > 0 ? item.durationDays : 1),
      ),
    ZERO,
  );
  return {
    type: "REPORT",
    projectId,
    projectName: baseline.project.name,
    dateFrom,
    dateTo,
    currency,
    availableCurrencies,
    availableBudgets: baseline.budgets.map(({ id, name, status, currency: budgetCurrency }) => ({
      id,
      name,
      status,
      currency: budgetCurrency,
    })),
    budgetIds,
    budgetName:
      budgets.length === 1 ? budgets[0]!.name : `Alcance vigente · ${budgets.length} presupuestos`,
    physical,
    plan,
    schedule: {
      progressPct: durationWeight.gt(0) ? rate(scheduleWeighted.div(durationWeight)) : null,
      totalTasks: tasks.length,
      completedTasks: tasks.filter((t) => t.status === "COMPLETED").length,
      delayedTasks: tasks.filter(
        (t) => t.endDate && dateKey(t.endDate) < today && t.status !== "COMPLETED",
      ).length,
      blockedTasks: tasks.filter((t) => t.status === "BLOCKED").length,
    },
    financial,
    opening: {
      certified: opening.certified,
      invoiced: opening.invoiced,
      collected: opening.collected,
      costAccrued: opening.costAccrued,
      costExposure: opening.costExposure,
      costPaid: opening.costPaid,
      physicalObservedPct: coverageAt(openingCut).observedPct,
    },
    series,
    rows,
    pending: pending.sort((a, b) => {
      const priorities: Record<string, number> = {
        COST_OVERRUN: 0,
        RECEIVABLE_OVERDUE: 1,
        SCHEDULE_BLOCKED: 2,
        SCHEDULE_DELAYED: 3,
        PHYSICAL_MISSING: 4,
        JOBSITE_PENDING: 5,
        CERTIFICATION_APPROVAL: 6,
        INVOICE_PENDING: 7,
        CERTIFICATION_PENDING: 8,
        COST_UNALLOCATED: 9,
        PHYSICAL_REMAINING: 10,
      };
      return (priorities[a.kind] ?? 20) - (priorities[b.kind] ?? 20);
    }),
    notes,
    sourceDates,
    warnings,
    sectionsExcluded,
  };
}
