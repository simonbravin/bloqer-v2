import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isDueOnOrBeforeHorizon,
  monthKey,
  parseFilterDate,
  parseTrendMonths,
  pickCurrentMonthItem,
  productMonthKey,
  projectionBucketKey,
  trendDateRange,
} from "./report-month";

describe("isDueOnOrBeforeHorizon", () => {
  it("includes overdue payables (due before today)", () => {
    const overdue = new Date("2024-01-15T12:00:00.000Z");
    assert.equal(isDueOnOrBeforeHorizon(overdue, "2026-12-31"), true);
  });

  it("includes payables due exactly on horizon end", () => {
    const due = parseFilterDate("2026-06-30", true);
    assert.equal(isDueOnOrBeforeHorizon(due, "2026-06-30"), true);
  });

  it("excludes payables due after horizon end", () => {
    const future = new Date("2027-01-01T00:00:00.000Z");
    assert.equal(isDueOnOrBeforeHorizon(future, "2026-12-31"), false);
  });
});

describe("parseTrendMonths", () => {
  it("accepts 1, 3, 6 and 12 and defaults to 12", () => {
    assert.equal(parseTrendMonths(1), 1);
    assert.equal(parseTrendMonths("3"), 3);
    assert.equal(parseTrendMonths(6), 6);
    assert.equal(parseTrendMonths("12"), 12);
    assert.equal(parseTrendMonths(undefined), 12);
    assert.equal(parseTrendMonths("9"), 12);
  });
});

describe("pickCurrentMonthItem", () => {
  it("returns the item for the current product-TZ month and ignores older points", () => {
    const now = new Date("2026-08-29T18:00:00.000Z");
    const current = productMonthKey(now);
    const items = [{ periodKey: "2026-07" }, { periodKey: current }, { periodKey: "2026-06" }];
    assert.equal(pickCurrentMonthItem(items, now)?.periodKey, current);
  });

  it("returns undefined when the current month is absent", () => {
    const now = new Date("2026-08-29T18:00:00.000Z");
    assert.equal(pickCurrentMonthItem([{ periodKey: "2026-07" }], now), undefined);
  });
});

describe("trendDateRange", () => {
  it("uses the product calendar month for este mes", () => {
    const now = new Date("2026-08-29T18:00:00.000Z"); // 15:00 ART
    const { dateFrom, dateTo } = trendDateRange(1, now);
    assert.equal(dateFrom, "2026-08-01");
    assert.equal(dateTo, "2026-08-29");
  });

  it("uses ART day near UTC midnight (not raw UTC day)", () => {
    // 02:30 UTC = 23:30 ART previous calendar day
    const nearUtcMidnight = new Date("2026-08-29T02:30:00.000Z");
    const { dateFrom, dateTo } = trendDateRange(1, nearUtcMidnight);
    assert.equal(dateFrom, "2026-08-01");
    assert.equal(dateTo, "2026-08-28");
  });
});

describe("projectionBucketKey", () => {
  it("rolls overdue items into the horizon start month", () => {
    const overdue = new Date("2024-03-10T00:00:00.000Z");
    assert.equal(projectionBucketKey(overdue, "2026-05-01", "2026-12-31"), "2026-05");
  });

  it("uses due month for in-horizon items", () => {
    const due = new Date("2026-07-15T00:00:00.000Z");
    assert.equal(projectionBucketKey(due, "2026-05-01", "2026-12-31"), "2026-07");
  });

  it("returns null when due after horizon end", () => {
    const future = new Date("2027-02-01T00:00:00.000Z");
    assert.equal(projectionBucketKey(future, "2026-05-01", "2026-12-31"), null);
  });
});
