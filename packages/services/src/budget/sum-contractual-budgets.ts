import { Prisma } from "@bloqer/database";

/**
 * [BR-BUD-003] / [D-002]: the project budget reading is the sum of every
 * contractual phase (APPROVED + CLOSED). Addenda complement; they do not replace.
 */
export type ContractualBudgetMoneyInput = {
  currency: string;
  totalSalePrice: Prisma.Decimal;
  totalCost: Prisma.Decimal;
};

export type ContractualBudgetMoneySum = {
  currency: string;
  totalSalePrice: Prisma.Decimal;
  totalCost: Prisma.Decimal;
};

const ZERO = new Prisma.Decimal(0);

/**
 * Home card has a single amount. Sum every contractual phase when they share
 * one currency. Several currencies cannot be shown as one number ([BR-BUD-003]).
 */
export function pickContractualBudgetCard(
  rows: ContractualBudgetMoneyInput[],
): ContractualBudgetMoneySum | null {
  if (rows.length === 0) return null;
  const currencies = new Set(rows.map((row) => row.currency));
  if (currencies.size !== 1) return null;
  return sumContractualBudgetsByCurrency(rows)[0] ?? null;
}

export function sumContractualBudgetsByCurrency(
  rows: ContractualBudgetMoneyInput[],
): ContractualBudgetMoneySum[] {
  const map = new Map<string, { sale: Prisma.Decimal; cost: Prisma.Decimal }>();
  for (const row of rows) {
    const current = map.get(row.currency) ?? { sale: ZERO, cost: ZERO };
    current.sale = current.sale.add(row.totalSalePrice);
    current.cost = current.cost.add(row.totalCost);
    map.set(row.currency, current);
  }
  return [...map.entries()]
    .map(([currency, totals]) => ({
      currency,
      totalSalePrice: totals.sale,
      totalCost: totals.cost,
    }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
}
