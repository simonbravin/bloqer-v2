import { Prisma } from "@bloqer/database";
import { hasOpenObligationBalance } from "./obligation-date";

export type ActiveObligationStoredStatus = "OPEN" | "PARTIAL" | "PAID";

const ZERO = new Prisma.Decimal(0);

/**
 * BR-AR-002 / [D-115]: persisted status from amounts only.
 * `balanceDue = original − paid − credited`.
 * PARTIAL when any treasury payment or credit note reduced the open balance.
 */
export function resolveObligationStoredStatus(
  paidAmount: Prisma.Decimal,
  originalAmount: Prisma.Decimal,
  creditedAmount: Prisma.Decimal = ZERO,
): ActiveObligationStoredStatus {
  const balance = originalAmount.minus(paidAmount).minus(creditedAmount);
  if (!hasOpenObligationBalance(balance)) return "PAID";
  if (paidAmount.greaterThan(0) || creditedAmount.greaterThan(0)) return "PARTIAL";
  return "OPEN";
}
