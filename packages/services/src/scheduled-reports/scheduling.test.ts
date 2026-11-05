import assert from "node:assert/strict";
import { test } from "node:test";

import { calculateNextRunAt, calendarDateInTimezone, localDateTimeToUtc } from "./scheduling";

test("scheduled instants keep the local date at month and year boundaries", () => {
  const zone = "America/Argentina/Buenos_Aires";
  for (const [year, month, day, expected] of [
    [2026, 11, 1, "2026-11-01T03:30:00.000Z"],
    [2027, 1, 1, "2027-01-01T03:30:00.000Z"],
  ] as const) {
    const instant = localDateTimeToUtc(year, month, day, 0, 30, zone);
    assert.equal(instant.toISOString(), expected);
    assert.equal(calendarDateInTimezone(instant, zone), expected.slice(0, 10));
  }
});

test("daily and weekly recurrence advances civil days across daylight-saving changes", () => {
  const timezone = "America/New_York";
  const daily = calculateNextRunAt({
    after: new Date("2026-03-08T04:50:00Z"),
    timeOfDay: "23:40",
    frequency: "DAILY",
    timezone,
  });
  assert.equal(daily.toISOString(), "2026-03-09T03:40:00.000Z");

  const weekly = calculateNextRunAt({
    after: new Date("2026-11-01T04:30:00Z"),
    timeOfDay: "00:00",
    frequency: "WEEKLY",
    dayOfWeek: 7,
    timezone,
  });
  assert.equal(weekly.toISOString(), "2026-11-08T05:00:00.000Z");
});

test("monthly recurrence on the first stays after the previous slot", () => {
  const after = new Date("2026-12-01T03:00:00Z");
  const next = calculateNextRunAt({
    after,
    dayOfMonth: 1,
    frequency: "MONTHLY",
    timeOfDay: "00:00",
    timezone: "America/Argentina/Buenos_Aires",
  });
  assert.equal(next.toISOString(), "2027-01-01T03:00:00.000Z");
});
