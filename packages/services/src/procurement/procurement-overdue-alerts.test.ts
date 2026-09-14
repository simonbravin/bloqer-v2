import assert from "node:assert/strict";
import { test } from "node:test";
import { daysOverdue, todayUtcDate } from "./procurement-overdue-alerts.service";

test("todayUtcDate is UTC midnight of the product calendar day (ART)", () => {
  // Noon UTC = 10:00 ART same calendar day
  const noonUtc = new Date("2026-08-28T13:45:12.789Z");
  assert.equal(todayUtcDate(noonUtc).toISOString(), "2026-08-28T00:00:00.000Z");

  // 02:30 UTC = 23:30 ART previous calendar day — must not use raw UTC day
  const nearUtcMidnight = new Date("2026-08-28T02:30:00.000Z");
  assert.equal(todayUtcDate(nearUtcMidnight).toISOString(), "2026-08-27T00:00:00.000Z");
});

test("daysOverdue returns 0 when reference is today", () => {
  const now = new Date("2026-08-28T09:00:00Z");
  const today = new Date("2026-08-28T00:00:00Z");
  assert.equal(daysOverdue(today, now), 0);
});

test("daysOverdue returns 1 when reference is yesterday", () => {
  const now = new Date("2026-08-28T09:00:00Z");
  const yesterday = new Date("2026-08-27T00:00:00Z");
  assert.equal(daysOverdue(yesterday, now), 1);
});

test("daysOverdue returns 7 for a week-old reference", () => {
  const now = new Date("2026-08-28T09:00:00Z");
  const weekAgo = new Date("2026-08-21T00:00:00Z");
  assert.equal(daysOverdue(weekAgo, now), 7);
});

test("daysOverdue is clamped to 0 for future dates (never negative)", () => {
  const now = new Date("2026-08-28T09:00:00Z");
  const future = new Date("2026-09-05T00:00:00Z");
  assert.equal(daysOverdue(future, now), 0);
});

test("daysOverdue ignores the hour of `reference` (works with @db.Date columns)", () => {
  const now = new Date("2026-08-28T09:00:00Z");
  // Prisma reads @db.Date as UTC midnight; equivalent representations must yield same overdue.
  const midnight = new Date("2026-08-25T00:00:00Z");
  const noon = new Date("2026-08-25T12:00:00Z");
  assert.equal(daysOverdue(midnight, now), 3);
  assert.equal(daysOverdue(noon, now), 3);
});
