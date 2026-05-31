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
  const [h, m] = timeOfDay.split(":").map((x) => Number(x));
  return { hour: h!, minute: m! };
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
    hour: Number(map.hour),
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
  let candidate = new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0));
  for (let i = 0; i < 96; i++) {
    const p = partsInTimezone(candidate, timeZone);
    if (
      p.year === year &&
      p.month === month &&
      p.day === day &&
      p.hour === hour &&
      p.minute === minute
    ) {
      return candidate;
    }
    const targetMin = hour * 60 + minute;
    const actualMin = p.hour * 60 + p.minute;
    let deltaMin = targetMin - actualMin;
    if (p.day !== day) deltaMin += (day - p.day) * 24 * 60;
    if (p.month !== month || p.year !== year) {
      const target = Date.UTC(year, month - 1, day);
      const actual = Date.UTC(p.year, p.month - 1, p.day);
      deltaMin += Math.round((target - actual) / 60_000);
    }
    candidate = new Date(candidate.getTime() + deltaMin * 60_000);
  }
  return candidate;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
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
  let { year, month, day } = base;

  if (frequency === "DAILY") {
    const todayRun = localDateTimeToUtc(year, month, day, hour, minute, timeZone);
    if (todayRun.getTime() <= after.getTime()) {
      const next = new Date(after.getTime() + 24 * 60 * 60_000);
      const p = partsInTimezone(next, timeZone);
      year = p.year;
      month = p.month;
      day = p.day;
    }
    return { year, month, day, hour, minute };
  }

  if (frequency === "WEEKLY") {
    const targetDow = dayOfWeek ?? 1;
    let cursor = new Date(after.getTime());
    for (let i = 0; i < 370; i++) {
      const p = partsInTimezone(cursor, timeZone);
      if (p.weekday === targetDow) {
        const runAt = localDateTimeToUtc(p.year, p.month, p.day, hour, minute, timeZone);
        if (runAt.getTime() > after.getTime()) {
          return { year: p.year, month: p.month, day: p.day, hour, minute };
        }
      }
      cursor = new Date(cursor.getTime() + 24 * 60 * 60_000);
    }
    return { year, month, day, hour, minute };
  }

  const dom = dayOfMonth ?? 1;
  let y = year;
  let m = month;
  let d = clampDayOfMonth(y, m, dom);
  let runAt = localDateTimeToUtc(y, m, d, hour, minute, timeZone);
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
