import { Prisma } from "@bloqer/database";
import { hasOpenObligationBalance } from "./obligation-date";

export type ActiveObligationStoredStatus = "OPEN" | "PARTIAL" | "PAID";

/** BR-AR-002: persisted status after payment/collection based on amounts only. */
export function resolveObligationStoredStatus(
  paidAmount: Prisma.Decimal,
  originalAmount: Prisma.Decimal,
): ActiveObligationStoredStatus {
  const balance = originalAmount.minus(paidAmount);
  if (!hasOpenObligationBalance(balance)) return "PAID";
  if (paidAmount.greaterThan(0)) return "PARTIAL";
  return "OPEN";
}
