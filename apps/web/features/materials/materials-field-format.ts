/** Qty display es-AR without IEEE float (trim trailing zeros). */
export function formatMaterialsFieldQty(raw: string): string {
  const t = raw.trim();
  if (!/^-?\d+(\.\d+)?$/.test(t)) return raw;
  const sign = t.startsWith("-") ? "-" : "";
  const abs = sign ? t.slice(1) : t;
  const [intPart, decPart = ""] = abs.split(".");
  const withThousands = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const trimmedDec = decPart.replace(/0+$/, "").slice(0, 4);
  return trimmedDec ? `${sign}${withThousands},${trimmedDec}` : `${sign}${withThousands}`;
}

export function formatMaterialsFieldQtyWithUnit(raw: string, unit: string | null): string {
  const qty = formatMaterialsFieldQty(raw);
  return unit ? `${qty} ${unit}` : qty;
}
