import {
  addCalendarDays,
  calendarPartsInTimeZone,
  formatCalendarDate,
} from "@bloqer/utils";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Month key from UTC Y-M (Prisma `@db.Date` / filter bounds as UTC midnight). */
export function monthKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/** Current calendar month key in the product timezone. */
export function productMonthKey(d: Date = new Date()): string {
  const p = calendarPartsInTimeZone(d);
  return `${p.year}-${pad2(p.month)}`;
}

export function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  return new Date(Date.UTC(+y!, +m! - 1, 1)).toLocaleDateString("es-AR", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export const TREND_MONTH_OPTIONS = [1, 3, 6, 12] as const;
export type TrendMonths = (typeof TREND_MONTH_OPTIONS)[number];

export function parseTrendMonths(raw?: string | number): TrendMonths {
  const n = typeof raw === "string" ? Number(raw) : raw;
  if (n === 1 || n === 3 || n === 6 || n === 12) return n;
  return 12;
}

export function defaultReportDateRange(
  monthsBack = 12,
  now: Date = new Date(),
): { dateFrom: string; dateTo: string } {
  const parts = calendarPartsInTimeZone(now);
  const dateTo = formatCalendarDate(parts);
  const pivot = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0));
  pivot.setUTCMonth(pivot.getUTCMonth() - monthsBack);
  return {
    dateFrom: formatCalendarDate({
      year: pivot.getUTCFullYear(),
      month: pivot.getUTCMonth() + 1,
      day: pivot.getUTCDate(),
    }),
    dateTo,
  };
}

export function pickCurrentMonthItem<T extends { periodKey: string }>(
  items: T[],
  now = new Date(),
): T | undefined {
  const key = productMonthKey(now);
  return items.find((i) => i.periodKey === key);
}

/** Calendar month for “este mes”; otherwise last N months via `defaultReportDateRange`. */
export function trendDateRange(
  months: TrendMonths,
  now: Date = new Date(),
): { dateFrom: string; dateTo: string } {
  if (months !== 1) return defaultReportDateRange(months, now);
  const parts = calendarPartsInTimeZone(now);
  return {
    dateFrom: `${parts.year}-${pad2(parts.month)}-01`,
    dateTo: formatCalendarDate(parts),
  };
}

export function parseFilterDate(s: string, endOfDay: boolean): Date {
  return new Date(`${s}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
}

export function inDateRange(d: Date, dateFrom?: string, dateTo?: string): boolean {
  if (dateFrom && d < parseFilterDate(dateFrom, false)) return false;
  if (dateTo && d > parseFilterDate(dateTo, true)) return false;
  return true;
}

/** Payables/receivables due on or before horizon end (includes overdue + upcoming). */
export function isDueOnOrBeforeHorizon(dueDate: Date, dateTo: string): boolean {
  return dueDate <= parseFilterDate(dateTo, true);
}

/**
 * Month bucket for projection charts.
 * Overdue items (due before horizon start) roll into the first month of the horizon.
 */
export function projectionBucketKey(dueDate: Date, dateFrom: string, dateTo: string): string | null {
  if (!isDueOnOrBeforeHorizon(dueDate, dateTo)) return null;
  const horizonStart = parseFilterDate(dateFrom, false);
  const bucketDate = dueDate < horizonStart ? horizonStart : dueDate;
  return monthKey(bucketDate);
}

export function projectionHorizon(
  daysAhead = 90,
  now: Date = new Date(),
): { dateFrom: string; dateTo: string } {
  const parts = calendarPartsInTimeZone(now);
  return {
    dateFrom: formatCalendarDate(parts),
    dateTo: formatCalendarDate(addCalendarDays(parts, daysAhead)),
  };
}
