import type { Prisma } from "@bloqer/database";

/** D-137: the bank works by value date, falling back to accounting date for older movements. */
export function bankReconciliationDateWhere(
  periodStart: Date,
  periodEnd: Date,
): Prisma.AccountMovementWhereInput {
  const range = { gte: periodStart, lte: periodEnd };
  return { OR: [{ valueDate: range }, { valueDate: null, movementDate: range }] };
}
