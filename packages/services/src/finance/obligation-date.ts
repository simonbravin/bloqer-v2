import { Prisma } from "@bloqer/database";
import { startOfTodayUtc } from "./pagination";

/** Minimum open balance to count in KPIs/alerts (avoids sub-cent false positives). */
export const OBLIGATION_OPEN_BALANCE_EPSILON = new Prisma.Decimal("0.01");

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

type DecimalLike = { greaterThan(n: number | Prisma.Decimal): boolean };

/** True when obligation has material open balance (BR-AR-002). */
export function hasOpenObligationBalance(
  balanceDue: DecimalLike,
  epsilon: Prisma.Decimal = OBLIGATION_OPEN_BALANCE_EPSILON,
): boolean {
  return balanceDue.greaterThan(epsilon);
}

/**
 * D5 / BR-AR-002: display status derived from balance + due date.
 * Stored PAID/CANCELLED are preserved; zero balance always displays PAID.
 */
export function deriveObligationDisplayStatus(
  storedStatus: string,
  balanceDue: DecimalLike,
  dueDate: Date,
  asOf: Date = startOfTodayUtc(),
  paidAmount?: DecimalLike,
): ObligationDisplayStatus {
  if (storedStatus === "CANCELLED") return "CANCELLED";
  if (storedStatus === "PAID") return "PAID";
  if (!hasOpenObligationBalance(balanceDue)) return "PAID";
  if (isObligationOverdue(dueDate, asOf)) return "OVERDUE";
  if (paidAmount?.greaterThan(0)) return "PARTIAL";
  return "OPEN";
}
