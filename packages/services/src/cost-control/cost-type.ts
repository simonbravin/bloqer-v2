import type { CostCategory } from "@bloqer/database";

/** Canonical job-cost natures for EDT partida × cost type ([D-099]). */
export const COST_TYPE_ORDER: CostCategory[] = [
  "MATERIAL",
  "LABOR",
  "EQUIPMENT",
  "SUBCONTRACT",
  "OTHER",
];

export const COST_TYPE_LABELS_ES: Record<CostCategory, string> = {
  MATERIAL: "Materiales",
  LABOR: "Mano de obra",
  EQUIPMENT: "Equipos",
  SUBCONTRACT: "Subcontratos",
  OTHER: "Otros",
};

/**
 * Resolve persisted costType for a procurement / AP line ([D-099]).
 * Explicit input wins; else APU category; else MATERIAL default.
 */
export function resolveLineCostType(input: {
  costType?: CostCategory | null;
  apuCategory?: CostCategory | null;
}): CostCategory {
  if (input.costType) return input.costType;
  if (input.apuCategory) return input.apuCategory;
  return "MATERIAL";
}

/** Inventory consumption always MATERIAL. */
export function inventoryCostType(): CostCategory {
  return "MATERIAL";
}

/** Subcontract commitment / certification always SUBCONTRACT. */
export function subcontractCostType(): CostCategory {
  return "SUBCONTRACT";
}
