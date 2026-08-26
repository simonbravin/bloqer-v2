import { formatQtyFromString, formatQtyWithUnit } from "@/lib/format-money";

/** @deprecated Use formatQtyFromString — kept so field screens share the platform formatter. */
export function formatMaterialsFieldQty(raw: string): string {
  return formatQtyFromString(raw);
}

export function formatMaterialsFieldQtyWithUnit(raw: string, unit: string | null): string {
  return formatQtyWithUnit(raw, unit);
}
