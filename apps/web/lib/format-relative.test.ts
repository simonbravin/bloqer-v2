import assert from "node:assert/strict";
import { test } from "node:test";
import { formatRelativePast } from "./format-relative";

test("formatRelativePast uses product calendar day, not UTC date", () => {
  const now = new Date("2026-08-20T01:30:00.000Z"); // 22:30 ART on 19 Aug
  const sameLocalDay = new Date("2026-08-19T15:00:00.000Z"); // 12:00 ART on 19 Aug
  assert.equal(formatRelativePast(sameLocalDay, now), "Hoy");
  const previousLocalDay = new Date("2026-08-18T15:00:00.000Z");
  assert.equal(formatRelativePast(previousLocalDay, now), "Hace 1 día");
});
