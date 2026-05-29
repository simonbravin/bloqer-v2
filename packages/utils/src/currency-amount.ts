export type FxAmountInput = {
  currency: string;
  amount: string | number;
  fxRate?: string | number | null;
};

function toNum(v: string | number): number {
  const n = typeof v === "number" ? v : parseFloat(v);
  if (!Number.isFinite(n)) throw new Error("INVALID_AMOUNT");
  return n;
}

/**
 * D-008: fx_rate = ARS per 1 unit of foreign currency; amount_ars = amount × fx_rate.
 * ARS documents use fx_rate = 1.
 */
export function resolveFxAmounts(input: FxAmountInput): { fxRate: string; amountArs: string } {
  const amount = toNum(input.amount);
  const currency = input.currency.trim().toUpperCase();

  if (currency === "ARS") {
    return { fxRate: "1", amountArs: amount.toFixed(4) };
  }

  const fx =
    input.fxRate != null && String(input.fxRate).trim() !== "" ? toNum(input.fxRate) : NaN;

  if (!Number.isFinite(fx) || fx <= 0) {
    throw new Error("FX_RATE_REQUIRED");
  }

  return { fxRate: fx.toFixed(6), amountArs: (amount * fx).toFixed(4) };
}

export function sumAmountArsStrings(rows: { amountArs: string }[]): string {
  const total = rows.reduce((s, r) => s + toNum(r.amountArs), 0);
  return total.toFixed(4);
}
