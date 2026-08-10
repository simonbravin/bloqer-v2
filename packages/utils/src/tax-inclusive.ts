import {
  addDecimal,
  divideDecimal,
  multiplyDecimal,
  normalizeDecimalString,
  QTY_DECIMALS,
  roundMoney,
  roundQty,
} from "./money";

export type GrossInclusiveLineAmounts = {
  /**
   * Net unit price to persist (4 dp — matches invoice line Decimal(18,4)).
   * 4 dp is required so exclusive recompute (qty × unit → 2 dp) rebuilds the same line money.
   */
  unitPriceNet: string;
  lineSubtotal: string;
  lineTax: string;
  /** Equals qty × gross unit (2 dp) — what the counterparty pays. */
  lineTotal: string;
};

/**
 * Factura B / precio final c/IVA ([D-086]): unit price entered is gross.
 * lineTotal = round(qty × gross); net = round(total / (1+rate/100)); tax = total − net.
 * unitPriceNet = Neto / qty at 4 dp so DRAFT re-save exclusive path does not drift.
 */
export function calcLineAmountsFromGrossInclusive(params: {
  quantity: string | number;
  unitPriceGross: string | number;
  taxRatePercent: string | number;
}): GrossInclusiveLineAmounts {
  const qty = normalizeDecimalString(params.quantity);
  const gross = normalizeDecimalString(params.unitPriceGross);
  const rate = normalizeDecimalString(params.taxRatePercent || "0");
  const lineTotal = roundMoney(multiplyDecimal(qty, gross));

  if (rate === "0" || rate === "0.0" || rate === "0.00" || rate === "0.0000") {
    return {
      unitPriceNet: roundQty(gross),
      lineSubtotal: lineTotal,
      lineTax: "0.00",
      lineTotal,
    };
  }

  const factor = addDecimal("1", divideDecimal(rate, "100", 8));
  const lineSubtotal = divideDecimal(lineTotal, factor, 2);
  const lineTax = roundMoney(addDecimal(lineTotal, multiplyDecimal(lineSubtotal, "-1")));
  const unitPriceNet =
    qty === "0" || qty === "0.0" || qty === "0.00" || qty === "0.0000"
      ? "0.0000"
      : divideDecimal(lineSubtotal, qty, QTY_DECIMALS);

  return { unitPriceNet, lineSubtotal, lineTax, lineTotal };
}

/** Preview helper: net unit from a single gross unit (qty=1). */
export function netUnitFromGrossInclusive(
  unitPriceGross: string | number,
  taxRatePercent: string | number,
): string {
  return calcLineAmountsFromGrossInclusive({
    quantity: "1",
    unitPriceGross,
    taxRatePercent,
  }).unitPriceNet;
}
