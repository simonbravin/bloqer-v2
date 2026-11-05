import { Prisma, prisma, type CostCategory } from "@bloqer/database";

import {
  saveCertificationMeasurementSchema,
  type SaveCertificationMeasurementInput,
} from "@bloqer/validators";
import { log } from "../audit/audit.service";
import { canViewArProjectArea } from "../ar/ar-access";
import { getTenantModuleGate } from "../tenant-modules/tenant-module.service";
import { sortByWbsCode } from "../budget/wbs-code-rules";
import { getProjectCostControl } from "../cost-control/cost-control.service";
import type { CostControlRow } from "../cost-control/cost-control-types";
import {
  serializeMoneyDecimal,
  serializeQtyDecimal,
  serializeRatePctDecimal,
  serializeUnitPriceDecimal,
  toMoneyDecimal,
} from "../finance/money-decimal";
import { assertProjectAllowsOperationalMutation } from "../project/project-operational-guard";
import { isCrossCompany } from "../company-scope";
import { canViewJobsiteLogArea } from "../jobsite-log/jobsite-log-access";
import { canViewProcurementProjectArea } from "../procurement/procurement-access";
import { ServiceContext, ServiceError } from "../types";
import {
  _validateCertificationMeasurement,
  _lockEditableCertification,
  _recalcCertificationTotals,
} from "./certification-calc.service";
import { assertCertificationStatusEditable } from "./certification-guards";
import {
  authorizeCertification,
  assertCertificationNode,
  requireCertificationAccess,
} from "./certification-scope";
import {
  aggregateJobsiteProgress,
  emptyJobsiteProgress,
  parseMeasurementPhysicalPct,
  parseMeasurementQty,
  certificationQtyPct,
  suggestCertificationFromProgress,
  suggestPendingPhysicalPct,
  type JobsiteProgressTotals,
} from "./certification-measurement-pure";
import { getCertificationProcurementProgress } from "./certification-procurement-progress";

export type CertificationMeasurementGroup = {
  id: string;
  parentId: string | null;
  code: string;
  name: string;
};

export type CertificationMeasurementSuggestion = {
  source: "PHYSICAL" | "PURCHASED" | "RECEIVED";
  progressPct: string | null;
  quantity: string | null;
  percentage: string | null;
  amount: string | null;
};

export type CertificationMeasurementCost = {
  committedCost: string;
  /** Informational layer only; D-124 preserves unknown stock valuation. */
  consumedCost: string | null;
  laborCost: string;
  equipmentCost: string;
  subcontractCost: string;
};

export type CertificationMeasurementRow = {
  wbsNodeId: string;
  parentId: string | null;
  code: string;
  name: string;
  unit: string;
  budgetQty: string;
  previousQty: string;
  previousPhysicalPct: string;
  previousPct: string | null;
  currentAmount: string | null;
  remainingQty: string;
  unitSalePrice: string;
  logQtyAcum: string | null;
  logPctAcum: string | null;
  logQtyPeriod: string | null;
  logPctPeriod: string | null;
  /** Cumulative approved physical progress minus previously certified quantity. */
  suggestedQty: string | null;
  /** Pending physical percentage after subtracting previous certificates. */
  suggestedPhysicalPct: string | null;
  suggestions: CertificationMeasurementSuggestion[];
  cost: CertificationMeasurementCost | null;
  lineId: string | null;
  currentQty: string | null;
  physicalPct: string | null;
};

export type CertificationMeasurementSheet = {
  certificationId: string;
  periodStart: string;
  periodEnd: string;
  currency: string;
  /** Changes on every save so the planilla can soltar el bloqueo de refresco. */
  revision: string;
  costAvailable: boolean;
  progressAvailable: boolean;
  sourceWarnings: string[];
  groups: CertificationMeasurementGroup[];
  rows: CertificationMeasurementRow[];
};

export type CertificationCollectionAccount = {
  id: string;
  accountName: string;
  amount: string;
};

function utcDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function bucketCommitted(row: CostControlRow, category: CostCategory): string {
  return row.byCostType.find((b) => b.costType === category)?.committedCost ?? "0.00";
}

function costFromRow(row: CostControlRow): CertificationMeasurementCost {
  return {
    committedCost: row.committedCost,
    consumedCost: row.inventoryConsumedCost,
    laborCost: bucketCommitted(row, "LABOR"),
    equipmentCost: bucketCommitted(row, "EQUIPMENT"),
    subcontractCost: bucketCommitted(row, "SUBCONTRACT"),
  };
}

/**
 * Measurement sheet for draft editing or issued document review.
 * Contract remainder, approved jobsite log (cumulative and in-period), and period cost layers.
 * Cost stays null when the caller cannot read control de costos. Nothing here is persisted.
 */
export async function getCertificationMeasurementSheet(
  certificationId: string,
  ctx: ServiceContext,
): Promise<CertificationMeasurementSheet> {
  await authorizeCertification(ctx, "VIEW");

  const cert = await requireCertificationAccess(certificationId, ctx);
  const documentCtx = {
    ...ctx,
    companyId: cert.companyId ?? cert.budget.companyId ?? cert.project.companyId ?? ctx.companyId,
  };
  const gate = await getTenantModuleGate(ctx);
  const progressAvailable = gate.isEnabled("JOBSITE_LOG") && canViewJobsiteLogArea(ctx.roles);
  const sourceWarnings: string[] = [];
  if (!progressAvailable)
    sourceWarnings.push(
      "Libro de obra no disponible para esta consulta; no se muestra como avance cero.",
    );
  if (!gate.isEnabled("PROCUREMENT") || !canViewProcurementProjectArea(ctx.roles))
    sourceWarnings.push(
      "Compras y recepciones no disponibles para esta consulta; no se calculan sus sugerencias.",
    );

  const periodStart = utcDateKey(cert.periodStart);
  const periodEnd = utcDateKey(cert.periodEnd);

  const allNodes = sortByWbsCode(
    await prisma.wbsNode.findMany({
      where: { budgetId: cert.budgetId, budget: { tenantId: ctx.tenantId } },
      select: {
        id: true,
        budgetId: true,
        parentId: true,
        type: true,
        code: true,
        name: true,
        costItem: {
          select: {
            budgetId: true,
            wbsNodeId: true,
            unit: true,
            quantity: true,
            unitSalePrice: true,
            totalCostDirect: true,
          },
        },
      },
    }),
  );
  const nodes = allNodes.filter((node) => node.type === "ITEM" && node.costItem);
  for (const node of nodes) assertCertificationNode(node, cert.budgetId);
  const nodeIds = nodes.map((n) => n.id);

  const previousRows =
    nodeIds.length > 0
      ? await prisma.certificationLine.findMany({
          where: {
            wbsNodeId: { in: nodeIds },
            certificationId: { not: cert.id },
            certification: {
              tenantId: ctx.tenantId,
              status: { in: ["ISSUED", "APPROVED"] },
            },
          },
          select: { wbsNodeId: true, currentQty: true, physicalPct: true },
        })
      : [];
  const previousByWbs = new Map<string, Prisma.Decimal>();
  const previousPhysicalByWbs = new Map<string, Prisma.Decimal>();
  for (const row of previousRows) {
    const prev = previousByWbs.get(row.wbsNodeId) ?? new Prisma.Decimal(0);
    previousByWbs.set(row.wbsNodeId, prev.plus(row.currentQty));
    previousPhysicalByWbs.set(
      row.wbsNodeId,
      (previousPhysicalByWbs.get(row.wbsNodeId) ?? new Prisma.Decimal(0)).plus(row.physicalPct),
    );
  }

  const progressRows =
    progressAvailable && nodeIds.length > 0
      ? await prisma.jobsiteLogProgress.findMany({
          where: {
            wbsNodeId: { in: nodeIds },
            jobsiteLog: {
              projectId: cert.projectId,
              tenantId: ctx.tenantId,
              ...(documentCtx.companyId ? { companyId: documentCtx.companyId } : {}),
              status: "APPROVED",
              logDate: { lte: cert.periodEnd },
            },
          },
          select: {
            wbsNodeId: true,
            quantityCompleted: true,
            physicalPct: true,
            jobsiteLog: {
              select: { tenantId: true, companyId: true, projectId: true, logDate: true },
            },
            wbsNode: { select: { budgetId: true } },
          },
        })
      : [];
  for (const row of progressRows) {
    if (
      row.jobsiteLog.tenantId !== ctx.tenantId ||
      row.jobsiteLog.projectId !== cert.projectId ||
      isCrossCompany(row.jobsiteLog.companyId, documentCtx) ||
      row.wbsNode.budgetId !== cert.budgetId
    )
      throw new ServiceError(
        "CONFLICT",
        "El avance del libro de obra tiene relaciones inconsistentes",
      );
  }
  const progressByWbs = aggregateJobsiteProgress(
    progressRows.map((p) => ({
      wbsNodeId: p.wbsNodeId,
      logDate: utcDateKey(p.jobsiteLog.logDate),
      quantityCompleted: p.quantityCompleted.toString(),
      physicalPct: p.physicalPct == null ? null : p.physicalPct.toString(),
    })),
    periodStart,
    periodEnd,
  );

  const costByWbs = new Map<string, CertificationMeasurementCost>();
  let costAvailable = false;
  if (cert.status === "DRAFT")
    try {
      const report = await getProjectCostControl(
        cert.projectId,
        { budgetId: cert.budgetId, dateFrom: periodStart, dateTo: periodEnd },
        documentCtx,
      );
      if (report.type === "REPORT") {
        costAvailable = true;
        sourceWarnings.push(...report.warnings);
        for (const row of report.rows) costByWbs.set(row.wbsNodeId, costFromRow(row));
      }
    } catch (err) {
      // The certificate must open even when the cost report cannot. Cost stays blank.
      if (!(err instanceof ServiceError) || err.code !== "FORBIDDEN") throw err;
      sourceWarnings.push("Control de costos no disponible para esta consulta.");
    }

  const ownByWbs = new Map(cert.lines.map((l) => [l.wbsNodeId, l]));
  const procurement =
    cert.status === "DRAFT"
      ? await getCertificationProcurementProgress(
          {
            projectId: cert.projectId,
            periodEnd: cert.periodEnd,
            currency: cert.budget.currency,
            items: nodes.map((node) => ({
              id: node.id,
              budgetCost: node.costItem!.totalCostDirect,
            })),
          },
          documentCtx,
        )
      : new Map<string, { purchasedPct: string | null; receivedPct: string | null }>();
  const rows: CertificationMeasurementRow[] = [];
  for (const n of nodes) {
    if (!n.costItem) continue;
    const own = ownByWbs.get(n.id);
    if (cert.status !== "DRAFT" && !own) continue;
    const previousQty =
      cert.status !== "DRAFT" && own
        ? own.previousQty
        : (previousByWbs.get(n.id) ?? new Prisma.Decimal(0));
    const budgetQty = cert.status !== "DRAFT" && own ? own.budgetQty : n.costItem.quantity;
    const remaining = Prisma.Decimal.max(new Prisma.Decimal(0), budgetQty.minus(previousQty));
    const progress: JobsiteProgressTotals = progressByWbs.get(n.id) ?? emptyJobsiteProgress();
    const unitSalePrice = serializeUnitPriceDecimal(
      own?.unitSalePriceSnapshot ?? n.costItem.unitSalePrice,
    );
    const previousPhysicalPct = serializeRatePctDecimal(
      previousPhysicalByWbs.get(n.id) ?? new Prisma.Decimal(0),
    );
    const physicalProgressPct = !progress.hasProgress
      ? null
      : progress.hasPhysicalPct
        ? progress.pctAcum
        : certificationQtyPct(progress.qtyAcum, budgetQty.toString());
    const sources = [
      { source: "PHYSICAL" as const, progressPct: physicalProgressPct },
      { source: "PURCHASED" as const, progressPct: procurement.get(n.id)?.purchasedPct ?? null },
      { source: "RECEIVED" as const, progressPct: procurement.get(n.id)?.receivedPct ?? null },
    ];
    const suggestions = sources.map((source) => ({
      ...source,
      ...(suggestCertificationFromProgress({
        progressPct: source.progressPct,
        budgetQty: budgetQty.toString(),
        previousQty: previousQty.toString(),
        unitSalePrice,
      }) ?? { quantity: null, percentage: null, amount: null }),
    }));
    const remainingQty = serializeQtyDecimal(remaining);
    rows.push({
      wbsNodeId: n.id,
      parentId: n.parentId,
      code: n.code,
      name: n.name,
      unit: n.costItem.unit,
      budgetQty: serializeQtyDecimal(budgetQty),
      previousQty: serializeQtyDecimal(previousQty),
      previousPhysicalPct,
      previousPct: certificationQtyPct(previousQty.toString(), budgetQty.toString()),
      currentAmount: own ? serializeMoneyDecimal(own.periodAmount) : null,
      remainingQty,
      unitSalePrice,
      logQtyAcum: progressAvailable ? progress.qtyAcum : null,
      logPctAcum: progressAvailable ? progress.pctAcum : null,
      logQtyPeriod: progressAvailable ? progress.qtyPeriod : null,
      logPctPeriod: progressAvailable ? progress.pctPeriod : null,
      suggestedQty: suggestions[0]!.quantity,
      suggestedPhysicalPct: suggestPendingPhysicalPct(physicalProgressPct, previousPhysicalPct),
      suggestions,
      cost: costAvailable
        ? (costByWbs.get(n.id) ?? {
            committedCost: "0.00",
            consumedCost: "0.00",
            laborCost: "0.00",
            equipmentCost: "0.00",
            subcontractCost: "0.00",
          })
        : null,
      lineId: own?.id ?? null,
      currentQty: own ? serializeQtyDecimal(own.currentQty) : null,
      physicalPct: own ? serializeRatePctDecimal(own.physicalPct) : null,
    });
  }

  return {
    certificationId: cert.id,
    periodStart,
    periodEnd,
    currency: cert.budget.currency,
    revision: cert.updatedAt.toISOString(),
    costAvailable,
    progressAvailable,
    sourceWarnings,
    groups: allNodes
      .filter((node) => node.type !== "ITEM")
      .map(({ id, parentId, code, name }) => ({ id, parentId, code, name })),
    rows,
  };
}

/**
 * Persist included worksheet rows in one transaction.
 * Reuses the line math of add/update (sale-price snapshot, previous qty, period amount).
 * An included row with quantity 0 is rejected and writes nothing.
 */
export async function saveCertificationMeasurement(
  input: SaveCertificationMeasurementInput,
  ctx: ServiceContext,
): Promise<void> {
  await authorizeCertification(ctx, "EDIT");

  const parsed = saveCertificationMeasurementSchema.safeParse(input);
  if (!parsed.success)
    throw new ServiceError("VALIDATION", parsed.error.issues[0]?.message ?? "Datos inválidos");
  input = parsed.data;
  const seen = new Set<string>();
  for (const row of input.rows) {
    if (seen.has(row.wbsNodeId)) {
      throw new ServiceError("VALIDATION", "Hay una partida repetida en la planilla");
    }
    seen.add(row.wbsNodeId);
    if (!row.included) continue;
    if (!parseMeasurementQty(row.currentQty)) {
      throw new ServiceError(
        "VALIDATION",
        "Indicá una cantidad mayor a 0 en cada partida incluida. Las filas en cero no se guardan.",
      );
    }
    if (parseMeasurementPhysicalPct(row.physicalPct) == null) {
      throw new ServiceError("VALIDATION", "El % físico debe estar entre 0 y 100");
    }
  }

  const cert = await requireCertificationAccess(input.certificationId, ctx);
  await assertProjectAllowsOperationalMutation(cert.projectId, ctx);
  assertCertificationStatusEditable(cert.status);

  await prisma.$transaction(
    async (tx) => {
      const current = await _lockEditableCertification(tx, cert.id, ctx, input.expectedRevision);
      const existing = await tx.certificationLine.findMany({
        where: { certificationId: cert.id },
      });
      const existingByWbs = new Map(existing.map((l) => [l.wbsNodeId, l]));
      const reordersAllLines = existing.every((line) => seen.has(line.wbsNodeId));
      let sortOrder = 0;
      let appendSort = existing.reduce((max, line) => Math.max(max, line.sortOrder), 0);

      for (const row of input.rows) {
        const line = existingByWbs.get(row.wbsNodeId);
        if (!row.included) {
          if (line) await tx.certificationLine.delete({ where: { id: line.id } });
          continue;
        }

        const currentQty = new Prisma.Decimal(parseMeasurementQty(row.currentQty)!);
        const physicalPct = new Prisma.Decimal(parseMeasurementPhysicalPct(row.physicalPct)!);
        const { previousQty, budgetQty, costItem } = await _validateCertificationMeasurement(
          tx,
          cert,
          row.wbsNodeId,
          currentQty,
          physicalPct,
        );
        const order = reordersAllLines ? ++sortOrder : (line?.sortOrder ?? ++appendSort);

        if (line) {
          const periodAmount = toMoneyDecimal(currentQty.times(line.unitSalePriceSnapshot));
          await tx.certificationLine.update({
            where: { id: line.id },
            data: {
              physicalPct,
              budgetQty,
              currentQty,
              previousQty,
              cumulativeQty: previousQty.plus(currentQty),
              periodAmount,
              sortOrder: order,
            },
          });
          continue;
        }

        const unitSalePriceSnapshot = costItem.unitSalePrice;
        await tx.certificationLine.create({
          data: {
            certificationId: cert.id,
            wbsNodeId: row.wbsNodeId,
            unitSalePriceSnapshot,
            budgetQty,
            physicalPct,
            previousQty,
            currentQty,
            cumulativeQty: previousQty.plus(currentQty),
            periodAmount: toMoneyDecimal(currentQty.times(unitSalePriceSnapshot)),
            sortOrder: order,
          },
        });
      }

      await _recalcCertificationTotals(tx, cert.id, ctx.actorUserId);
      await log(
        {
          tenantId: ctx.tenantId,
          companyId: current.companyId,
          projectId: current.projectId,
          actorUserId: ctx.actorUserId,
          action: "certification.measurement_saved",
          entityType: "Certification",
          entityId: cert.id,
          after: { rows: input.rows.length },
          ipAddress: ctx.ipAddress,
        },
        tx,
      );
    },
    { timeout: 30_000, maxWait: 10_000 },
  );
}

/** Confirmed collections of the active sales invoice, for the read-only money trail. */
export async function listCertificationCollectionAccounts(
  certificationId: string,
  ctx: ServiceContext,
): Promise<CertificationCollectionAccount[]> {
  await authorizeCertification(ctx, "VIEW");
  if (!canViewArProjectArea(ctx.roles)) return [];
  if (!(await getTenantModuleGate(ctx)).isEnabled("AR")) return [];

  const cert = await requireCertificationAccess(certificationId, ctx);
  const documentCtx = {
    ...ctx,
    companyId: cert.companyId ?? cert.budget.companyId ?? cert.project.companyId ?? ctx.companyId,
  };

  const collections = await prisma.collection.findMany({
    where: {
      tenantId: ctx.tenantId,
      status: "CONFIRMED",
      ...(documentCtx.companyId ? { companyId: documentCtx.companyId } : {}),
      projectId: cert.projectId,
      salesInvoice: {
        certificationId,
        tenantId: ctx.tenantId,
        projectId: cert.projectId,
        ...(documentCtx.companyId ? { companyId: documentCtx.companyId } : {}),
        status: { not: "CANCELLED" },
      },
    },
    select: {
      id: true,
      amount: true,
      currency: true,
      salesInvoiceId: true,
      companyId: true,
      tenantId: true,
      projectId: true,
      salesInvoice: {
        select: {
          tenantId: true,
          companyId: true,
          projectId: true,
          certificationId: true,
          currency: true,
        },
      },
      receivable: {
        select: {
          tenantId: true,
          companyId: true,
          projectId: true,
          salesInvoiceId: true,
          currency: true,
        },
      },
      account: { select: { name: true, tenantId: true, companyId: true, currency: true } },
    },
    orderBy: { collectionDate: "asc" },
  });

  for (const collection of collections) {
    if (
      collection.account.tenantId !== ctx.tenantId ||
      collection.salesInvoice?.tenantId !== ctx.tenantId ||
      collection.salesInvoice.projectId !== cert.projectId ||
      collection.salesInvoice.companyId !== collection.companyId ||
      collection.salesInvoice.certificationId !== cert.id ||
      collection.receivable.tenantId !== ctx.tenantId ||
      collection.receivable.companyId !== collection.companyId ||
      collection.receivable.projectId !== cert.projectId ||
      collection.receivable.salesInvoiceId !== collection.salesInvoiceId ||
      (collection.account.companyId !== null &&
        collection.account.companyId !== collection.companyId) ||
      collection.account.currency !== collection.currency ||
      collection.salesInvoice.currency !== collection.currency ||
      collection.salesInvoice.currency !== cert.budget.currency ||
      collection.receivable.currency !== collection.currency
    )
      throw new ServiceError(
        "CONFLICT",
        "La cobranza vinculada contiene relaciones inconsistentes",
      );
  }
  return collections.map((c) => ({
    id: c.id,
    accountName: c.account.name,
    amount: serializeMoneyDecimal(c.amount),
  }));
}
