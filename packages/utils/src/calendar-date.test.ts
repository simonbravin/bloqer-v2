import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addCalendarDays,
  computeDateRangePreset,
  defaultCalendarDateRangeDays,
  formatCalendarDate,
  PRODUCT_TIMEZONE,
  productCalendarDateUtc,
  productWeekMondaySundayBounds,
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

  it("productCalendarDateUtc is UTC midnight of the product calendar day", () => {
    const nearUtcMidnight = new Date("2026-07-23T02:30:00.000Z");
    assert.equal(productCalendarDateUtc(nearUtcMidnight).toISOString(), "2026-07-22T00:00:00.000Z");
    assert.equal(productCalendarDateUtc(new Date("2026-07-22T18:00:00.000Z")).toISOString(), "2026-07-22T00:00:00.000Z");
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

  it("productWeekMondaySundayBounds is Monday–Sunday, not week-to-date", () => {
    const now = new Date("2026-07-22T18:00:00.000Z");
    assert.deepEqual(productWeekMondaySundayBounds(now), {
      weekStart: "2026-07-20",
      weekEnd: "2026-07-26",
    });
    assert.deepEqual(computeDateRangePreset("week", now), {
      dateFrom: "2026-07-20",
      dateTo: "2026-07-22",
    });
  });

  it("productWeekMondaySundayBounds uses ART day near UTC midnight", () => {
    // 2026-07-20 02:30 UTC = Sunday 19 Jul in Buenos Aires
    const nearUtcMidnight = new Date("2026-07-20T02:30:00.000Z");
    assert.deepEqual(productWeekMondaySundayBounds(nearUtcMidnight), {
      weekStart: "2026-07-13",
      weekEnd: "2026-07-19",
    });
  });
});
