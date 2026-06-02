/** Responsive typography for KPI values so long amounts fit uniform card height. */
export function getKpiValueSizeClass(
  value: string,
  options?: { compact?: boolean },
): string {
  const len = value.trim().length;
  if (options?.compact) {
    if (len > 18) {
      return "text-[clamp(0.5625rem,min(3.2vw,0.8125rem),0.8125rem)]";
    }
    if (len > 14) {
      return "text-[clamp(0.625rem,min(3.8vw,0.9375rem),0.9375rem)]";
    }
    if (len > 10) {
      return "text-[clamp(0.6875rem,min(4.2vw,1rem),1rem)]";
    }
    return "text-[clamp(0.75rem,min(4.5vw,1.125rem),1.125rem)]";
  }
  if (len > 22) return "text-sm";
  if (len > 18) return "text-base";
  if (len > 14) return "text-lg";
  if (len > 10) return "text-xl";
  return "text-2xl";
}
