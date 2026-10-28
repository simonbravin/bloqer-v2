import { compareDecimal, divideDecimal } from "@bloqer/utils";

/** Legacy certificate-only weighted mean: physicalPct is already on the 0–100 scale. */
export function certificationWeightedPhysicalPct(weightedPct: string, weight: string): string {
  return compareDecimal(weight, "0") === 0 ? "0.00" : divideDecimal(weightedPct, weight, 2);
}
