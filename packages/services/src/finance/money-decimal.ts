import { Prisma } from "@bloqer/database";
import { roundMoney, serializeMoney, serializeUnitPrice } from "@bloqer/utils";

function toPlainDecimalInput(value: Prisma.Decimal | string | number): string | number {
  return value instanceof Prisma.Decimal ? value.toString() : value;
}

/** Half-up money (2 dp) as Prisma.Decimal — [D-053]. */
export function toMoneyDecimal(value: Prisma.Decimal | string | number): Prisma.Decimal {
  return new Prisma.Decimal(roundMoney(toPlainDecimalInput(value)));
}

/** DTO boundary: always `"100.00"` style. */
export function serializeMoneyDecimal(value: Prisma.Decimal | string | number): string {
  return serializeMoney(toPlainDecimalInput(value));
}

/** DTO boundary for line unit prices (4 dp) — accepts Prisma.Decimal. */
export function serializeUnitPriceDecimal(value: Prisma.Decimal | string | number): string {
  return serializeUnitPrice(toPlainDecimalInput(value));
}
