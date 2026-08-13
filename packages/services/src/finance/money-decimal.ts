import { Prisma } from "@bloqer/database";
import { roundFxRate, roundMoney, roundQty, roundRatePct, serializeMoney, serializeUnitPrice } from "@bloqer/utils";

/** Duck-typed Decimal: never `instanceof` (duplicate decimal.js copies under Next.js). */
export type DecimalInput = string | number | { toString(): string };

function toPlainDecimalInput(value: DecimalInput): string | number {
  if (typeof value === "string" || typeof value === "number") return value;
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("INVALID_AMOUNT");
  }
  if (typeof value.toString !== "function" || value.toString === Object.prototype.toString) {
    throw new Error("INVALID_AMOUNT");
  }
  const s = value.toString();
  if (typeof s !== "string") throw new Error("INVALID_AMOUNT");
  return s;
}

/** Half-up money (2 dp) as Prisma.Decimal — [D-053]. */
export function toMoneyDecimal(value: DecimalInput): Prisma.Decimal {
  return new Prisma.Decimal(roundMoney(toPlainDecimalInput(value)));
}

/** DTO boundary: always `"100.00"` style. */
export function serializeMoneyDecimal(value: DecimalInput): string {
  return serializeMoney(toPlainDecimalInput(value));
}

/** DTO boundary for line unit prices (4 dp) — accepts Prisma.Decimal. */
export function serializeUnitPriceDecimal(value: DecimalInput): string {
  return serializeUnitPrice(toPlainDecimalInput(value));
}

/** DTO boundary for inventory / computation quantities (4 dp). */
export function serializeQtyDecimal(value: DecimalInput): string {
  return roundQty(toPlainDecimalInput(value));
}

/** DTO boundary for FX rates (6 dp). */
export function serializeFxRateDecimal(value: DecimalInput): string {
  return roundFxRate(toPlainDecimalInput(value));
}

/** DTO boundary for tax / overhead percentages (4 dp). */
export function serializeRatePctDecimal(value: DecimalInput): string {
  return roundRatePct(toPlainDecimalInput(value));
}
