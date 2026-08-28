/** Stable palette for CostCategory pies / legends ([D-099]). Index-based colors misalign when a category is missing. */
export const COST_CATEGORY_COLORS: Record<string, string> = {
  MATERIAL: "#2563eb",
  LABOR: "#16a34a",
  EQUIPMENT: "#ca8a04",
  SUBCONTRACT: "#9333ea",
  OTHER: "#64748b",
};

export const COST_CATEGORY_LABELS_ES: Record<string, string> = {
  MATERIAL: "Materiales",
  LABOR: "Mano de obra",
  EQUIPMENT: "Equipos",
  SUBCONTRACT: "Subcontratos",
  OTHER: "Otros",
};

export function costCategoryColor(category: string, fallbackIndex = 0): string {
  return (
    COST_CATEGORY_COLORS[category] ??
    ["#2563eb", "#16a34a", "#ca8a04", "#9333ea", "#64748b"][fallbackIndex % 5]!
  );
}

export function costCategoryLabelEs(category: string | null | undefined): string {
  if (!category) return "Materiales";
  return COST_CATEGORY_LABELS_ES[category] ?? category;
}
