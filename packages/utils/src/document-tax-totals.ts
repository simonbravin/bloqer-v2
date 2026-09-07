import {
  addDecimal,
  divideDecimal,
  multiplyDecimal,
  normalizeDecimalString,
  roundMoney,
  roundRatePct,
} from "./money";

/**
 * Default IIBB perception rate for new purchase/sales documents in Mendoza ops ([D-112]).
 * Stored as percent (3 = 3%). Editable per document; not a fiscal engine.
 */
export const DEFAULT_IIBB_PERCEPTION_RATE_PCT = "3";

export type DocumentHeaderTaxTotals = {
  subtotal: string;
  taxAmount: string;
  iibbPerceptionAmount: string;
  totalAmount: string;
};

/** `amount = roundMoney(subtotal × rate / 100)` — base is net subtotal before IVA ([D-112]). */
export function calcIibbPerceptionAmount(params: {
  subtotal: string | number;
  ratePercent: string | number;
}): string {
  const sub = normalizeDecimalString(params.subtotal);
  const rate = normalizeDecimalString(params.ratePercent || "0");
  return roundMoney(divideDecimal(multiplyDecimal(sub, rate), "100"));
}

/**
 * Header money after line rollup ([D-053] / [D-112]):
 * `total = subtotal + IVA(taxAmount) + percepción IIBB`.
 * Perception is document-level on net subtotal (not per line).
 */
export function calcDocumentHeaderTaxTotals(params: {
  subtotal: string | number;
  taxAmount: string | number;
  iibbPerceptionRatePercent: string | number;
  /** When set, use this amount instead of rate × subtotal (centavo match to voucher). */
  iibbPerceptionAmountOverride?: string | number | null;
}): DocumentHeaderTaxTotals {
  const subtotal = roundMoney(normalizeDecimalString(params.subtotal));
  const taxAmount = roundMoney(normalizeDecimalString(params.taxAmount));
  const override = params.iibbPerceptionAmountOverride;
  const iibbPerceptionAmount =
    override != null && String(override).trim() !== ""
      ? roundMoney(normalizeDecimalString(override))
      : calcIibbPerceptionAmount({
          subtotal,
          ratePercent: params.iibbPerceptionRatePercent,
        });
  const totalAmount = roundMoney(addDecimal(addDecimal(subtotal, taxAmount), iibbPerceptionAmount));
  return { subtotal, taxAmount, iibbPerceptionAmount, totalAmount };
}

export function normalizeIibbPerceptionRate(raw?: string | number | null): string {
  if (raw == null || String(raw).trim() === "") {
    return roundRatePct(DEFAULT_IIBB_PERCEPTION_RATE_PCT);
  }
  return roundRatePct(normalizeDecimalString(String(raw).trim()));
}
