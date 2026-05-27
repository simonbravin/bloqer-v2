import type { CostCategory } from "@bloqer/database";

export const CATEGORY_LABELS: Record<CostCategory, string> = {
  MATERIAL: "Material",
  LABOR: "Mano de obra",
  EQUIPMENT: "Equipos",
  SUBCONTRACT: "Subcontrato",
  OTHER: "Otros (legacy)",
};

/** Categorías visibles en UI nueva (sin OTHER). */
export const VISIBLE_COST_CATEGORIES = [
  "MATERIAL",
  "LABOR",
  "EQUIPMENT",
  "SUBCONTRACT",
] as const satisfies readonly CostCategory[];

export type VisibleCostCategory = (typeof VISIBLE_COST_CATEGORIES)[number];

export function isVisibleCostCategory(cat: string): cat is VisibleCostCategory {
  return (VISIBLE_COST_CATEGORIES as readonly string[]).includes(cat);
}
