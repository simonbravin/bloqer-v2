export type CurrencyView = "original" | "ARS";

export function parseCurrencyView(value: string | null | undefined): CurrencyView {
  return value === "original" ? "original" : "ARS";
}

/** True when all listed currencies are ARS (safe to label consolidated KPIs as ARS). */
export function canConsolidateToArs(currencies: Iterable<string>): boolean {
  const set = new Set(currencies);
  if (set.size === 0) return true;
  return set.size === 1 && set.has("ARS");
}

/** Invoices with FX persisted (amountArs) can consolidate to ARS even if currency ≠ ARS. */
export function canConsolidateInvoicesToArs(
  rows: { currency: string; amountArs: string | number | { toString(): string } }[],
): boolean {
  if (rows.length === 0) return true;
  return rows.every((r) => {
    const cur = r.currency.trim().toUpperCase();
    if (cur === "ARS") return true;
    const ars = parseFloat(String(r.amountArs));
    return Number.isFinite(ars) && ars > 0;
  });
}

export type ProfitabilityCurrencySlice = {
  currency: string;
  revenue: string;
  directCost: string;
  grossMargin: string;
  grossMarginPct: string | null;
};
