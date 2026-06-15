import { prisma, type Prisma } from "@bloqer/database";

/** Rows with material open balance (`originalAmount > paidAmount`). */
export function openPayableBalanceWhere(): Prisma.PayableWhereInput {
  return {
    originalAmount: { gt: prisma.payable.fields.paidAmount },
  };
}

/** Rows with material open balance (`originalAmount > paidAmount`). */
export function openReceivableBalanceWhere(): Prisma.ReceivableWhereInput {
  return {
    originalAmount: { gt: prisma.receivable.fields.paidAmount },
  };
}

function appendAndClause<T extends Prisma.PayableWhereInput | Prisma.ReceivableWhereInput>(
  where: T,
  clause: T,
): void {
  const existingAnd = where.AND
    ? Array.isArray(where.AND)
      ? where.AND
      : [where.AND]
    : [];
  where.AND = [...existingAnd, clause] as T["AND"];
}

export function appendPayableAnd(where: Prisma.PayableWhereInput, clause: Prisma.PayableWhereInput): void {
  appendAndClause(where, clause);
}

export function appendReceivableAnd(
  where: Prisma.ReceivableWhereInput,
  clause: Prisma.ReceivableWhereInput,
): void {
  appendAndClause(where, clause);
}
