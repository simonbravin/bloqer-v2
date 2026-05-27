export type BudgetUnitOption = { value: string; label: string };

/** Unidades frecuentes en cómputo / APU (valores persistidos como string en DB). */
export const BUDGET_UNIT_OPTIONS: BudgetUnitOption[] = [
  { value: "m2", label: "m²" },
  { value: "m3", label: "m³" },
  { value: "ml", label: "ml" },
  { value: "kg", label: "kg" },
  { value: "t", label: "t" },
  { value: "un", label: "Unidad" },
  { value: "gl", label: "Global" },
  { value: "dia", label: "Día" },
  { value: "h", label: "Hora" },
  { value: "mes", label: "Mes" },
  { value: "lt", label: "Litro" },
  { value: "obra", label: "Obra" },
];

export function isKnownBudgetUnit(value: string): boolean {
  return BUDGET_UNIT_OPTIONS.some((o) => o.value === value);
}

export function budgetUnitLabel(value: string): string {
  const known = BUDGET_UNIT_OPTIONS.find((o) => o.value === value);
  return known?.label ?? value;
}
