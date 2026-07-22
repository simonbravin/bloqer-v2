import { z } from "zod";
import {
  normalizeDecimalString,
  roundFxRate,
  roundMoney,
  roundQty,
  roundRatePct,
} from "@bloqer/utils";

const LOOSE_DECIMAL = /^-?\d+(\.\d+)?$/;

/**
 * Money amount string: accepts historical >2 dp drafts, half-up rounds to 2 ([D-053]).
 */
export const moneyAmountString = z
  .string()
  .trim()
  .regex(LOOSE_DECIMAL, "Monto inválido")
  .transform((v) => roundMoney(v));

/** Same as moneyAmountString but must be > 0 after rounding. */
export const positiveMoneyAmountString = moneyAmountString.refine(
  (v) => !/^-?0+(\.0+)?$/.test(v) && !v.startsWith("-"),
  "El monto debe ser mayor a 0",
);

/**
 * Optional money: empty/null → undefined; otherwise validate + round to 2.
 * Invalid non-empty strings fail with Zod error (no throw from transform).
 */
export const optionalMoneyAmountString = z.preprocess((v) => {
  if (v == null) return undefined;
  if (typeof v === "string" && v.trim() === "") return undefined;
  return v;
}, moneyAmountString.optional());

/** FX rate: round to 6 dp. */
export const fxRateString = z
  .string()
  .trim()
  .regex(LOOSE_DECIMAL, "Tipo de cambio inválido")
  .transform((v) => roundFxRate(v))
  .refine((v) => !/^-?0+(\.0+)?$/.test(v) && !v.startsWith("-"), "Tipo de cambio inválido");

export const optionalFxRateString = z.preprocess((v) => {
  if (v == null) return undefined;
  if (typeof v === "string" && v.trim() === "") return undefined;
  return v;
}, fxRateString.optional());

/** Quantity: round to 4 dp. */
export const qtyString = z
  .string()
  .trim()
  .regex(LOOSE_DECIMAL, "Cantidad inválida")
  .transform((v) => roundQty(v));

/** Tax / rate percentage: round to 4 dp. */
export const ratePctString = z
  .string()
  .trim()
  .regex(LOOSE_DECIMAL, "Porcentaje inválido")
  .transform((v) => roundRatePct(v));

/** Assert a raw string looks like a decimal before other transforms. */
export function isDecimalString(v: string): boolean {
  try {
    normalizeDecimalString(v);
    return true;
  } catch {
    return false;
  }
}
