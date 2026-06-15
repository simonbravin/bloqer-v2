import type { Prisma } from "@bloqer/database";
import { appendReceivableAnd, openReceivableBalanceWhere } from "./obligation-balance-filter";
import { startOfTodayUtc } from "./pagination";

export type CompanyReceivableStatusFilter =
  | "OPEN"
  | "PARTIAL"
  | "PAID"
  | "OVERDUE"
  | "CANCELLED";

function toMs(v: Date | string): number {
  return v instanceof Date ? v.getTime() : new Date(v).getTime();
}

export function mergeReceivableDueDate(
  where: Prisma.ReceivableWhereInput,
  extra: Prisma.DateTimeFilter,
): void {
  const existing =
    where.dueDate && typeof where.dueDate === "object" && !Array.isArray(where.dueDate)
      ? (where.dueDate as Prisma.DateTimeFilter)
      : {};

  const merged: Prisma.DateTimeFilter = { ...existing };

  if (extra.gte !== undefined) {
    merged.gte =
      merged.gte !== undefined
        ? toMs(merged.gte) >= toMs(extra.gte)
          ? merged.gte
          : extra.gte
        : extra.gte;
  }
  if (extra.gt !== undefined) {
    merged.gt =
      merged.gt !== undefined
        ? toMs(merged.gt) >= toMs(extra.gt)
          ? merged.gt
          : extra.gt
        : extra.gt;
  }
  if (extra.lt !== undefined) {
    merged.lt =
      merged.lt !== undefined
        ? toMs(merged.lt) <= toMs(extra.lt)
          ? merged.lt
          : extra.lt
        : extra.lt;
  }
  if (extra.lte !== undefined) {
    merged.lte =
      merged.lte !== undefined
        ? toMs(merged.lte) <= toMs(extra.lte)
          ? merged.lte
          : extra.lte
        : extra.lte;
  }

  where.dueDate = merged;
}

export function appendPendingReceivablesFilter(where: Prisma.ReceivableWhereInput): void {
  appendReceivableAnd(where, {
    status: { notIn: ["PAID", "CANCELLED"] },
    ...openReceivableBalanceWhere(),
  });
}

export function appendReceivableStatusFilter(
  where: Prisma.ReceivableWhereInput,
  status?: CompanyReceivableStatusFilter,
  today: Date = startOfTodayUtc(),
): void {
  if (!status) return;
  switch (status) {
    case "OVERDUE": {
      const overdueOr: Prisma.ReceivableWhereInput = {
        OR: [
          { status: "OVERDUE" },
          { status: { in: ["OPEN", "PARTIAL"] }, dueDate: { lt: today } },
        ],
        ...openReceivableBalanceWhere(),
      };
      appendReceivableAnd(where, overdueOr);
      break;
    }
    case "OPEN":
      Object.assign(where, { status: "OPEN", ...openReceivableBalanceWhere() });
      mergeReceivableDueDate(where, { gte: today });
      break;
    case "PARTIAL":
      Object.assign(where, { status: "PARTIAL", ...openReceivableBalanceWhere() });
      mergeReceivableDueDate(where, { gte: today });
      break;
    default:
      Object.assign(where, { status });
  }
}
