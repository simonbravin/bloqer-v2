import { Prisma, type AccountType } from "@bloqer/database";

/** Debit-normal accounts: ASSET, EXPENSE. Credit-normal: LIABILITY, EQUITY, INCOME. [D-062] */
export function isDebitNormalAccountType(type: AccountType | string): boolean {
  return type === "ASSET" || type === "EXPENSE";
}

export function naturalBalance(
  type: AccountType | string,
  debit: Prisma.Decimal,
  credit: Prisma.Decimal,
): Prisma.Decimal {
  return isDebitNormalAccountType(type) ? debit.minus(credit) : credit.minus(debit);
}

export function naturalBalanceSignedString(
  type: AccountType | string,
  debit: Prisma.Decimal,
  credit: Prisma.Decimal,
): string {
  return naturalBalance(type, debit, credit).toString();
}

/** Running balance step: apply line to prior natural balance. */
export function applyNaturalRunningBalance(
  type: AccountType | string,
  prior: Prisma.Decimal,
  debit: Prisma.Decimal,
  credit: Prisma.Decimal,
): Prisma.Decimal {
  if (isDebitNormalAccountType(type)) {
    return prior.plus(debit).minus(credit);
  }
  return prior.plus(credit).minus(debit);
}
