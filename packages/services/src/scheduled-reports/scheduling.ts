import type { ScheduledReportFrequency } from "@bloqer/database";

export type CalculateNextRunAtInput = {
  frequency: ScheduledReportFrequency;
  timeOfDay: string;
  timezone: string;
  dayOfWeek?: number | null;
  dayOfMonth?: number | null;
  /** Instant after which the next run must occur (defaults to now). */
  after?: Date;
};

type LocalParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
};

function parseTimeOfDay(timeOfDay: string): { hour: number; minute: number } {
  const match = /^(\d{1,2}):(\d{2})$/.exec(timeOfDay.trim());
  if (!match) return { hour: 0, minute: 0 };
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (
    !Number.isFinite(hour) ||
    !Number.isFinite(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return { hour: 0, minute: 0 };
  }
  return { hour, minute };
}

function partsInTimezone(date: Date, timeZone: string): LocalParts {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  });
  const map = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  const weekdayShort = map.weekday ?? "Mon";
  const weekdayMap: Record<string, number> = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7,
  };
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    // Some engines report midnight as 24:00; normalize to 0.
    hour: (() => {
      const h = Number(map.hour);
      return h === 24 ? 0 : h;
    })(),
    minute: Number(map.minute),
    weekday: weekdayMap[weekdayShort] ?? 1,
  };
}

/** Convert local calendar date + time in `timeZone` to UTC `Date`. */
export function localDateTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const wallClock = Date.UTC(year, month - 1, day, hour, minute);
  let candidate = new Date(wallClock);
  for (let i = 0; i < 96; i++) {
    const p = partsInTimezone(candidate, timeZone);
    const delta = wallClock - Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    if (delta === 0) return candidate;
    candidate = new Date(candidate.getTime() + delta);
  }
  return candidate;
}

function shiftCalendarDay(parts: Pick<LocalParts, "year" | "month" | "day">, days: number) {
  const shifted = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() };
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function clampDayOfMonth(year: number, month: number, dayOfMonth: number): number {
  return Math.min(dayOfMonth, daysInMonth(year, month));
}

function candidateLocalDate(
  after: Date,
  timeZone: string,
  frequency: ScheduledReportFrequency,
  timeOfDay: string,
  dayOfWeek: number | null | undefined,
  dayOfMonth: number | null | undefined,
): { year: number; month: number; day: number; hour: number; minute: number } {
  const { hour, minute } = parseTimeOfDay(timeOfDay);
  const base = partsInTimezone(after, timeZone);
  const { year, month, day } = base;

  if (frequency === "DAILY") {
    const todayRun = localDateTimeToUtc(year, month, day, hour, minute, timeZone);
    if (todayRun.getTime() <= after.getTime()) {
      return { ...shiftCalendarDay(base, 1), hour, minute };
    }
    return { year, month, day, hour, minute };
  }

  if (frequency === "WEEKLY") {
    const targetDow = dayOfWeek ?? 1;
    let days = (targetDow - base.weekday + 7) % 7;
    if (days === 0 && localDateTimeToUtc(year, month, day, hour, minute, timeZone) <= after) {
      days = 7;
    }
    return { ...shiftCalendarDay(base, days), hour, minute };
  }

  const dom = dayOfMonth ?? 1;
  let y = year;
  let m = month;
  let d = clampDayOfMonth(y, m, dom);
  const runAt = localDateTimeToUtc(y, m, d, hour, minute, timeZone);
  if (runAt.getTime() <= after.getTime()) {
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    d = clampDayOfMonth(y, m, dom);
  }
  return { year: y, month: m, day: d, hour, minute };
}

/** Calendar YYYY-MM-DD in the given IANA timezone for `instant`. */
export function calendarDateInTimezone(instant: Date, timeZone: string): string {
  const p = partsInTimezone(instant, timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** Next scheduled run instant (UTC). */
export function calculateNextRunAt(input: CalculateNextRunAtInput): Date {
  const after = input.after ?? new Date();
  const local = candidateLocalDate(
    after,
    input.timezone,
    input.frequency,
    input.timeOfDay,
    input.dayOfWeek,
    input.dayOfMonth,
  );
  return localDateTimeToUtc(
    local.year,
    local.month,
    local.day,
    local.hour,
    local.minute,
    input.timezone,
  );
}
