/**
 * Calendar-date helpers in the product timezone (es-AR).
 * Avoids UTC off-by-one on Vercel (UTC) vs Argentina evening.
 */

export const PRODUCT_TIMEZONE = "America/Argentina/Buenos_Aires";

export type CalendarDateParts = {
  year: number;
  month: number;
  day: number;
};

export type DateRangePresetId = "week" | "month" | "d90" | "ytd";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function formatCalendarDate(parts: CalendarDateParts): string {
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
}

/** Calendar Y/M/D for `date` in `timeZone` (defaults to product TZ). */
export function calendarPartsInTimeZone(
  date: Date = new Date(),
  timeZone: string = PRODUCT_TIMEZONE,
): CalendarDateParts {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(date);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  if (!y || !m || !d) {
    return {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
    };
  }
  return { year: Number(y), month: Number(m), day: Number(d) };
}

/** YYYY-MM-DD for `date` in the product timezone. */
export function toIsoDateInTimeZone(
  date: Date = new Date(),
  timeZone: string = PRODUCT_TIMEZONE,
): string {
  return formatCalendarDate(calendarPartsInTimeZone(date, timeZone));
}

/** Day of week in timezone: 0 = Sunday … 6 = Saturday. */
function dayOfWeekInTimeZone(date: Date, timeZone: string): number {
  const wd = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(date);
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[wd] ?? 0;
}

/** UTC noon for a calendar Y-M-D — stable pivot for day arithmetic. */
function utcNoonForParts(parts: CalendarDateParts): Date {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0, 0));
}

/** Subtract calendar days from a Y-M-D (timezone-safe via UTC noon pivot). */
export function addCalendarDays(parts: CalendarDateParts, deltaDays: number): CalendarDateParts {
  const pivot = utcNoonForParts(parts);
  pivot.setUTCDate(pivot.getUTCDate() + deltaDays);
  return {
    year: pivot.getUTCFullYear(),
    month: pivot.getUTCMonth() + 1,
    day: pivot.getUTCDate(),
  };
}

/**
 * Quick date-range presets used by list/ledger filters.
 * All bounds are inclusive calendar dates in the product timezone.
 */
export function computeDateRangePreset(
  id: DateRangePresetId,
  now: Date = new Date(),
  timeZone: string = PRODUCT_TIMEZONE,
): { dateFrom: string; dateTo: string } {
  const today = calendarPartsInTimeZone(now, timeZone);
  const dateTo = formatCalendarDate(today);

  switch (id) {
    case "week": {
      const mondayOffset = (dayOfWeekInTimeZone(now, timeZone) + 6) % 7;
      return {
        dateFrom: formatCalendarDate(addCalendarDays(today, -mondayOffset)),
        dateTo,
      };
    }
    case "month":
      return {
        dateFrom: `${today.year}-${pad2(today.month)}-01`,
        dateTo,
      };
    case "d90":
      return {
        dateFrom: formatCalendarDate(addCalendarDays(today, -90)),
        dateTo,
      };
    case "ytd":
      return {
        dateFrom: `${today.year}-01-01`,
        dateTo,
      };
  }
}

/** Rolling window ending today (product TZ): last `days` calendar days inclusive of today. */
export function defaultCalendarDateRangeDays(
  days: number,
  now: Date = new Date(),
  timeZone: string = PRODUCT_TIMEZONE,
): { dateFrom: string; dateTo: string } {
  const today = calendarPartsInTimeZone(now, timeZone);
  return {
    dateFrom: formatCalendarDate(addCalendarDays(today, -days)),
    dateTo: formatCalendarDate(today),
  };
}
