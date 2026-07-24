import { wbsIncidencePercent } from "@bloqer/domain";
import { serializeMoney } from "@bloqer/utils";
import {
  computeTreeGrandTotals,
  computeWbsRowMetrics,
  VISIBLE_WBS_COST_CATEGORIES,
  type VisibleCostCategory,
  type WbsRowMetrics,
} from "./wbs-metrics";
import type { WbsViewNode } from "./wbs.service";

const CATEGORY_LABEL_ES: Record<VisibleCostCategory, string> = {
  MATERIAL: "Materiales",
  LABOR: "Mano de obra",
  EQUIPMENT: "Equipos",
  SUBCONTRACT: "Subcontrato",
};

export type BudgetSummaryNamedAmount = {
  code: string;
  name: string;
  amount: number;
  /** Display-safe money string (2 dp). */
  amountDisplay: string;
  incidencePct: number;
};

export type BudgetSummaryKpis = {
  totalCostDirect: number;
  totalSalePrice: number;
  margin: number;
  /** (venta − costo) / venta × 100; null if sale ≤ 0 */
  marginPct: number | null;
  /** costo / venta × 100; null if sale ≤ 0 */
  costToSalePct: number | null;
  /** Leaf with highest direct cost. */
  costliestLeaf: BudgetSummaryNamedAmount | null;
  /**
   * GROUP (capítulo) with highest incidence on direct cost.
   * Distinct from costliestLeaf (which is always a leaf partida).
   */
  topIncidenceGroup: BudgetSummaryNamedAmount | null;
  /** Category with largest share of direct cost. */
  dominantCategory: {
    category: VisibleCostCategory;
    label: string;
    amount: number;
    amountDisplay: string;
    sharePct: number;
  } | null;
};

function namedAmount(
  node: WbsViewNode,
  amount: number,
  whole: number,
): BudgetSummaryNamedAmount {
  return {
    code: node.code,
    name: node.name,
    amount,
    amountDisplay: serializeMoney(amount),
    incidencePct: wbsIncidencePercent(amount, whole) ?? 0,
  };
}

function walkLeaves(
  nodes: WbsViewNode[],
  visit: (node: WbsViewNode, metrics: WbsRowMetrics) => void,
): void {
  for (const node of nodes) {
    if (node.children.length > 0) {
      walkLeaves(node.children, visit);
      continue;
    }
    if (!node.costItem) continue;
    visit(node, computeWbsRowMetrics(node));
  }
}

function walkGroups(
  nodes: WbsViewNode[],
  visit: (node: WbsViewNode, metrics: WbsRowMetrics) => void,
): void {
  for (const node of nodes) {
    if (node.children.length === 0) continue;
    visit(node, computeWbsRowMetrics(node));
    walkGroups(node.children, visit);
  }
}

/**
 * Pure KPIs for project/budget summary (EDT totals + leaf/group insights).
 */
export function computeBudgetSummaryKpis(tree: WbsViewNode[]): BudgetSummaryKpis {
  const grand = computeTreeGrandTotals(tree);
  const { totalCostDirect, totalSalePrice } = grand;
  const margin = totalSalePrice - totalCostDirect;
  const marginPct =
    totalSalePrice > 0 ? wbsIncidencePercent(margin, totalSalePrice) : null;
  const costToSalePct =
    totalSalePrice > 0 ? wbsIncidencePercent(totalCostDirect, totalSalePrice) : null;

  let costliestLeaf: BudgetSummaryNamedAmount | null = null;
  walkLeaves(tree, (node, metrics) => {
    const amount = metrics.totalCostDirect;
    if (amount <= 0) return;
    if (!costliestLeaf || amount > costliestLeaf.amount) {
      costliestLeaf = namedAmount(node, amount, totalCostDirect);
    }
  });

  // Capítulos (GROUP) — same % formula as EDT incidencia, but avoids duplicating
  // "partida más costosa" (leaf max cost ≡ leaf max incidence on cost base).
  let topIncidenceGroup: BudgetSummaryNamedAmount | null = null;
  walkGroups(tree, (node, metrics) => {
    const amount = metrics.totalCostDirect;
    if (amount <= 0) return;
    const named = namedAmount(node, amount, totalCostDirect);
    if (
      !topIncidenceGroup ||
      named.incidencePct > topIncidenceGroup.incidencePct ||
      (named.incidencePct === topIncidenceGroup.incidencePct &&
        amount > topIncidenceGroup.amount)
    ) {
      topIncidenceGroup = named;
    }
  });

  let dominantCategory: BudgetSummaryKpis["dominantCategory"] = null;
  if (totalCostDirect > 0) {
    let bestCat: VisibleCostCategory = "MATERIAL";
    let bestAmt = -1;
    for (const cat of VISIBLE_WBS_COST_CATEGORIES) {
      const amt = grand.byCategory[cat];
      if (amt > bestAmt) {
        bestAmt = amt;
        bestCat = cat;
      }
    }
    if (bestAmt > 0) {
      dominantCategory = {
        category: bestCat,
        label: CATEGORY_LABEL_ES[bestCat],
        amount: bestAmt,
        amountDisplay: serializeMoney(bestAmt),
        sharePct: wbsIncidencePercent(bestAmt, totalCostDirect) ?? 0,
      };
    }
  }

  return {
    totalCostDirect,
    totalSalePrice,
    margin,
    marginPct,
    costToSalePct,
    costliestLeaf,
    topIncidenceGroup,
    dominantCategory,
  };
}
