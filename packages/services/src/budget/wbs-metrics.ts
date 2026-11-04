import type { WbsViewNode } from "./wbs.service";
import { addDecimal, multiplyDecimal, roundMoney } from "@bloqer/utils";

/** Pure WBS row metrics (safe for client bundles — no Prisma). */
/** Visible cost categories in WBS EDT (excludes OTHER). */
export const VISIBLE_WBS_COST_CATEGORIES = [
  "MATERIAL",
  "LABOR",
  "EQUIPMENT",
  "SUBCONTRACT",
] as const;

export type VisibleCostCategory = (typeof VISIBLE_WBS_COST_CATEGORIES)[number];

export type CategoryAmounts = Record<VisibleCostCategory, number>;

export type WbsRowMetrics = {
  unit: string;
  quantity: number | null;
  byCategory: CategoryAmounts;
  totalCostDirect: number;
  totalSalePrice: number;
};

export type ExactCategoryAmounts = Record<VisibleCostCategory, string>;
export type ExactWbsRowMetrics = Omit<WbsRowMetrics, "quantity" | "byCategory" | "totalCostDirect" | "totalSalePrice"> & {
  quantity: string | null;
  byCategory: ExactCategoryAmounts;
  totalCostDirect: string;
  totalSalePrice: string;
};
export type CategoryAmountsExact = ExactCategoryAmounts;
export type WbsRowMetricsExact = ExactWbsRowMetrics;

function emptyExact(): ExactWbsRowMetrics {
  return { unit: "", quantity: null, byCategory: { MATERIAL: "0.00", LABOR: "0.00", EQUIPMENT: "0.00", SUBCONTRACT: "0.00" }, totalCostDirect: "0.00", totalSalePrice: "0.00" };
}

/** Decimal strings remain exact through every tree level; convert only at display boundaries. */
export function computeUnitCategoryCostsExact(node: WbsViewNode): ExactCategoryAmounts {
  const amounts = emptyExact().byCategory;
  if (node.children.length > 0 || !node.costItem) return amounts;
  for (const line of node.costItem.analysisLines) {
    if (VISIBLE_WBS_COST_CATEGORIES.includes(line.category as VisibleCostCategory)) {
      const category = line.category as VisibleCostCategory;
      amounts[category] = addDecimal(amounts[category], line.totalCost);
    }
  }
  return amounts;
}

function sumExact(rows: ExactWbsRowMetrics[]): ExactWbsRowMetrics {
  const result = emptyExact();
  for (const row of rows) {
    for (const category of VISIBLE_WBS_COST_CATEGORIES) result.byCategory[category] = roundMoney(addDecimal(result.byCategory[category], row.byCategory[category]));
    result.totalCostDirect = roundMoney(addDecimal(result.totalCostDirect, row.totalCostDirect));
    result.totalSalePrice = roundMoney(addDecimal(result.totalSalePrice, row.totalSalePrice));
  }
  return result;
}

export function computeWbsRowMetricsExact(node: WbsViewNode): ExactWbsRowMetrics {
  if (node.children.length > 0 || !node.costItem) return sumExact(node.children.map(computeWbsRowMetricsExact));
  const byCategory = computeUnitCategoryCostsExact(node);
  for (const category of VISIBLE_WBS_COST_CATEGORIES) byCategory[category] = roundMoney(multiplyDecimal(byCategory[category], node.costItem.quantity));
  return { unit: node.costItem.unit, quantity: node.costItem.quantity, byCategory, totalCostDirect: roundMoney(node.totalCostDirect), totalSalePrice: roundMoney(node.totalSalePrice) };
}

export function computeTreeGrandTotalsExact(nodes: WbsViewNode[]): ExactWbsRowMetrics {
  return sumExact(nodes.map(computeWbsRowMetricsExact));
}

function forDisplay(row: ExactWbsRowMetrics): WbsRowMetrics {
  return { unit: row.unit, quantity: row.quantity === null ? null : Number(row.quantity), byCategory: Object.fromEntries(VISIBLE_WBS_COST_CATEGORIES.map((category) => [category, Number(row.byCategory[category])])) as CategoryAmounts, totalCostDirect: Number(row.totalCostDirect), totalSalePrice: Number(row.totalSalePrice) };
}

export function computeWbsRowMetrics(node: WbsViewNode): WbsRowMetrics {
  return forDisplay(computeWbsRowMetricsExact(node));
}

export function computeTreeGrandTotals(nodes: WbsViewNode[]): WbsRowMetrics {
  return forDisplay(computeTreeGrandTotalsExact(nodes));
}

/** Unit costs by category (without multiplying quantity). */
export function computeUnitCategoryCosts(node: WbsViewNode): CategoryAmounts {
  const exact = computeUnitCategoryCostsExact(node);
  return Object.fromEntries(VISIBLE_WBS_COST_CATEGORIES.map((category) => [category, Number(exact[category])])) as CategoryAmounts;
}
