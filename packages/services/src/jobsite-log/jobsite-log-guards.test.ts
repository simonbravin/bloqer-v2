import assert from "node:assert/strict";
import { test } from "node:test";
import { ServiceError } from "../types";
import { assertJobsiteLogApprovable, hasLegacyPhysicalPctOverflow } from "./jobsite-log-guards";

test("assertJobsiteLogApprovable allows SUBMITTED", () => {
  assert.doesNotThrow(() => assertJobsiteLogApprovable("SUBMITTED"));
});

test("assertJobsiteLogApprovable rejects DRAFT", () => {
  assert.throws(
    () => assertJobsiteLogApprovable("DRAFT"),
    (err) => err instanceof ServiceError && err.code === "CONFLICT",
  );
});

test("assertJobsiteLogApprovable rejects APPROVED", () => {
  assert.throws(
    () => assertJobsiteLogApprovable("APPROVED"),
    (err) => err instanceof ServiceError && err.code === "CONFLICT",
  );
});

test("hasLegacyPhysicalPctOverflow detects single WBS over 100", () => {
  assert.equal(
    hasLegacyPhysicalPctOverflow({
      a: { approvedIncrementalPct: "110" },
    }),
    true,
  );
});

test("hasLegacyPhysicalPctOverflow is false when each WBS within 100", () => {
  assert.equal(
    hasLegacyPhysicalPctOverflow({
      a: { approvedIncrementalPct: "60" },
      b: { approvedIncrementalPct: "50" },
    }),
    false,
  );
});
