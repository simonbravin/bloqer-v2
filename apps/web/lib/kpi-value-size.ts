/** Responsive typography for KPI values so long amounts fit uniform card height. */
export function getKpiValueSizeClass(value: string): string {
  const len = value.trim().length;
  if (len > 22) return "text-sm";
  if (len > 18) return "text-base";
  if (len > 14) return "text-lg";
  if (len > 10) return "text-xl";
  return "text-2xl";
}
