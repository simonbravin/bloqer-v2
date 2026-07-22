import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addCalendarDays,
  computeDateRangePreset,
  defaultCalendarDateRangeDays,
  formatCalendarDate,
  PRODUCT_TIMEZONE,
  toIsoDateInTimeZone,
} from "./calendar-date";

describe("calendar-date (America/Argentina/Buenos_Aires)", () => {
  it("formats parts as YYYY-MM-DD", () => {
    assert.equal(formatCalendarDate({ year: 2026, month: 7, day: 2 }), "2026-07-02");
  });

  it("addCalendarDays crosses months", () => {
    assert.deepEqual(addCalendarDays({ year: 2026, month: 3, day: 1 }, -1), {
      year: 2026,
      month: 2,
      day: 28,
    });
  });

  it("toIsoDateInTimeZone uses product TZ near UTC midnight boundary", () => {
    // 2026-07-23 02:30 UTC = 2026-07-22 23:30 in Buenos Aires
    const nearUtcMidnight = new Date("2026-07-23T02:30:00.000Z");
    assert.equal(toIsoDateInTimeZone(nearUtcMidnight, PRODUCT_TIMEZONE), "2026-07-22");
    // UTC slice would wrongly yield 2026-07-23
    assert.equal(nearUtcMidnight.toISOString().slice(0, 10), "2026-07-23");
  });

  it("computeDateRangePreset month/ytd/week/d90", () => {
    // Wednesday 2026-07-22 15:00 ART = 18:00 UTC
    const now = new Date("2026-07-22T18:00:00.000Z");
    assert.deepEqual(computeDateRangePreset("month", now), {
      dateFrom: "2026-07-01",
      dateTo: "2026-07-22",
    });
    assert.deepEqual(computeDateRangePreset("ytd", now), {
      dateFrom: "2026-01-01",
      dateTo: "2026-07-22",
    });
    // Week starts Monday 2026-07-20
    assert.deepEqual(computeDateRangePreset("week", now), {
      dateFrom: "2026-07-20",
      dateTo: "2026-07-22",
    });
    assert.deepEqual(computeDateRangePreset("d90", now), {
      dateFrom: "2026-04-23",
      dateTo: "2026-07-22",
    });
    assert.deepEqual(defaultCalendarDateRangeDays(90, now), computeDateRangePreset("d90", now));
  });
});
