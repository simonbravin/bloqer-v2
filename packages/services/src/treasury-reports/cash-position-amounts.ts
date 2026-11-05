import { Prisma } from "@bloqer/database";
import { resolveOpeningBase } from "../treasury/balance.service";

type PositionMovementGroup = {
  currency: string;
  type: string;
  status: string;
  sourceType: string;
  _sum: { amount: Prisma.Decimal | null; amountArs: Prisma.Decimal | null };
  _count: { _all: number; amountArs: number; fxRate: number };
  _min: { fxRate: Prisma.Decimal | null };
};

export function signedTreasuryAmount(type: string, amount: Prisma.Decimal): Prisma.Decimal {
  return type === "INFLOW" || type === "TRANSFER_IN" ? amount : amount.negated();
}

export function cashPositionCurrency(currency: string): string {
  return currency.trim().toUpperCase();
}

/** Aggregate nominal and historical equivalents from the same set of contributing rows. */
export function cashPositionAmounts(
  account: { currency: string; openingBalance: Prisma.Decimal },
  groups: PositionMovementGroup[],
): { balance: Prisma.Decimal; balanceArs: Prisma.Decimal | null } {
  const accountCurrency = cashPositionCurrency(account.currency);
  const base = resolveOpeningBase(account.openingBalance, groups.some((group) => group.sourceType === "OPENING_BALANCE"));
  let balance = base;
  let balanceArs = accountCurrency === "ARS" || base.isZero() ? base : null;

  for (const group of groups) {
    if ((group.status !== "CONFIRMED" && group.status !== "RECONCILED") || !group._sum.amount) continue;
    const nominal = signedTreasuryAmount(group.type, group._sum.amount);
    balance = balance.plus(nominal);
    if (balanceArs === null) continue;

    const movementCurrency = cashPositionCurrency(group.currency);
    if (movementCurrency !== accountCurrency) {
      balanceArs = null;
    } else if (movementCurrency === "ARS") {
      balanceArs = balanceArs.plus(nominal);
    } else if (
      group._count.amountArs === group._count._all && group._count.fxRate === group._count._all &&
      group._sum.amountArs !== null && group._min.fxRate?.gt(0)
    ) {
      balanceArs = balanceArs.plus(signedTreasuryAmount(group.type, group._sum.amountArs));
    } else {
      balanceArs = null;
    }
  }

  return { balance, balanceArs };
}

export function consolidateCashPositionArs(accounts: Array<{ balanceArs: Prisma.Decimal | null }>): Prisma.Decimal | null {
  let total = new Prisma.Decimal(0);
  for (const account of accounts) {
    if (account.balanceArs === null) return null;
    total = total.plus(account.balanceArs);
  }
  return total;
}
