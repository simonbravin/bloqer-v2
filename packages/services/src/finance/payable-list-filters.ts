import type { Prisma } from "@bloqer/database";
import { startOfTodayUtc } from "./pagination";

export type CompanyPayableStatusFilter =
  | "OPEN"
  | "PARTIAL"
  | "PAID"
  | "OVERDUE"
  | "CANCELLED";

function toMs(v: Date | string): number {
  return v instanceof Date ? v.getTime() : new Date(v).getTime();
}

/** Merge date bounds on the same field (gte/gt -> latest; lt/lte -> earliest). */
export function mergePayableDueDate(
  where: Prisma.PayableWhereInput,
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

/** Excludes settled lines when listing pending corporate/project payables. */
export function appendPendingPayablesFilter(where: Prisma.PayableWhereInput): void {
  Object.assign(where, { status: { notIn: ["PAID", "CANCELLED"] } });
}

export function appendPayableStatusFilter(
  where: Prisma.PayableWhereInput,
  status?: CompanyPayableStatusFilter,
  today: Date = startOfTodayUtc(),
): void {
  if (!status) return;
  switch (status) {
    case "OVERDUE": {
      const overdueOr: Prisma.PayableWhereInput = {
        OR: [
          { status: "OVERDUE" },
          { status: { in: ["OPEN", "PARTIAL"] }, dueDate: { lt: today } },
        ],
      };
      const existingAnd = where.AND
        ? Array.isArray(where.AND)
          ? where.AND
          : [where.AND]
        : [];
      where.AND = [...existingAnd, overdueOr];
      break;
    }
    case "OPEN":
      Object.assign(where, { status: "OPEN" });
      mergePayableDueDate(where, { gte: today });
      break;
    case "PARTIAL":
      Object.assign(where, { status: "PARTIAL" });
      mergePayableDueDate(where, { gte: today });
      break;
    default:
      Object.assign(where, { status });
  }
}
