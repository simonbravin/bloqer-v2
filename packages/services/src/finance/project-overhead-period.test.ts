import { test } from "node:test";
import assert from "node:assert/strict";
import { ServiceError } from "../types";
import {
  assertValidOverheadPeriod,
  computeWeightShare,
  resolvePeriodKeysForFilter,
} from "./overhead-period";

test("assertValidOverheadPeriod accepts YYYY-MM", () => {
  assert.doesNotThrow(() => assertValidOverheadPeriod("2026-05"));
});

test("assertValidOverheadPeriod rejects invalid month", () => {
  assert.throws(
    () => assertValidOverheadPeriod("2026-13"),
    (e: unknown) => e instanceof ServiceError && e.code === "VALIDATION",
  );
});

test("assertValidOverheadPeriod rejects bad format", () => {
  assert.throws(() => assertValidOverheadPeriod("05-2026"));
});

test("computeWeightShare returns percent of total", () => {
  assert.equal(computeWeightShare("25", "100"), "25.00");
  assert.equal(computeWeightShare("0", "100"), "0.00");
  assert.equal(computeWeightShare("10", "0"), "0.00");
});

test("resolvePeriodKeysForFilter expands inclusive range", () => {
  const keys = resolvePeriodKeysForFilter({ periodFrom: "2026-01", periodTo: "2026-03" });
  assert.deepEqual(keys, ["2026-01", "2026-02", "2026-03"]);
});
