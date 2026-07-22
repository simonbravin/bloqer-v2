import {
  addDecimal,
  multiplyDecimal,
  roundAmountArs,
  roundFxRate,
  roundMoney,
} from "./money";

export type FxAmountInput = {
  currency: string;
  amount: string | number;
  fxRate?: string | number | null;
};

/**
 * D-008 / D-053: fx_rate = ARS per 1 unit of foreign currency;
 * amount_ars = roundMoney(roundMoney(amount) × fx_rate) to 2 dp.
 * ARS documents use fx_rate = 1.
 * Decimal-safe (no float).
 */
export function resolveFxAmounts(input: FxAmountInput): { fxRate: string; amountArs: string } {
  const currency = input.currency.trim().toUpperCase();
  const amount = roundMoney(input.amount);

  if (currency === "ARS") {
    return { fxRate: roundFxRate("1"), amountArs: roundAmountArs(amount) };
  }

  const fxRaw =
    input.fxRate != null && String(input.fxRate).trim() !== "" ? input.fxRate : null;
  if (fxRaw == null) throw new Error("FX_RATE_REQUIRED");

  const fxRate = roundFxRate(fxRaw);
  if (/^-?0+(\.0+)?$/.test(fxRate) || fxRate.startsWith("-")) {
    throw new Error("FX_RATE_REQUIRED");
  }

  return { fxRate, amountArs: roundAmountArs(multiplyDecimal(amount, fxRate)) };
}

export function sumAmountArsStrings(rows: { amountArs: string }[]): string {
  let total = "0";
  for (const r of rows) {
    total = addDecimal(total, r.amountArs);
  }
  return roundAmountArs(total);
}
