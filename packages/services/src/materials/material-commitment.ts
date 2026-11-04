import { Prisma, prisma, type CostCategory } from "@bloqer/database";
import { companyScopeFilter } from "../company-scope";
import { requireProjectAccess } from "../security/access";
import { canViewBudgetsArea } from "../project/project-nav-guards";
import { canViewProcurementProjectArea, canViewPurchaseRequests } from "../procurement/procurement-access";
import { getTenantModuleGate } from "../tenant-modules/tenant-module.service";
import { ServiceError, type ServiceContext } from "../types";
import { serializeMoneyDecimal, serializeUnitPriceDecimal } from "../finance/money-decimal";
import {
  applyOrderedToApuMap,
  buildApuCommitmentMap,
  buildFallbackIndex,
  MATERIAL_ORDERED_PO_STATUSES,
  MATERIAL_ORDERED_PR_STATUSES,
  needQtyFromApuLineExact,
  serializeApuCommitment,
  type MaterialApuCommitmentView,
  type MaterialNeedSeed,
} from "./material-commitment-pure";

export type { MaterialApuCommitmentView } from "./material-commitment-pure";

export {
  MATERIAL_ORDERED_PO_STATUSES,
  MATERIAL_ORDERED_PR_STATUSES,
  needQtyFromApuLine,
  shortfallOf,
  serializeApuCommitment,
} from "./material-commitment-pure";

const DEFAULT_COMMITMENT_CATEGORIES: CostCategory[] = ["MATERIAL"];

export type LoadMaterialApuCommitmentsOpts = {
  /** When set, only this budget; otherwise latest APPROVED/CLOSED for project. */
  budgetId?: string;
  /** Restrict to one or more WBS ITEM ids. */
  wbsNodeIds?: string[];
  /**
   * APU CostCategory filter (default MATERIAL only).
   * SC catalog uses MATERIAL|LABOR|EQUIPMENT ([D-109]).
   */
  categories?: CostCategory[];
};

async function resolveBudgetIds(
  projectId: string,
  ctx: ServiceContext,
  budgetId?: string,
): Promise<string[]> {
  const budgets = await prisma.budget.findMany({
    where: { projectId, tenantId: ctx.tenantId, ...companyScopeFilter(ctx), status: { in: ["APPROVED", "CLOSED"] } },
    select: { id: true },
    orderBy: { updatedAt: "desc" },
  });
  if (budgets.length === 0) return [];
  if (budgetId) {
    return budgets.some((b) => b.id === budgetId) ? [budgetId] : [];
  }
  // SC catalog / multi-budget: seed from all APPROVED/CLOSED (not only latest).
  return budgets.map((b) => b.id);
}

/**
 * Need / ordered / shortfall per CostAnalysisLine for a project (default MATERIAL).
 * Same commitment semantics as the materials board (CONFIRMED+ OC; SC without OC).
 */
export async function loadMaterialApuCommitments(
  projectId: string,
  ctx: ServiceContext,
  opts: LoadMaterialApuCommitmentsOpts = {},
): Promise<MaterialApuCommitmentView[]> {
  if (!canViewBudgetsArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver necesidades APU");
  }
  const gate = await getTenantModuleGate(ctx);
  if (!gate.isEnabled("PROJECTS") || !gate.isEnabled("BUDGETS")) {
    throw new ServiceError("FORBIDDEN", "Proyectos o presupuestos deshabilitados");
  }
  await requireProjectAccess(projectId, ctx);
  const budgetIds = await resolveBudgetIds(projectId, ctx, opts.budgetId);
  if (budgetIds.length === 0) return [];

  const categories =
    opts.categories && opts.categories.length > 0
      ? opts.categories
      : DEFAULT_COMMITMENT_CATEGORIES;

  const costItems = await prisma.costItem.findMany({
    where: {
      budgetId: { in: budgetIds },
      wbsNode: {
        budgetId: { in: budgetIds },
        type: "ITEM",
        ...(opts.wbsNodeIds?.length ? { id: { in: opts.wbsNodeIds } } : {}),
      },
    },
    select: {
      wbsNodeId: true,
      quantity: true,
      analysisLines: {
        where: { budgetId: { in: budgetIds }, category: { in: categories }, isLumpSum: false },
        select: {
          id: true,
          productId: true,
          description: true,
          coefficient: true,
          totalCost: true,
          partidaQuantity: true,
          isLumpSum: true,
          unit: true,
          unitCost: true,
        },
      },
    },
  });

  const seeds: MaterialNeedSeed[] = [];
  for (const item of costItems) {
    for (const line of item.analysisLines) {
      const need = needQtyFromApuLineExact({
        partidaQuantity: line.partidaQuantity,
        coefficient: line.coefficient,
        itemQuantity: item.quantity,
        isLumpSum: line.isLumpSum,
        unit: line.unit,
      });
      if (!need.greaterThan(0)) continue;
      const needCost = new Prisma.Decimal(line.totalCost).mul(item.quantity);
      seeds.push({
        wbsNodeId: item.wbsNodeId,
        costAnalysisLineId: line.id,
        productId: line.productId,
        description: line.description,
        unit: line.unit,
        unitCost: serializeUnitPriceDecimal(line.unitCost),
        needQty: need,
        needCost: serializeMoneyDecimal(needCost),
      });
    }
  }

  const map = buildApuCommitmentMap(seeds);
  if (map.size === 0) return [];
  const fallbackIndex = buildFallbackIndex(map);
  const canReadRequests = gate.isEnabled("PROCUREMENT") && canViewPurchaseRequests(ctx.roles);
  const canReadOrders = gate.isEnabled("PROCUREMENT") && canViewProcurementProjectArea(ctx.roles);

  const [prLines, poLines] = await Promise.all([
    canReadRequests ? prisma.purchaseRequestLine.findMany({
      where: {
        purchaseRequest: {
          projectId,
          tenantId: ctx.tenantId,
          // PurchaseRequest.companyId is NOT NULL.
          ...(ctx.companyId ? { companyId: ctx.companyId } : {}),
          status: { in: [...MATERIAL_ORDERED_PR_STATUSES] },
        },
        awardedPurchaseOrderId: null,
        wbsNode: { budgetId: { in: budgetIds } },
        wbsNodeId: opts.wbsNodeIds?.length
          ? { in: opts.wbsNodeIds }
          : { not: null },
        OR: [
          { costType: { in: categories } },
          { costType: null, costAnalysisLine: { category: { in: categories } } },
          // Legacy free-text (no type, no APU) — same attribution as materials board.
          { AND: [{ costType: null }, { costAnalysisLineId: null }] },
        ],
      },
      select: {
        wbsNodeId: true,
        costAnalysisLineId: true,
        productId: true,
        description: true,
        unit: true,
        quantity: true,
      },
    }) : Promise.resolve([]),
    canReadOrders ? prisma.purchaseOrderLine.findMany({
      where: {
        purchaseOrder: {
          projectId,
          tenantId: ctx.tenantId,
          // PurchaseOrder.companyId is NOT NULL.
          ...(ctx.companyId ? { companyId: ctx.companyId } : {}),
          status: { not: "CANCELLED" },
        },
        wbsNodeId: opts.wbsNodeIds?.length
          ? { in: opts.wbsNodeIds }
          : { not: null },
        wbsNode: { budgetId: { in: budgetIds } },
        OR: [
          { purchaseOrder: { status: { in: [...MATERIAL_ORDERED_PO_STATUSES] } } },
          {
            AND: [
              { purchaseRequestLineId: { not: null } },
              { isActiveAward: true },
            ],
          },
        ],
        AND: [
          {
            OR: [
              { costType: { in: categories } },
              { costType: null, costAnalysisLine: { category: { in: categories } } },
              { AND: [{ costType: null }, { costAnalysisLineId: null }] },
            ],
          },
        ],
      },
      select: {
        wbsNodeId: true,
        costAnalysisLineId: true,
        productId: true,
        description: true,
        unit: true,
        quantity: true,
        receivedQuantity: true,
      },
    }) : Promise.resolve([]),
  ]);

  for (const line of prLines) {
    if (!line.wbsNodeId) continue;
    applyOrderedToApuMap(map, fallbackIndex, {
      wbsNodeId: line.wbsNodeId,
      costAnalysisLineId: line.costAnalysisLineId,
      productId: line.productId,
      description: line.description,
      unit: line.unit,
      quantity: line.quantity,
    });
  }
  for (const line of poLines) {
    if (!line.wbsNodeId) continue;
    applyOrderedToApuMap(map, fallbackIndex, {
      wbsNodeId: line.wbsNodeId,
      costAnalysisLineId: line.costAnalysisLineId,
      productId: line.productId,
      description: line.description,
      unit: line.unit,
      quantity: line.quantity,
      receivedQuantity: line.receivedQuantity,
    });
  }

  return [...map.values()].map((agg) => {
    const view = serializeApuCommitment(agg);
    return {
      ...view,
      needCost: serializeMoneyDecimal(agg.needCost),
    };
  });
}

/**
 * Map costAnalysisLineId → commitment for quick lookup in procurement forms.
 */
export async function loadMaterialApuCommitmentByLineId(
  projectId: string,
  ctx: ServiceContext,
  opts: LoadMaterialApuCommitmentsOpts = {},
): Promise<Map<string, MaterialApuCommitmentView>> {
  const rows = await loadMaterialApuCommitments(projectId, ctx, opts);
  return new Map(rows.map((r) => [r.costAnalysisLineId, r]));
}
