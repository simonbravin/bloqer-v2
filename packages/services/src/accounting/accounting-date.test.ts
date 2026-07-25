import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ServiceError } from "../types";
import { parseAccountingDateRange, sanitizeIsoDate } from "./accounting-date";

describe("accounting-date", () => {
  it("sanitizes valid ISO dates and rejects rollover", () => {
    assert.equal(sanitizeIsoDate("2026-07-24"), "2026-07-24");
    assert.equal(sanitizeIsoDate("2026-02-31"), undefined);
    assert.equal(sanitizeIsoDate("nope"), undefined);
    assert.equal(sanitizeIsoDate(""), undefined);
  });

  it("rejects inverted ranges", () => {
    assert.throws(
      () => parseAccountingDateRange({ dateFrom: "2026-07-20", dateTo: "2026-07-01" }),
      (e: unknown) => e instanceof ServiceError && e.code === "VALIDATION",
    );
  });

  it("falls back invalid dates to month range", () => {
    const r = parseAccountingDateRange({ dateFrom: "bad", dateTo: "also-bad" });
    assert.match(r.dateFrom, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(r.dateTo, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(r.dateFrom <= r.dateTo);
  });
});
