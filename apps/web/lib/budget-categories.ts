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

/** Encabezados de columnas en la tabla EDT (modo desglose). */
export const WBS_EDT_BREAKDOWN_HEADERS: Record<VisibleCostCategory, string> = {
  MATERIAL: "Materiales",
  LABOR: "Mano de obra",
  EQUIPMENT: "Equipos",
  SUBCONTRACT: "Subcontrato",
};

export function isVisibleCostCategory(cat: string): cat is VisibleCostCategory {
  return (VISIBLE_COST_CATEGORIES as readonly string[]).includes(cat);
}
