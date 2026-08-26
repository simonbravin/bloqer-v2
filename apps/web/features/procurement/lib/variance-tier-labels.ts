/** Spanish labels for PurchaseOrderVarianceTier ([BR-PUR-009]). */
export const PURCHASE_VARIANCE_TIER_LABELS: Record<string, string> = {
  NONE: "Sin desvío",
  NOTE_REQUIRED: "Nota requerida",
  EXTRA_APPROVAL: "Aprobación extra",
  UNIT_MISMATCH: "Unidad distinta",
  NO_BUDGET_BASELINE: "Sin baseline",
};

export function purchaseVarianceTierLabel(tier: string): string {
  return PURCHASE_VARIANCE_TIER_LABELS[tier] ?? tier;
}
