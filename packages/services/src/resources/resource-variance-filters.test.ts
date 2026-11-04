import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateResourceVarianceDates } from "./resource-variance-filters";
import { ServiceError } from "../types";

describe("resource variance date filters", () => {
  it("accepts empty bounds, a leap date, and an inclusive single-day range", () => {
    assert.doesNotThrow(() => validateResourceVarianceDates({}));
    assert.doesNotThrow(() => validateResourceVarianceDates({ dateFrom: "2024-02-29", dateTo: "2024-02-29" }));
  });
  it("rejects impossible dates and timestamp strings instead of rolling them into another day", () => {
    for (const dateFrom of ["2026-02-29", "2026-04-31", "2026-13-01", "2026-1-1", "2026-11-04T00:00:00Z", "invalid"]) {
      assert.throws(() => validateResourceVarianceDates({ dateFrom }), (e) => e instanceof ServiceError && e.code === "VALIDATION");
    }
  });
  it("rejects inverted bounds", () => {
    assert.throws(() => validateResourceVarianceDates({ dateFrom: "2026-11-05", dateTo: "2026-11-04" }), (e) => e instanceof ServiceError && e.code === "VALIDATION");
  });
});
