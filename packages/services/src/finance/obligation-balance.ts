import { Prisma } from "@bloqer/database";
import { hasOpenObligationBalance, OBLIGATION_OPEN_BALANCE_EPSILON } from "./obligation-date";

const ZERO = new Prisma.Decimal(0);

export function computeObligationBalanceDue(
  originalAmount: Prisma.Decimal,
  paidAmount: Prisma.Decimal,
): Prisma.Decimal {
  return originalAmount.minus(paidAmount);
}

/** MONEY_MODEL § Redondeo: saldo ≤ 0.01 ARS se trata como saldado. */
export function normalizeObligationBalanceDue(balanceDue: Prisma.Decimal): Prisma.Decimal {
  return hasOpenObligationBalance(balanceDue) ? balanceDue : ZERO;
}

/** After a payment/collection, write off sub-cent dust so paidAmount matches original. */
export function effectiveObligationPaidAfterPayment(
  originalAmount: Prisma.Decimal,
  newPaidAmount: Prisma.Decimal,
): Prisma.Decimal {
  const balance = originalAmount.minus(newPaidAmount);
  if (!hasOpenObligationBalance(balance)) {
    return originalAmount;
  }
  return newPaidAmount;
}

export { OBLIGATION_OPEN_BALANCE_EPSILON };
