import { Prisma } from "@bloqer/database";
import { hasOpenObligationBalance, OBLIGATION_OPEN_BALANCE_EPSILON } from "./obligation-date";

const ZERO = new Prisma.Decimal(0);

export function computeObligationBalanceDue(
  originalAmount: Prisma.Decimal,
  paidAmount: Prisma.Decimal,
): Prisma.Decimal {
  return originalAmount.minus(paidAmount);
}

/** MONEY_MODEL / D-053: saldo &lt; 0.01 (polvo sub-centavo) se trata como saldado.
 * Un centavo real (0.01) permanece abierto — no write-off de pagos parciales a 2 dp. */
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
