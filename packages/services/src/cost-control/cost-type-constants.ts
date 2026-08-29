import type { CostCategory } from "@bloqer/database";

/** Canonical job-cost natures for EDT partida × cost type ([D-099]). Pure — safe for client. */
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
