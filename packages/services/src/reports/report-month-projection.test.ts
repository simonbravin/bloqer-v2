import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isDueOnOrBeforeHorizon, parseFilterDate, projectionBucketKey } from "./report-month";

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
