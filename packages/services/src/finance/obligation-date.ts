import { startOfTodayUtc } from "./pagination";

/** Normalizes a calendar date to UTC midnight (@db.Date semantics). */
export function startOfDayUtc(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

/** Reference date for aging / overdue checks (defaults to today UTC). */
export function parseObligationAsOfDate(asOfDate?: string): Date {
  if (asOfDate) return startOfDayUtc(new Date(asOfDate));
  return startOfTodayUtc();
}

/** True when due date is strictly before the as-of calendar day (UTC). Due today is NOT overdue. */
export function isObligationOverdue(dueDate: Date, asOf: Date = startOfTodayUtc()): boolean {
  return startOfDayUtc(dueDate).getTime() < startOfDayUtc(asOf).getTime();
}

export function obligationDaysOverdue(dueDate: Date, asOf: Date = startOfTodayUtc()): number {
  const dueMs = startOfDayUtc(dueDate).getTime();
  const asOfMs = startOfDayUtc(asOf).getTime();
  return Math.max(0, Math.floor((asOfMs - dueMs) / 86_400_000));
}

export type ObligationDisplayStatus = "OPEN" | "PARTIAL" | "PAID" | "OVERDUE" | "CANCELLED";

/** D5 / BR-AR-002: OVERDUE derived on read when balance remains and due date passed. */
export function deriveObligationDisplayStatus(
  storedStatus: string,
  balanceDue: { greaterThan(n: 0): boolean },
  dueDate: Date,
  asOf: Date = startOfTodayUtc(),
): ObligationDisplayStatus {
  if (storedStatus === "PAID" || storedStatus === "CANCELLED") {
    return storedStatus as ObligationDisplayStatus;
  }
  if (balanceDue.greaterThan(0) && isObligationOverdue(dueDate, asOf)) {
    return "OVERDUE";
  }
  return storedStatus as ObligationDisplayStatus;
}
