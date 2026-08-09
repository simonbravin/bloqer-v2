import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { periodToDateRange } from "./overhead-period";

describe("period close calendar bounds (D-078)", () => {
  it("maps YYYY-MM to inclusive UTC month bounds", () => {
    assert.deepEqual(periodToDateRange("2026-02"), {
      dateFrom: "2026-02-01",
      dateTo: "2026-02-28",
    });
    assert.deepEqual(periodToDateRange("2026-08"), {
      dateFrom: "2026-08-01",
      dateTo: "2026-08-31",
    });
  });
});
