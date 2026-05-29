import { test } from "node:test";
import assert from "node:assert/strict";
import { ServiceError } from "../types";
import { assertValidOverheadPeriod } from "./project-overhead.service";

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
