import { Prisma, prisma } from "@bloqer/database";
import { serializeMoneyDecimal, serializeUnitPriceDecimal } from "../finance/money-decimal";
import {
  applyOrderedToApuMap,
  buildApuCommitmentMap,
  buildFallbackIndex,
  MATERIAL_ORDERED_PO_STATUSES,
  MATERIAL_ORDERED_PR_STATUSES,
  needQtyFromApuLine,
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

export type LoadMaterialApuCommitmentsOpts = {
  /** When set, only this budget; otherwise latest APPROVED/CLOSED for project. */
  budgetId?: string;
  /** Restrict to one or more WBS ITEM ids. */
  wbsNodeIds?: string[];
};

async function resolveBudgetId(
  projectId: string,
  tenantId: string,
  budgetId?: string,
): Promise<string | null> {
  // Same selection rule as resolveApprovedBudgetForProject (updatedAt desc).
  const budgets = await prisma.budget.findMany({
    where: { projectId, tenantId, status: { in: ["APPROVED", "CLOSED"] } },
    select: { id: true },
    orderBy: { updatedAt: "desc" },
  });
  if (budgets.length === 0) return null;
  if (budgetId) return budgets.find((b) => b.id === budgetId)?.id ?? null;
  return budgets[0]!.id;
}

/**
 * Need / ordered / shortfall per MATERIAL CostAnalysisLine for a project.
 * Same commitment semantics as the materials board (CONFIRMED+ OC; SC without OC).
 */
export async function loadMaterialApuCommitments(
  projectId: string,
  tenantId: string,
  opts: LoadMaterialApuCommitmentsOpts = {},
): Promise<MaterialApuCommitmentView[]> {
  const budgetId = await resolveBudgetId(projectId, tenantId, opts.budgetId);
  if (!budgetId) return [];

  const costItems = await prisma.costItem.findMany({
    where: {
      budgetId,
      wbsNode: {
        type: "ITEM",
        ...(opts.wbsNodeIds?.length ? { id: { in: opts.wbsNodeIds } } : {}),
      },
    },
    select: {
      wbsNodeId: true,
      quantity: true,
      analysisLines: {
        where: { category: "MATERIAL", isLumpSum: false },
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
    const itemQty = Number(item.quantity.toString());
    for (const line of item.analysisLines) {
      const need = needQtyFromApuLine({
        partidaQuantity:
          line.partidaQuantity != null ? Number(line.partidaQuantity.toString()) : null,
        coefficient: Number(line.coefficient.toString()),
        itemQuantity: itemQty,
        isLumpSum: line.isLumpSum,
        unit: line.unit,
      });
      if (!(need > 0)) continue;
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

  const [prLines, poLines] = await Promise.all([
    prisma.purchaseRequestLine.findMany({
      where: {
        purchaseRequest: {
          projectId,
          tenantId,
          status: { in: [...MATERIAL_ORDERED_PR_STATUSES] },
          purchaseOrders: {
            none: { status: { in: [...MATERIAL_ORDERED_PO_STATUSES] } },
          },
        },
        wbsNodeId: opts.wbsNodeIds?.length
          ? { in: opts.wbsNodeIds }
          : { not: null },
      },
      select: {
        wbsNodeId: true,
        costAnalysisLineId: true,
        productId: true,
        description: true,
        quantity: true,
      },
    }),
    prisma.purchaseOrderLine.findMany({
      where: {
        purchaseOrder: {
          projectId,
          tenantId,
          status: { in: [...MATERIAL_ORDERED_PO_STATUSES] },
        },
        wbsNodeId: opts.wbsNodeIds?.length
          ? { in: opts.wbsNodeIds }
          : { not: null },
      },
      select: {
        wbsNodeId: true,
        costAnalysisLineId: true,
        productId: true,
        description: true,
        quantity: true,
        receivedQuantity: true,
      },
    }),
  ]);

  for (const line of prLines) {
    if (!line.wbsNodeId) continue;
    applyOrderedToApuMap(map, fallbackIndex, {
      wbsNodeId: line.wbsNodeId,
      costAnalysisLineId: line.costAnalysisLineId,
      productId: line.productId,
      description: line.description,
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
  tenantId: string,
  opts: LoadMaterialApuCommitmentsOpts = {},
): Promise<Map<string, MaterialApuCommitmentView>> {
  const rows = await loadMaterialApuCommitments(projectId, tenantId, opts);
  return new Map(rows.map((r) => [r.costAnalysisLineId, r]));
}
