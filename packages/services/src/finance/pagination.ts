import { defaultCalendarDateRangeDays } from "@bloqer/utils";

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
export const DEFAULT_CASH_DATE_RANGE_DAYS = 90;
export const MAX_EXPORT_ROWS = 10_000;
export const MAX_CORPORATE_PAYMENT_FILTER_IDS = 10_000;

export function resolvePagination(opts?: { page?: number; pageSize?: number }) {
  const requestedPage = opts?.page ?? 1;
  const requestedSize = opts?.pageSize ?? DEFAULT_PAGE_SIZE;
  let page = Number.isSafeInteger(requestedPage) ? Math.max(1, requestedPage) : 1;
  const pageSize = Number.isSafeInteger(requestedSize)
    ? Math.min(MAX_PAGE_SIZE, Math.max(1, requestedSize))
    : DEFAULT_PAGE_SIZE;
  // Prisma's skip is a signed 32-bit Int; malformed URLs must not reach the query.
  if ((page - 1) * pageSize > 2_147_483_647) page = 1;
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

/** Rolling window ending today in product TZ (America/Argentina/Buenos_Aires). */
export function defaultDateRangeDays(days: number): { dateFrom: string; dateTo: string } {
  return defaultCalendarDateRangeDays(days);
}

export function startOfTodayUtc(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}
