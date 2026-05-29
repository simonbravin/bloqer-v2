import type { WbsViewNode } from "@bloqer/services";
import type { VisibleCostCategory } from "@/lib/budget-categories";

export type CategoryAmounts = Record<VisibleCostCategory, number>;

export type WbsRowMetrics = {
  unit: string;
  quantity: number | null;
  byCategory: CategoryAmounts;
  totalCostDirect: number;
  totalSalePrice: number;
};

const ZERO: CategoryAmounts = {
  MATERIAL: 0,
  LABOR: 0,
  EQUIPMENT: 0,
  SUBCONTRACT: 0,
};

function unitCategoryCosts(node: WbsViewNode): CategoryAmounts {
  if (node.children.length > 0 || !node.costItem) return { ...ZERO };
  const amounts = { ...ZERO };
  for (const line of node.costItem.analysisLines) {
    if (line.category === "OTHER") continue;
    if (line.category in amounts) {
      amounts[line.category as VisibleCostCategory] += parseFloat(line.totalCost) || 0;
    }
  }
  const qty = parseFloat(node.costItem.quantity) || 0;
  return {
    MATERIAL: amounts.MATERIAL * qty,
    LABOR: amounts.LABOR * qty,
    EQUIPMENT: amounts.EQUIPMENT * qty,
    SUBCONTRACT: amounts.SUBCONTRACT * qty,
  };
}

export function computeWbsRowMetrics(node: WbsViewNode): WbsRowMetrics {
  if (node.children.length === 0 && node.costItem) {
    const byCategory = unitCategoryCosts(node);
    return {
      unit: node.costItem.unit,
      quantity: parseFloat(node.costItem.quantity) || 0,
      byCategory,
      totalCostDirect: parseFloat(node.totalCostDirect) || 0,
      totalSalePrice: parseFloat(node.totalSalePrice) || 0,
    };
  }

  const byCategory = { ...ZERO };
  let totalCostDirect = 0;
  let totalSalePrice = 0;
  for (const child of node.children) {
    const childMetrics = computeWbsRowMetrics(child);
    for (const cat of Object.keys(byCategory) as VisibleCostCategory[]) {
      byCategory[cat] += childMetrics.byCategory[cat];
    }
    totalCostDirect += childMetrics.totalCostDirect;
    totalSalePrice += childMetrics.totalSalePrice;
  }

  return {
    unit: "",
    quantity: null,
    byCategory,
    totalCostDirect,
    totalSalePrice,
  };
}

export function computeTreeGrandTotals(nodes: WbsViewNode[]): WbsRowMetrics {
  const byCategory = { ...ZERO };
  let totalCostDirect = 0;
  let totalSalePrice = 0;
  for (const node of nodes) {
    const m = computeWbsRowMetrics(node);
    for (const cat of Object.keys(byCategory) as VisibleCostCategory[]) {
      byCategory[cat] += m.byCategory[cat];
    }
    totalCostDirect += m.totalCostDirect;
    totalSalePrice += m.totalSalePrice;
  }
  return { unit: "", quantity: null, byCategory, totalCostDirect, totalSalePrice };
}

/** Costos unitarios por categoría (sin multiplicar cantidad). */
export function computeUnitCategoryCosts(node: WbsViewNode): CategoryAmounts {
  if (node.children.length > 0 || !node.costItem) return { ...ZERO };
  const amounts = { ...ZERO };
  for (const line of node.costItem.analysisLines) {
    if (line.category === "OTHER") continue;
    if (line.category in amounts) {
      amounts[line.category as VisibleCostCategory] += parseFloat(line.totalCost) || 0;
    }
  }
  return amounts;
}
