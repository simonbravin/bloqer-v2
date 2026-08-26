import {
  addDecimal,
  compareDecimal,
  divideDecimal,
  multiplyDecimal,
  normalizeDecimalString,
  QTY_DECIMALS,
  roundMoney,
  roundQty,
  roundRatePct,
} from "./money";
import { calcLineAmountsFromGrossInclusive } from "./tax-inclusive";

export type ExclusiveLineAmounts = {
  discountAmount: string;
  lineSubtotal: string;
  lineTax: string;
  lineTotal: string;
};

export type DocumentLineAmounts = ExclusiveLineAmounts & {
  /** List net unit price to persist (4 dp). Never includes the discount. */
  unitPriceNet: string;
};

/**
 * Canonical discount % ([D-093]): 0–100 inclusive, 4 dp. Empty → 0.
 * Throws `DISCOUNT_PCT_OUT_OF_RANGE` / `INVALID_AMOUNT` so callers never persist a negative net.
 */
export function normalizeDiscountPct(raw?: string | number | null): string {
  if (raw == null || String(raw).trim() === "") return "0.0000";
  const pct = roundRatePct(normalizeDecimalString(String(raw).trim()));
  if (compareDecimal(pct, "0") < 0 || compareDecimal(pct, "100") > 0) {
    throw new Error("DISCOUNT_PCT_OUT_OF_RANGE");
  }
  return pct;
}

/**
 * Tax-exclusive line money ([D-053] / [D-093]).
 * Discount applies to the rounded qty×price subtotal, then IVA.
 */
export function calcExclusiveLineAmounts(params: {
  quantity: string | number;
  unitPriceNet: string | number;
  taxRatePercent: string | number;
  discountPct?: string | number;
}): ExclusiveLineAmounts {
  const qty = normalizeDecimalString(params.quantity);
  const price = normalizeDecimalString(params.unitPriceNet);
  const rate = normalizeDecimalString(params.taxRatePercent || "0");
  const pct = normalizeDiscountPct(params.discountPct);

  const grossSubtotal = roundMoney(multiplyDecimal(qty, price));
  const discountAmount = roundMoney(divideDecimal(multiplyDecimal(grossSubtotal, pct), "100"));
  const lineSubtotal = roundMoney(addDecimal(grossSubtotal, multiplyDecimal(discountAmount, "-1")));
  const lineTax = roundMoney(divideDecimal(multiplyDecimal(lineSubtotal, rate), "100"));
  const lineTotal = roundMoney(addDecimal(lineSubtotal, lineTax));
  return { discountAmount, lineSubtotal, lineTax, lineTotal };
}

/**
 * Preview / persist helper for AP/AR/OC/quotes.
 * Factura B: extract list net from gross first ([D-086]), then apply [D-093] on that net.
 */
export function resolveDocumentLineAmounts(params: {
  quantity: string | number;
  unitPrice: string | number;
  taxRatePercent: string | number;
  discountPct?: string | number;
  pricesIncludeTax?: boolean;
}): DocumentLineAmounts {
  const qty = normalizeDecimalString(params.quantity);
  const rate = normalizeDecimalString(params.taxRatePercent || "0");
  const pct = normalizeDiscountPct(params.discountPct);

  if (params.pricesIncludeTax) {
    const list = calcLineAmountsFromGrossInclusive({
      quantity: qty,
      unitPriceGross: params.unitPrice,
      taxRatePercent: rate,
    });
    const discounted = calcExclusiveLineAmounts({
      quantity: qty,
      unitPriceNet: list.unitPriceNet,
      taxRatePercent: rate,
      discountPct: pct,
    });
    return { unitPriceNet: list.unitPriceNet, ...discounted };
  }

  const unitPriceNet = roundQty(normalizeDecimalString(params.unitPrice));
  const discounted = calcExclusiveLineAmounts({
    quantity: qty,
    unitPriceNet,
    taxRatePercent: rate,
    discountPct: pct,
  });
  return { unitPriceNet, ...discounted };
}

/**
 * Net unit after discount, 4 dp — for variance / quote ceiling / saldo.
 * Uses the given qty so line-level rounding matches persisted lineSubtotal / qty.
 */
export function effectiveUnitPriceNet(params: {
  quantity: string | number;
  unitPriceNet: string | number;
  discountPct?: string | number;
}): string {
  const qty = normalizeDecimalString(params.quantity);
  if (/^-?0+(\.0+)?$/.test(qty)) return "0.0000";
  const { lineSubtotal } = calcExclusiveLineAmounts({
    quantity: qty,
    unitPriceNet: params.unitPriceNet,
    taxRatePercent: "0",
    discountPct: params.discountPct,
  });
  return divideDecimal(lineSubtotal, qty, QTY_DECIMALS);
}
