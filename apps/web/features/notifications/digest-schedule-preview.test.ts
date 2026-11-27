import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { getDigestSchedulePreview } from "./digest-schedule-preview";

test("the digest preview matches the daily deployed cron and Argentine catch-up window", () => {
  const config = JSON.parse(readFileSync(new URL("../../vercel.json", import.meta.url), "utf8")) as {
    crons: { path: string; schedule: string }[];
  };
  assert.equal(config.crons.find(({ path }) => path === "/api/cron/notification-digest")?.schedule, "5 10 * * *");
  const preview = getDigestSchedulePreview("America/Argentina/Buenos_Aires", new Date("2026-11-19T10:00:00Z"));
  assert.equal(preview.reviewAtIso, "2026-11-19T10:05:00.000Z");
  assert.deepEqual(preview.eligibleHours, [4, 5, 6, 7]);
});

test("the next review uses its own daylight-saving offset after today's review", () => {
  const preview = getDigestSchedulePreview("America/New_York", new Date("2026-10-31T12:00:00Z"));
  assert.equal(preview.reviewAtIso, "2026-11-01T10:05:00.000Z");
  assert.deepEqual(preview.eligibleHours, [2, 3, 4, 5]);
});

test("a review at local midnight does not include yesterday's configured hours", () => {
  const preview = getDigestSchedulePreview("Pacific/Honolulu", new Date("2026-11-19T10:00:00Z"));
  assert.deepEqual(preview.eligibleHours, [0]);
});
