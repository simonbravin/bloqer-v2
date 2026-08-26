import { z } from "zod";
import {
  normalizeDecimalString,
  roundFxRate,
  roundMoney,
  roundQty,
  roundRatePct,
  compareDecimal,
  tryParseUserDecimal,
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

/** Quantity: round to 4 dp. Non-negative (invoice/procurement lines). */
export const qtyString = z
  .string()
  .trim()
  .regex(LOOSE_DECIMAL, "Cantidad inválida")
  .transform((v) => roundQty(v))
  .refine((v) => !v.startsWith("-"), "La cantidad no puede ser negativa");

/** True after qty round: not zero, not negative. */
export function isPositiveRoundedQty(v: string): boolean {
  return !v.startsWith("-") && !/^-?0+(\.0+)?$/.test(v);
}

/** Quantity > 0 after 4 dp round ([D-053]). */
export const positiveQtyString = qtyString.refine(
  isPositiveRoundedQty,
  "La cantidad debe ser mayor a cero",
);

/**
 * Line unit price: 4 dp (schema Decimal 18,4).
 * Needed so Factura B inclusive nets survive DRAFT re-save ([D-086]).
 */
export const unitPriceString = z
  .string()
  .trim()
  .regex(LOOSE_DECIMAL, "Precio inválido")
  .transform((v) => roundQty(v))
  .refine((v) => !v.startsWith("-"), "El precio no puede ser negativo");

/** Tax / rate percentage: round to 4 dp. */
export const ratePctString = z
  .string()
  .trim()
  .regex(LOOSE_DECIMAL, "Porcentaje inválido")
  .transform((v) => roundRatePct(v));

/** Line commercial discount % ([D-093]): 0–100 inclusive, 4 dp. Empty → 0. Accepts es-AR commas. */
export const discountPctString = z
  .string()
  .trim()
  .transform((v) => {
    if (v === "") return "0";
    const parsed = tryParseUserDecimal(v, "commit");
    return parsed == null || parsed === "" ? v : parsed;
  })
  .pipe(ratePctString)
  .refine((v) => {
    return compareDecimal(v, "0") >= 0 && compareDecimal(v, "100") <= 0;
  }, "El descuento debe estar entre 0 y 100");

/** Assert a raw string looks like a decimal before other transforms. */
export function isDecimalString(v: string): boolean {
  try {
    normalizeDecimalString(v);
    return true;
  } catch {
    return false;
  }
}
