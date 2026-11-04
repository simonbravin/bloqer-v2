import { Prisma, prisma, type PurchaseRequest, type CostCategory } from "@bloqer/database";
import type { CreatePurchaseRequestInput, UpdatePurchaseRequestInput } from "@bloqer/validators";
import { auditProcurement } from "./procurement-audit";
import { assertProcurementTenantModule } from "../tenant-modules/tenant-module-enforcement";
import { ServiceContext, ServiceError } from "../types";
import { canEditPurchaseRequests, canViewPurchaseRequests } from "./procurement-access";
import { assertOptimisticRowUpdate } from "../finance/optimistic-lock";
import { assertProjectAllowsOperationalMutation, lockProjectForOperationalMutation } from "../project/project-operational-guard";
import { requireProjectAccess } from "../security/access";
import { isCrossCompany } from "../company-scope";
import { assertPurchaseRequestScope } from "./purchase-request-scope";
import { assertCostAnalysisLineForWbs, assertWbsLineForProject, lockProcurementCompanyForNumbering } from "./procurement-wbs";
import { loadWbsDominantCostTypes, coerceFreeTextGoodsCostType, resolveLineCostType } from "../cost-control/cost-type";
import {
  assertWbsRequiredOnLines,
  budgetBaselineForPurchaseLine,
} from "./procurement-budget-baseline";
import {
  notifyPurchaseRequestReturned,
  notifyPurchaseRequestSubmitted,
} from "./procurement-notifications.service";
import {
  serializeMoneyDecimal,
  serializeQtyDecimal,
  serializeUnitPriceDecimal,
} from "../finance/money-decimal";
import {
  computeEstimatedAmount,
  computeLineSummaries,
  type PurchaseRequestEstimatedAmountSource,
} from "./purchase-request-list-enrichment";
import {
  resolveUserDisplayNames,
  userDisplayNameFromMap,
} from "../user/resolve-user-display-names";
import {
  assertPurchaseRequestReturnable,
} from "./purchase-request-return-guards";

export type PurchaseRequestLineView = {
  id: string;
  wbsNodeId: string | null;
  wbsNodeCode: string | null;
  wbsNodeName: string | null;
  productId: string | null;
  costAnalysisLineId: string | null;
  costType: string;
  lineType: string;
  description: string;
  unit: string;
  quantity: string;
  budgetUnitCostSnapshot: string | null;
  /** Native currency of the verified owning budget, including multi-WBS SCs. */
  budgetCurrency: string | null;
  /** APU unit cost from costAnalysisLine (for DRAFT estimate before submit snapshot). */
  apuUnitCost: string | null;
  /** Active award PO id when this line is covered ([BR-PUR-024]). */
  awardedPurchaseOrderId: string | null;
};

export type { PurchaseRequestEstimatedAmountSource };

export type PurchaseRequestView = Omit<PurchaseRequest, never> & {
  code: string;
  requestedByName: string | null;
  selectedSupplierName: string | null;
  lines: PurchaseRequestLineView[];
  /** Σ qty × ref. APU (insumos ligados) or selected quote total when available. */
  estimatedAmount: string | null;
  estimatedAmountCurrency: string | null;
  estimatedAmountSource: PurchaseRequestEstimatedAmountSource | null;
  primaryWbsNodeCode: string | null;
  primaryWbsNodeName: string | null;
  hasMultipleWbs: boolean;
  linesCount: number;
  firstLineDescription: string | null;
};

async function resolveCompanyId(
  projectId: string, ctx: ServiceContext, db: Prisma.TransactionClient = prisma,
): Promise<string> {
  const project = await db.project.findFirst({
    where: { id: projectId, tenantId: ctx.tenantId },
    select: { companyId: true },
  });
  if (!project) throw new ServiceError("NOT_FOUND", "Proyecto no encontrado");
  if (isCrossCompany(project.companyId, ctx)) {
    throw new ServiceError("CONFLICT", "La empresa activa no coincide con la del proyecto");
  }
  const companyId = ctx.companyId ?? project.companyId;
  if (!companyId) {
    throw new ServiceError("CONFLICT", "Esta obra compartida requiere un contexto de empresa para crear la solicitud");
  }
  const company = await db.company.findFirst({ where: { id: companyId, tenantId: ctx.tenantId }, select: { id: true } });
  if (!company) throw new ServiceError("NOT_FOUND", "Empresa no encontrada");
  return companyId;
}

async function nextDocumentNumber(
  tx: Prisma.TransactionClient,
  tenantId: string,
  companyId: string,
): Promise<number> {
  // Numeration is company-wide, including requests created in different projects.
  await lockProcurementCompanyForNumbering(tx, companyId, tenantId);
  const max = await tx.purchaseRequest.aggregate({
    where: { tenantId, companyId },
    _max: { number: true },
  });
  return (max._max.number ?? 0) + 1;
}

type SelectedQuoteForList = {
  totalAmount: Prisma.Decimal;
  currency: string;
};

function serialize(
  pr: PurchaseRequest & { lines: PurchaseRequestLineView[] },
  requestedByName: string | null = null,
  selectedSupplierName: string | null = null,
  selectedQuote: SelectedQuoteForList | null = null,
  activeOrderTotalsArs: string[] | null = null,
  lineBudgetCurrencies: ReadonlyMap<string, string> = new Map(),
): PurchaseRequestView {
  const summaries = computeLineSummaries(pr.lines);
  const estimated = computeEstimatedAmount(
    pr,
    pr.lines.map((l) => ({
      wbsNodeId: l.wbsNodeId,
      wbsNodeCode: l.wbsNodeCode,
      wbsNodeName: l.wbsNodeName,
      costAnalysisLineId: l.costAnalysisLineId,
      description: l.description,
      quantity: l.quantity,
      budgetUnitCostSnapshot: l.budgetUnitCostSnapshot,
      apuUnitCost: l.apuUnitCost,
      budgetCurrency: lineBudgetCurrencies.get(l.id) ?? null,
    })),
    selectedQuote
      ? {
          totalAmount: serializeMoneyDecimal(selectedQuote.totalAmount),
          currency: selectedQuote.currency,
        }
      : null,
    activeOrderTotalsArs,
  );
  return {
    ...pr,
    code: `SC-${String(pr.number).padStart(3, "0")}`,
    requestedByName,
    selectedSupplierName,
    lines: pr.lines,
    ...summaries,
    ...estimated,
  };
}

const prLineInclude = {
  orderBy: { sortOrder: "asc" as const },
  include: {
    wbsNode: { select: { id: true, budgetId: true, code: true, name: true, budget: { select: { id: true, tenantId: true, companyId: true, projectId: true, currency: true } } } },
    costAnalysisLine: { select: { budgetId: true, unit: true, unitCost: true, costItem: { select: { budgetId: true, wbsNodeId: true } } } },
    product: { select: { tenantId: true, companyId: true } },
    awardedPurchaseOrder: { select: { tenantId: true, companyId: true, projectId: true, purchaseRequestId: true } },
  },
};

const selectedQuoteInclude = {
  where: { status: "SELECTED" as const },
  select: {
    tenantId: true,
    totalAmount: true,
    currency: true,
    supplierContact: { select: { tenantId: true, legalName: true, fantasyName: true } },
  },
};

const activePoForEstimateInclude = {
  where: { status: { not: "CANCELLED" as const } },
  select: {
    tenantId: true, companyId: true, projectId: true,
    totalAmountArs: true,
    supplierContact: { select: { tenantId: true, legalName: true, fantasyName: true } },
  },
};

type RequestReadRow = Prisma.PurchaseRequestGetPayload<{
  include: { lines: typeof prLineInclude; quotes: typeof selectedQuoteInclude; purchaseOrders: typeof activePoForEstimateInclude };
}>;

/** Guard every joined source before exposing names, APU references or estimates. */
function assertRequestReadRelations(request: RequestReadRow): void {
  const inconsistent = () => { throw new ServiceError("CONFLICT", "La solicitud contiene relaciones inconsistentes; revisá sus documentos de origen"); };
  for (const line of request.lines) {
    const budget = line.wbsNode?.budget;
    if (line.wbsNodeId && (!budget || budget.tenantId !== request.tenantId || budget.projectId !== request.projectId ||
      (budget.companyId != null && budget.companyId !== request.companyId))) inconsistent();
    if (line.costAnalysisLineId && (!line.costAnalysisLine || !budget ||
      line.costAnalysisLine.budgetId !== budget.id || line.costAnalysisLine.costItem.budgetId !== budget.id ||
      line.costAnalysisLine.costItem.wbsNodeId !== line.wbsNodeId)) inconsistent();
    if (line.productId && (!line.product || line.product.tenantId !== request.tenantId ||
      (line.product.companyId != null && line.product.companyId !== request.companyId))) inconsistent();
    const awarded = line.awardedPurchaseOrder;
    if (line.awardedPurchaseOrderId && (!awarded || awarded.tenantId !== request.tenantId ||
      awarded.companyId !== request.companyId || awarded.projectId !== request.projectId || awarded.purchaseRequestId !== request.id)) inconsistent();
  }
  for (const quote of request.quotes) {
    if (quote.tenantId !== request.tenantId || quote.supplierContact.tenantId !== request.tenantId) inconsistent();
  }
  for (const order of request.purchaseOrders) {
    if (order.tenantId !== request.tenantId || order.companyId !== request.companyId ||
      order.projectId !== request.projectId || order.supplierContact.tenantId !== request.tenantId) inconsistent();
  }
}

function mapPrLines(
  lines: Array<{
    id: string;
    wbsNodeId: string | null;
    productId: string | null;
    costAnalysisLineId: string | null;
    costType: CostCategory | null;
    lineType: string;
    description: string;
    unit: string;
    quantity: Prisma.Decimal;
    budgetUnitCostSnapshot: Prisma.Decimal | null;
    awardedPurchaseOrderId?: string | null;
    wbsNode: { code: string; name: string; budget: { currency: string } } | null;
    costAnalysisLine: { unit: string; unitCost: Prisma.Decimal } | null;
  }>,
): PurchaseRequestLineView[] {
  return lines.map((l) => {
    const comparableApuUnit = !l.costAnalysisLineId || Boolean(l.unit.trim() && l.costAnalysisLine?.unit.trim().toLowerCase() === l.unit.trim().toLowerCase());
    return {
      id: l.id,
      wbsNodeId: l.wbsNodeId,
      wbsNodeCode: l.wbsNode?.code ?? null,
      wbsNodeName: l.wbsNode?.name ?? null,
      productId: l.productId,
      costAnalysisLineId: l.costAnalysisLineId,
      costType: l.costType ?? "MATERIAL",
      lineType: l.lineType,
      description: l.description,
      unit: l.unit,
      quantity: serializeQtyDecimal(l.quantity),
      budgetUnitCostSnapshot: comparableApuUnit && l.budgetUnitCostSnapshot != null ? serializeUnitPriceDecimal(l.budgetUnitCostSnapshot) : null,
      budgetCurrency: l.wbsNode?.budget.currency ?? null,
      apuUnitCost:
        comparableApuUnit && l.costAnalysisLine?.unitCost != null
          ? serializeUnitPriceDecimal(l.costAnalysisLine.unitCost)
          : null,
      awardedPurchaseOrderId: l.awardedPurchaseOrderId ?? null,
    };
  });
}

function selectedQuoteFromRows(
  quotes: Array<{
    totalAmount: Prisma.Decimal;
    currency: string;
    supplierContact: { legalName: string; fantasyName: string | null };
  }>,
): {
  quote: SelectedQuoteForList | null;
  supplierName: string;
} | null {
  if (quotes.length === 0) return null;
  const names = [
    ...new Set(
      quotes.map((q) => q.supplierContact.fantasyName ?? q.supplierContact.legalName),
    ),
  ];
  // Multi-supplier award: full quote totals are not the awarded subset — prefer OC totals.
  if (quotes.length > 1) {
    return {
      quote: null,
      supplierName: names.length > 1 ? "Múltiple" : names[0]!,
    };
  }
  const q = quotes[0]!;
  return {
    quote: { totalAmount: q.totalAmount, currency: q.currency },
    supplierName: names[0]!,
  };
}

function supplierNameFromOrders(
  orders: Array<{ supplierContact: { legalName: string; fantasyName: string | null } }>,
): string | null {
  if (orders.length === 0) return null;
  const names = [
    ...new Set(orders.map((o) => o.supplierContact.fantasyName ?? o.supplierContact.legalName)),
  ];
  if (names.length > 1) return "Múltiple";
  return names[0] ?? null;
}

function assertDraftPr(status: string): void {
  if (status !== "DRAFT") {
    throw new ServiceError("CONFLICT", "Solo se puede editar una solicitud en borrador");
  }
}

async function validateRequestLines(
  lines: Array<{ wbsNodeId: string | null; costAnalysisLineId?: string | null; productId?: string | null }>,
  projectId: string,
  ctx: ServiceContext,
  db: Prisma.TransactionClient,
): Promise<Map<number, CostCategory>> {
  if (lines.length === 0) throw new ServiceError("VALIDATION", "Debe tener al menos una línea");
  assertWbsRequiredOnLines(lines);
  const categories = new Map<number, CostCategory>();
  const checkedWbs = new Set<string>();
  const checkedApu = new Map<string, CostCategory>();
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line.wbsNodeId) throw new ServiceError("CONFLICT", "Cada línea debe tener una partida EDT");
    if (!checkedWbs.has(line.wbsNodeId)) {
      await assertWbsLineForProject(line.wbsNodeId, projectId, ctx.tenantId, { ctx, db });
      checkedWbs.add(line.wbsNodeId);
    }
    if (line.costAnalysisLineId) {
      const key = `${line.wbsNodeId}:${line.costAnalysisLineId}`;
      let category = checkedApu.get(key);
      if (!category) {
        category = await assertCostAnalysisLineForWbs(line.costAnalysisLineId, line.wbsNodeId, ctx.tenantId, { ctx, db });
        checkedApu.set(key, category);
      }
      categories.set(i, category);
    }
  }
  const productIds = [...new Set(lines.map((line) => line.productId).filter((id): id is string => Boolean(id)))];
  if (productIds.length > 0) {
    const products = await db.product.findMany({ where: { id: { in: productIds }, tenantId: ctx.tenantId }, select: { id: true, companyId: true } });
    if (products.length !== productIds.length || products.some((product) => isCrossCompany(product.companyId, ctx))) {
      throw new ServiceError("CONFLICT", "Uno o más productos no pertenecen al alcance de la solicitud");
    }
  }
  return categories;
}

function requestLinesUnchanged(
  input: NonNullable<UpdatePurchaseRequestInput["lines"]>,
  saved: Prisma.PurchaseRequestLineGetPayload<Record<string, never>>[],
): boolean {
  if (input.length !== saved.length) return false;
  const orderedSaved = [...saved].sort((left, right) => left.sortOrder - right.sortOrder);
  const orderedInput = [...input].sort((left, right) => left.sortOrder - right.sortOrder);
  return orderedInput.every((line, index) => {
    const old = orderedSaved[index]!;
    return line.wbsNodeId === old.wbsNodeId && (line.productId ?? null) === old.productId &&
      (line.costAnalysisLineId ?? null) === old.costAnalysisLineId &&
      (line.costType === undefined ? old.costType : line.costType) === old.costType &&
      line.lineType === old.lineType && line.description === old.description && line.unit === old.unit &&
      line.sortOrder === old.sortOrder && serializeQtyDecimal(line.quantity) === serializeQtyDecimal(old.quantity);
  });
}

export async function listPurchaseRequestsByProject(
  projectId: string,
  ctx: ServiceContext,
): Promise<PurchaseRequestView[]> {
  await assertProcurementTenantModule(ctx);
  if (!canViewPurchaseRequests(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos");
  }
  await requireProjectAccess(projectId, ctx);
  const rows = await prisma.purchaseRequest.findMany({
    where: { projectId, tenantId: ctx.tenantId, ...(ctx.companyId ? { companyId: ctx.companyId } : {}) },
    include: {
      lines: prLineInclude,
      quotes: selectedQuoteInclude,
      purchaseOrders: activePoForEstimateInclude,
    },
    orderBy: { number: "desc" },
  });
  rows.forEach(assertRequestReadRelations);
  const nameById = await resolveUserDisplayNames(rows.map((r) => r.requestedByUserId));
  return rows.map((r) => {
    const { quotes, purchaseOrders, ...request } = r;
    const selected = selectedQuoteFromRows(quotes);
    const fromOrders = supplierNameFromOrders(purchaseOrders);
    return serialize(
      {
        ...request,
        lines: mapPrLines(r.lines),
      },
      userDisplayNameFromMap(nameById, r.requestedByUserId),
      fromOrders ?? selected?.supplierName ?? null,
      selected?.quote ?? null,
      purchaseOrders.map((po) => serializeMoneyDecimal(po.totalAmountArs)),
      new Map(r.lines.flatMap((line) => line.wbsNode ? [[line.id, line.wbsNode.budget.currency] as const] : [])),
    );
  });
}

export async function getPurchaseRequestById(id: string, ctx: ServiceContext): Promise<PurchaseRequestView> {
  await assertProcurementTenantModule(ctx);
  if (!canViewPurchaseRequests(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos");
  }
  const pr = await prisma.purchaseRequest.findUnique({
    where: { id },
    include: {
      lines: prLineInclude,
      quotes: selectedQuoteInclude,
      purchaseOrders: activePoForEstimateInclude,
    },
  });
  if (!pr || pr.tenantId !== ctx.tenantId) throw new ServiceError("NOT_FOUND", "Solicitud no encontrada");
  await assertPurchaseRequestScope(pr, ctx, "read");
  assertRequestReadRelations(pr);
  const nameById = await resolveUserDisplayNames([pr.requestedByUserId]);
  const { quotes, purchaseOrders, ...request } = pr;
  const selected = selectedQuoteFromRows(quotes);
  const fromOrders = supplierNameFromOrders(purchaseOrders);
  return serialize(
    {
      ...request,
      lines: mapPrLines(pr.lines),
    },
    userDisplayNameFromMap(nameById, pr.requestedByUserId),
    fromOrders ?? selected?.supplierName ?? null,
    selected?.quote ?? null,
    purchaseOrders.map((po) => serializeMoneyDecimal(po.totalAmountArs)),
    new Map(pr.lines.flatMap((line) => line.wbsNode ? [[line.id, line.wbsNode.budget.currency] as const] : [])),
  );
}

export async function createPurchaseRequest(
  input: CreatePurchaseRequestInput,
  ctx: ServiceContext,
): Promise<PurchaseRequestView> {
  await assertProcurementTenantModule(ctx);
  if (!canEditPurchaseRequests(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para crear solicitudes de compra");
  }
  await assertProjectAllowsOperationalMutation(input.projectId, ctx);
  const companyId = await resolveCompanyId(input.projectId, ctx);

  const pr = await prisma.$transaction(async (tx) => {
    await lockProjectForOperationalMutation(tx, input.projectId, ctx);
    if (await resolveCompanyId(input.projectId, ctx, tx) !== companyId) {
      throw new ServiceError("CONFLICT", "La empresa de la obra cambió. Recargá e intentá de nuevo.");
    }
    const number = await nextDocumentNumber(tx, ctx.tenantId, companyId);
    const lineCtx = { ...ctx, companyId };
    const apuCategoryByIdx = await validateRequestLines(input.lines, input.projectId, lineCtx, tx);
    const wbsIds = [...new Set(input.lines.map((line) => line.wbsNodeId))];
    const wbsDominant = await loadWbsDominantCostTypes(wbsIds, ctx.tenantId, tx);
    const created = await tx.purchaseRequest.create({
      data: {
        tenantId: ctx.tenantId,
        companyId,
        projectId: input.projectId,
        number,
        requestedByUserId: ctx.actorUserId,
        neededByDate: new Date(input.neededByDate),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        createdBy: ctx.actorUserId,
        updatedBy: ctx.actorUserId,
        lines: {
          create: input.lines.map((line, i) => {
            const costType = coerceFreeTextGoodsCostType(
              line.lineType,
              line.costAnalysisLineId,
              resolveLineCostType({
                costType: line.costType ?? null,
                apuCategory: apuCategoryByIdx.get(i) ?? null,
                wbsDominantCostType: line.wbsNodeId ? wbsDominant.get(line.wbsNodeId) ?? null : null,
              }),
            );
            return {
              wbsNodeId: line.wbsNodeId,
              productId: line.productId ?? null,
              costAnalysisLineId: line.costAnalysisLineId ?? null,
              costType,
              lineType: line.lineType,
              description: line.description,
              unit: line.unit ?? "",
              quantity: new Prisma.Decimal(line.quantity),
              sortOrder: line.sortOrder ?? i,
            };
          }),
        },
      },
      include: { lines: { orderBy: { sortOrder: "asc" } } },
    });
    await auditProcurement(
      ctx,
      "purchase_request.created",
      "PurchaseRequest",
      created.id,
      { projectId: created.projectId, companyId: created.companyId },
      { after: { number: created.number }, tx },
    );
    return created;
  }, { maxWait: 10_000, timeout: 30_000 });

  return getPurchaseRequestById(pr.id, ctx);
}

export async function updatePurchaseRequest(
  id: string,
  input: UpdatePurchaseRequestInput,
  ctx: ServiceContext,
): Promise<PurchaseRequestView> {
  await assertProcurementTenantModule(ctx);
  if (!canEditPurchaseRequests(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para editar solicitudes de compra");
  }
  const existing = await prisma.purchaseRequest.findUnique({
    where: { id },
    select: { id: true, tenantId: true, projectId: true, companyId: true, status: true },
  });
  if (!existing || existing.tenantId !== ctx.tenantId) {
    throw new ServiceError("NOT_FOUND", "Solicitud no encontrada");
  }
  await assertPurchaseRequestScope(existing, ctx, "mutate");
  assertDraftPr(existing.status);
  if (input.lines?.length === 0) throw new ServiceError("VALIDATION", "Debe tener al menos una línea");

  await prisma.$transaction(async (tx) => {
    await lockProjectForOperationalMutation(tx, existing.projectId, ctx);
    await tx.$queryRaw`SELECT id FROM purchase_requests WHERE id = ${id} AND "tenantId" = ${ctx.tenantId} FOR UPDATE`;
    const current = await tx.purchaseRequest.findUniqueOrThrow({ where: { id }, include: { lines: { orderBy: { sortOrder: "asc" } } } });
    await assertPurchaseRequestScope(current, ctx, "mutate");
    assertDraftPr(current.status);
    const lineCtx = { ...ctx, companyId: current.companyId };
    const [quoteHistory, linkedOrderLines] = await Promise.all([
      tx.procurementQuote.count({ where: { purchaseRequestId: id } }),
      tx.purchaseOrderLine.count({ where: { purchaseRequestLine: { purchaseRequestId: id } } }),
    ]);
    const preserveHistoricalLines = quoteHistory > 0 || linkedOrderLines > 0;
    if (input.lines && preserveHistoricalLines && !requestLinesUnchanged(input.lines, current.lines)) {
      throw new ServiceError("CONFLICT", "Esta solicitud tiene antecedentes de cotización o compra. Solo podés editar la cabecera; para cambiar ítems, anulala y creá otra.");
    }
    const replaceLines = input.lines && !preserveHistoricalLines ? input.lines : null;
    const apuCategoryByIdx = replaceLines ? await validateRequestLines(replaceLines, current.projectId, lineCtx, tx) : new Map<number, CostCategory>();
    const wbsIds = replaceLines ? [...new Set(replaceLines.map((line) => line.wbsNodeId))] : [];
    const wbsDominant = replaceLines ? await loadWbsDominantCostTypes(wbsIds, ctx.tenantId, tx) : new Map<string, CostCategory>();
    const flipped = await tx.purchaseRequest.updateMany({
      where: { id, tenantId: ctx.tenantId, status: "DRAFT" },
      data: {
        ...(input.neededByDate !== undefined ? { neededByDate: new Date(input.neededByDate) } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        updatedBy: ctx.actorUserId,
      },
    });
    assertOptimisticRowUpdate(
      flipped.count,
      "La solicitud ya no está en borrador. Recargá e intentá de nuevo.",
    );

    if (replaceLines) {
      await tx.purchaseRequestLine.deleteMany({ where: { purchaseRequestId: id } });
      await tx.purchaseRequestLine.createMany({
      data: replaceLines.map((line, i) => {
        const costType = coerceFreeTextGoodsCostType(
          line.lineType,
          line.costAnalysisLineId,
          resolveLineCostType({
            costType: line.costType ?? null,
            apuCategory: apuCategoryByIdx.get(i) ?? null,
            wbsDominantCostType: line.wbsNodeId ? wbsDominant.get(line.wbsNodeId) ?? null : null,
          }),
        );
        return {
          purchaseRequestId: id,
          wbsNodeId: line.wbsNodeId,
          productId: line.productId ?? null,
          costAnalysisLineId: line.costAnalysisLineId ?? null,
          costType,
          lineType: line.lineType,
          description: line.description,
          unit: line.unit ?? "",
          quantity: new Prisma.Decimal(line.quantity),
          sortOrder: line.sortOrder ?? i,
        };
      }),
    });
    }

    await auditProcurement(
      ctx,
      "purchase_request.updated",
      "PurchaseRequest",
      id,
      { projectId: existing.projectId, companyId: existing.companyId },
      { after: { linesCount: replaceLines?.length ?? current.lines.length }, tx },
    );
  }, { maxWait: 10_000, timeout: 30_000 });

  return getPurchaseRequestById(id, ctx);
}

export async function submitPurchaseRequest(id: string, ctx: ServiceContext): Promise<PurchaseRequestView> {
  await assertProcurementTenantModule(ctx);
  if (!canEditPurchaseRequests(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos");
  }
  const existing = await prisma.purchaseRequest.findUnique({
    where: { id },
    include: { lines: true },
  });
  if (!existing || existing.tenantId !== ctx.tenantId) throw new ServiceError("NOT_FOUND", "Solicitud no encontrada");
  await assertPurchaseRequestScope(existing, ctx, "mutate");
  assertDraftPr(existing.status);

  await prisma.$transaction(async (tx) => {
    await lockProjectForOperationalMutation(tx, existing.projectId, ctx);
    await tx.$queryRaw`SELECT id FROM purchase_requests WHERE id = ${id} AND "tenantId" = ${ctx.tenantId} FOR UPDATE`;
    const current = await tx.purchaseRequest.findUniqueOrThrow({ where: { id }, include: { lines: true } });
    await assertPurchaseRequestScope(current, ctx, "mutate");
    assertDraftPr(current.status);
    await validateRequestLines(current.lines, current.projectId, { ...ctx, companyId: current.companyId }, tx);
    // D-126: legacy drafts may already have offers tied to these same items.
    // Re-sending keeps their historical reference, including unknown snapshots.
    const hasQuoteHistory = await tx.procurementQuote.count({ where: { purchaseRequestId: id } }) > 0;
    for (const line of hasQuoteHistory ? [] : current.lines) {
      if (!line.wbsNodeId) {
        throw new ServiceError(
          "CONFLICT",
          "Todas las líneas deben tener EDT antes de enviar la solicitud",
        );
      }
      const baseline = await budgetBaselineForPurchaseLine(
        line.wbsNodeId,
        {
          costAnalysisLineId: line.costAnalysisLineId,
          productId: line.productId,
          description: line.description,
          unit: line.unit,
        },
        tx,
      );
      await tx.purchaseRequestLine.update({
        where: { id: line.id },
        data: {
          budgetUnitCostSnapshot: baseline.unitCost,
          budgetQuantitySnapshot: baseline.quantity,
        },
      });
    }
    const flipped = await tx.purchaseRequest.updateMany({
      where: { id, tenantId: ctx.tenantId, status: "DRAFT" },
      data: {
        status: "SUBMITTED",
        submittedAt: new Date(),
        returnReason: null,
        returnedAt: null,
        returnedByUserId: null,
        updatedBy: ctx.actorUserId,
      },
    });
    assertOptimisticRowUpdate(
      flipped.count,
      "La solicitud ya no está en borrador. Recargá e intentá de nuevo.",
    );
    await auditProcurement(
      ctx,
      "purchase_request.submitted",
      "PurchaseRequest",
      id,
      { projectId: existing.projectId, companyId: existing.companyId },
      { after: { status: "SUBMITTED" }, tx },
    );
  }, { maxWait: 10_000, timeout: 30_000 });

  const code = `SC-${String(existing.number).padStart(3, "0")}`;
  await notifyPurchaseRequestSubmitted({
    ctx,
    purchaseRequestId: id,
    projectId: existing.projectId,
    companyId: existing.companyId,
    code,
  });

  return getPurchaseRequestById(id, ctx);
}

export async function returnPurchaseRequest(
  id: string,
  reason: string,
  ctx: ServiceContext,
): Promise<PurchaseRequestView> {
  await assertProcurementTenantModule(ctx);
  if (!canEditPurchaseRequests(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para devolver solicitudes de compra");
  }

  const trimmed = reason.trim();
  if (trimmed.length < 3) {
    throw new ServiceError("VALIDATION", "Indicá el motivo de la devolución");
  }

  const existing = await prisma.purchaseRequest.findUnique({
    where: { id },
    include: {
      lines: { select: { id: true, awardedPurchaseOrderId: true } },
    },
  });
  if (!existing || existing.tenantId !== ctx.tenantId) {
    throw new ServiceError("NOT_FOUND", "Solicitud no encontrada");
  }
  await assertPurchaseRequestScope(existing, ctx, "mutate");

  const [activeQuoteCount, activePoCount] = await Promise.all([
    prisma.procurementQuote.count({
      where: {
        purchaseRequestId: id,
        tenantId: ctx.tenantId,
      },
    }),
    prisma.purchaseOrder.count({
      where: {
        purchaseRequestId: id,
        tenantId: ctx.tenantId,
        status: { not: "CANCELLED" },
      },
    }),
  ]);
  const awardedLineCount = existing.lines.filter((l) => l.awardedPurchaseOrderId != null).length;

  assertPurchaseRequestReturnable({
    status: existing.status,
    quoteCount: activeQuoteCount,
    activePoCount,
    awardedLineCount,
  });

  await prisma.$transaction(async (tx) => {
    await lockProjectForOperationalMutation(tx, existing.projectId, ctx);
    await tx.$queryRaw`SELECT id FROM purchase_requests WHERE id = ${id} AND "tenantId" = ${ctx.tenantId} FOR UPDATE`;
    const current = await tx.purchaseRequest.findUniqueOrThrow({ where: { id }, include: { lines: { select: { awardedPurchaseOrderId: true } } } });
    await assertPurchaseRequestScope(current, ctx, "mutate");
    const [quoteCount, orderCount] = await Promise.all([
      tx.procurementQuote.count({ where: { purchaseRequestId: id } }),
      tx.purchaseOrder.count({ where: { purchaseRequestId: id, status: { not: "CANCELLED" } } }),
    ]);
    assertPurchaseRequestReturnable({
      status: current.status, quoteCount, activePoCount: orderCount,
      awardedLineCount: current.lines.filter((line) => line.awardedPurchaseOrderId != null).length,
    });
    const flipped = await tx.purchaseRequest.updateMany({
      where: { id, tenantId: ctx.tenantId, status: "SUBMITTED" },
      data: {
        status: "DRAFT",
        submittedAt: null,
        returnReason: trimmed,
        returnedAt: new Date(),
        returnedByUserId: ctx.actorUserId,
        updatedBy: ctx.actorUserId,
      },
    });
    assertOptimisticRowUpdate(
      flipped.count,
      "La solicitud cambió de estado. Recargá e intentá de nuevo.",
    );

    await tx.purchaseRequestLine.updateMany({
      where: { purchaseRequestId: id },
      data: {
        budgetUnitCostSnapshot: null,
        budgetQuantitySnapshot: null,
      },
    });

    await auditProcurement(
      ctx,
      "purchase_request.returned_for_changes",
      "PurchaseRequest",
      id,
      { projectId: existing.projectId, companyId: existing.companyId },
      { after: { returnReason: trimmed, status: "DRAFT" }, tx },
    );
  }, { maxWait: 10_000, timeout: 30_000 });

  const code = `SC-${String(existing.number).padStart(3, "0")}`;
  await notifyPurchaseRequestReturned({
    ctx,
    purchaseRequestId: id,
    projectId: existing.projectId,
    companyId: existing.companyId,
    code,
    reason: trimmed,
  });

  return getPurchaseRequestById(id, ctx);
}

export async function getActivePurchaseOrderForRequest(
  purchaseRequestId: string,
  ctx: ServiceContext,
): Promise<{ id: string; code: string; status: string; projectId: string } | null> {
  const { activeOrders } = await getPurchaseRequestPoLinks(purchaseRequestId, ctx);
  return activeOrders[0] ?? null;
}

/**
 * Active OCs (non-cancelled) + coverage flags + whether any OC was ever linked.
 */
export async function getPurchaseRequestPoLinks(
  purchaseRequestId: string,
  ctx: ServiceContext,
): Promise<{
  /** @deprecated Prefer activeOrders — kept for single-banner call-sites. */
  active: {
    id: string;
    code: string;
    status: string;
    projectId: string;
    selectedProcurementQuoteId: string | null;
  } | null;
  activeOrders: Array<{
    id: string;
    code: string;
    status: string;
    projectId: string;
    selectedProcurementQuoteId: string | null;
  }>;
  hasAny: boolean;
  awardedLineCount: number;
  totalLineCount: number;
  fullyAwarded: boolean;
}> {
  await assertProcurementTenantModule(ctx);
  if (!canViewPurchaseRequests(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos");
  }
  const request = await prisma.purchaseRequest.findUnique({ where: { id: purchaseRequestId } });
  if (!request) throw new ServiceError("NOT_FOUND", "Solicitud no encontrada");
  await assertPurchaseRequestScope(request, ctx, "read");
  const [orders, lines] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where: { purchaseRequestId },
      select: {
        id: true, tenantId: true, companyId: true, number: true, status: true, projectId: true,
        selectedProcurementQuoteId: true,
        selectedProcurementQuote: { select: { tenantId: true, purchaseRequestId: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.purchaseRequestLine.findMany({
      where: { purchaseRequestId },
      select: { awardedPurchaseOrderId: true },
    }),
  ]);
  if (orders.some((order) => order.tenantId !== request.tenantId || order.companyId !== request.companyId ||
    order.projectId !== request.projectId || (order.selectedProcurementQuoteId &&
      (!order.selectedProcurementQuote || order.selectedProcurementQuote.tenantId !== request.tenantId ||
        order.selectedProcurementQuote.purchaseRequestId !== request.id)))) {
    throw new ServiceError("CONFLICT", "La solicitud contiene vínculos de compra inconsistentes");
  }
  const orderIds = new Set(orders.map((order) => order.id));
  if (lines.some((line) => line.awardedPurchaseOrderId && !orderIds.has(line.awardedPurchaseOrderId))) {
    throw new ServiceError("CONFLICT", "La solicitud contiene adjudicaciones inconsistentes");
  }
  const activeRows = orders.filter((order) => order.status !== "CANCELLED");
  const activeOrders = activeRows.map((row) => ({
    id: row.id,
    code: `OC-${String(row.number).padStart(3, "0")}`,
    status: row.status,
    projectId: row.projectId,
    selectedProcurementQuoteId: row.selectedProcurementQuoteId,
  }));
  const activeIds = new Set(activeOrders.map((o) => o.id));
  const totalLineCount = lines.length;
  const awardedLineCount = lines.filter(
    (l) => l.awardedPurchaseOrderId != null && activeIds.has(l.awardedPurchaseOrderId),
  ).length;
  return {
    active: activeOrders[0] ?? null,
    activeOrders,
    hasAny: orders.length > 0,
    awardedLineCount,
    totalLineCount,
    fullyAwarded: totalLineCount > 0 && awardedLineCount === totalLineCount,
  };
}

/** @deprecated Prefer getPurchaseRequestPoLinks — kept for call-sites that only need the flag. */
export async function purchaseRequestHasAnyPurchaseOrder(
  purchaseRequestId: string,
  ctx: ServiceContext,
): Promise<boolean> {
  const { hasAny } = await getPurchaseRequestPoLinks(purchaseRequestId, ctx);
  return hasAny;
}

export async function cancelPurchaseRequest(id: string, ctx: ServiceContext): Promise<PurchaseRequestView> {
  await assertProcurementTenantModule(ctx);
  if (!canEditPurchaseRequests(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos");
  }
  const existing = await prisma.purchaseRequest.findUnique({ where: { id } });
  if (!existing || existing.tenantId !== ctx.tenantId) throw new ServiceError("NOT_FOUND", "Solicitud no encontrada");
  await assertPurchaseRequestScope(existing, ctx, "mutate");
  if (existing.status === "COMPLETED" || existing.status === "CANCELLED") {
    throw new ServiceError("CONFLICT", "La solicitud no puede anularse en este estado");
  }

  await prisma.$transaction(async (tx) => {
    await lockProjectForOperationalMutation(tx, existing.projectId, ctx);
    await tx.$queryRaw`SELECT id FROM purchase_requests WHERE id = ${id} AND "tenantId" = ${ctx.tenantId} FOR UPDATE`;
    const current = await tx.purchaseRequest.findUniqueOrThrow({ where: { id } });
    await assertPurchaseRequestScope(current, ctx, "mutate");
    const activePo = await tx.purchaseOrder.count({ where: { purchaseRequestId: id, status: { not: "CANCELLED" } } });
    if (activePo > 0) {
      throw new ServiceError("CONFLICT", "Hay órdenes de compra vinculadas a esta solicitud. Anulá la OC primero.");
    }
    const flipped = await tx.purchaseRequest.updateMany({
      where: {
        id,
        tenantId: ctx.tenantId,
        status: { notIn: ["COMPLETED", "CANCELLED"] },
      },
      data: { status: "CANCELLED", updatedBy: ctx.actorUserId },
    });
    assertOptimisticRowUpdate(
      flipped.count,
      "La solicitud cambió de estado. Recargá e intentá de nuevo.",
    );
    await tx.procurementQuote.updateMany({
      where: {
        purchaseRequestId: id,
        status: { in: ["DRAFT", "RECEIVED", "SELECTED"] },
      },
      data: { status: "REJECTED" },
    });
    await auditProcurement(ctx, "purchase_request.cancelled", "PurchaseRequest", id, {
      projectId: current.projectId, companyId: current.companyId,
    }, { after: { status: "CANCELLED" }, tx });
  }, { maxWait: 10_000, timeout: 30_000 });

  return getPurchaseRequestById(id, ctx);
}
