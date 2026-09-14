import { Prisma } from "@bloqer/database";
import { hasOpenObligationBalance, OBLIGATION_OPEN_BALANCE_EPSILON } from "./obligation-date";

const ZERO = new Prisma.Decimal(0);

/**
 * Balance due on Receivable/Payable ([D-115]):
 * `originalAmount − paidAmount − creditedAmount`
 * `paidAmount` = treasury only; `creditedAmount` = applied CREDIT_NOTE totals.
 */
export function computeObligationBalanceDue(
  originalAmount: Prisma.Decimal,
  paidAmount: Prisma.Decimal,
  creditedAmount: Prisma.Decimal = ZERO,
): Prisma.Decimal {
  return originalAmount.minus(paidAmount).minus(creditedAmount);
}

/** MONEY_MODEL / D-053: saldo &lt; 0.01 (polvo sub-centavo) se trata como saldado.
 * Un centavo real (0.01) permanece abierto — no write-off de pagos parciales a 2 dp. */
export function normalizeObligationBalanceDue(balanceDue: Prisma.Decimal): Prisma.Decimal {
  return hasOpenObligationBalance(balanceDue) ? balanceDue : ZERO;
}

/**
 * After a payment/collection, write off sub-cent dust so paidAmount settles the
 * remaining open slice after credits ([D-053] / [D-115]).
 */
export function effectiveObligationPaidAfterPayment(
  originalAmount: Prisma.Decimal,
  newPaidAmount: Prisma.Decimal,
  creditedAmount: Prisma.Decimal = ZERO,
): Prisma.Decimal {
  const balance = originalAmount.minus(newPaidAmount).minus(creditedAmount);
  if (!hasOpenObligationBalance(balance)) {
    return originalAmount.minus(creditedAmount);
  }
  return newPaidAmount;
}

/**
 * After applying a credit note, write off sub-cent dust onto creditedAmount
 * so the obligation settles cleanly ([D-115]).
 */
export function effectiveObligationCreditedAfterCredit(
  originalAmount: Prisma.Decimal,
  paidAmount: Prisma.Decimal,
  newCreditedAmount: Prisma.Decimal,
): Prisma.Decimal {
  const balance = originalAmount.minus(paidAmount).minus(newCreditedAmount);
  if (!hasOpenObligationBalance(balance)) {
    return originalAmount.minus(paidAmount);
  }
  return newCreditedAmount;
}

export { OBLIGATION_OPEN_BALANCE_EPSILON };
