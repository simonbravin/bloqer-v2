import { normalizeIvaRatePreset } from "@bloqer/domain";

export type QuoteLineMoneyInput = {
  unitPrice: string;
  discountPct: string;
  taxRate: string;
};

/** An empty global selector preserves mixed/non-preset rates until the user chooses one. */
export function quoteGlobalTaxRate(lines: Array<{ taxRate: string }>): string {
  const first = normalizeIvaRatePreset(lines[0]?.taxRate);
  return first && lines.every(line => normalizeIvaRatePreset(line.taxRate) === first) ? first : "";
}

/** D-117: preset controls must not replace a stored rate when opening an edit. */
export function initialQuoteLineMoney(
  initial: QuoteLineMoneyInput | undefined,
  defaultTaxRate: string,
): QuoteLineMoneyInput {
  return {
    unitPrice: initial?.unitPrice ?? "0",
    discountPct: initial?.discountPct ?? "0",
    taxRate: initial?.taxRate ?? defaultTaxRate,
  };
}
