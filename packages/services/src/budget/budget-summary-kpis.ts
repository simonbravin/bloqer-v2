import { addDecimal, compareDecimal, divideDecimal, multiplyDecimal, roundMoney, serializeMoney } from "@bloqer/utils";
import {
  computeTreeGrandTotalsExact,
  computeWbsRowMetricsExact,
  VISIBLE_WBS_COST_CATEGORIES,
  type VisibleCostCategory,
  type WbsRowMetricsExact,
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
  totalCostDirectDisplay: string;
  totalSalePriceDisplay: string;
  marginDisplay: string;
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
  amount: string,
  whole: string,
): BudgetSummaryNamedAmount {
  return {
    code: node.code,
    name: node.name,
    amount: Number(amount),
    amountDisplay: serializeMoney(amount),
    incidencePct: incidencePercent(amount, whole) ?? 0,
  };
}

function incidencePercent(part: string, whole: string): number | null {
  return compareDecimal(whole, "0") > 0 ? Number(divideDecimal(multiplyDecimal(part, "100"), whole, 4)) : null;
}

function walkLeaves(
  nodes: WbsViewNode[],
  visit: (node: WbsViewNode, metrics: WbsRowMetricsExact) => void,
): void {
  for (const node of nodes) {
    if (node.children.length > 0) {
      walkLeaves(node.children, visit);
      continue;
    }
    if (!node.costItem) continue;
    visit(node, computeWbsRowMetricsExact(node));
  }
}

function walkGroups(
  nodes: WbsViewNode[],
  visit: (node: WbsViewNode, metrics: WbsRowMetricsExact) => void,
): void {
  for (const node of nodes) {
    if (node.children.length === 0) continue;
    visit(node, computeWbsRowMetricsExact(node));
    walkGroups(node.children, visit);
  }
}

/**
 * Pure KPIs for project/budget summary (EDT totals + leaf/group insights).
 */
export function computeBudgetSummaryKpis(tree: WbsViewNode[]): BudgetSummaryKpis {
  const grand = computeTreeGrandTotalsExact(tree);
  const { totalCostDirect, totalSalePrice } = grand;
  const margin = roundMoney(addDecimal(totalSalePrice, multiplyDecimal(totalCostDirect, "-1")));
  const marginPct = incidencePercent(margin, totalSalePrice);
  const costToSalePct = incidencePercent(totalCostDirect, totalSalePrice);

  let costliestLeaf: BudgetSummaryNamedAmount | null = null;
  walkLeaves(tree, (node, metrics) => {
    const amount = metrics.totalCostDirect;
    if (compareDecimal(amount, "0") <= 0) return;
    if (!costliestLeaf || compareDecimal(amount, costliestLeaf.amountDisplay) > 0) {
      costliestLeaf = namedAmount(node, amount, totalCostDirect);
    }
  });

  // Capítulos (GROUP) — same % formula as EDT incidencia, but avoids duplicating
  // "partida más costosa" (leaf max cost ≡ leaf max incidence on cost base).
  let topIncidenceGroup: BudgetSummaryNamedAmount | null = null;
  walkGroups(tree, (node, metrics) => {
    const amount = metrics.totalCostDirect;
    if (compareDecimal(amount, "0") <= 0) return;
    const named = namedAmount(node, amount, totalCostDirect);
    if (
      !topIncidenceGroup ||
      compareDecimal(amount, topIncidenceGroup.amountDisplay) > 0
    ) {
      topIncidenceGroup = named;
    }
  });

  let dominantCategory: BudgetSummaryKpis["dominantCategory"] = null;
  if (compareDecimal(totalCostDirect, "0") > 0) {
    let bestCat: VisibleCostCategory = "MATERIAL";
    let bestAmt = "0.00";
    for (const cat of VISIBLE_WBS_COST_CATEGORIES) {
      const amt = grand.byCategory[cat];
      if (compareDecimal(amt, bestAmt) > 0) {
        bestAmt = amt;
        bestCat = cat;
      }
    }
    if (compareDecimal(bestAmt, "0") > 0) {
      dominantCategory = {
        category: bestCat,
        label: CATEGORY_LABEL_ES[bestCat],
        amount: Number(bestAmt),
        amountDisplay: serializeMoney(bestAmt),
        sharePct: incidencePercent(bestAmt, totalCostDirect) ?? 0,
      };
    }
  }

  return {
    totalCostDirect: Number(totalCostDirect),
    totalSalePrice: Number(totalSalePrice),
    margin: Number(margin),
    totalCostDirectDisplay: totalCostDirect,
    totalSalePriceDisplay: totalSalePrice,
    marginDisplay: margin,
    marginPct,
    costToSalePct,
    costliestLeaf,
    topIncidenceGroup,
    dominantCategory,
  };
}
