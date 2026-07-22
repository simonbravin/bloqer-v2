import { Prisma } from "@bloqer/database";
import { roundMoney, serializeMoney } from "@bloqer/utils";

/** Half-up money (2 dp) as Prisma.Decimal — [D-053]. */
export function toMoneyDecimal(value: Prisma.Decimal | string | number): Prisma.Decimal {
  const raw = value instanceof Prisma.Decimal ? value.toString() : value;
  return new Prisma.Decimal(roundMoney(raw));
}

/** DTO boundary: always `"100.00"` style. */
export function serializeMoneyDecimal(value: Prisma.Decimal | string | number): string {
  const raw = value instanceof Prisma.Decimal ? value.toString() : value;
  return serializeMoney(raw);
}
