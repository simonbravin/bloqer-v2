import assert from "node:assert/strict";
import { test } from "node:test";
import { ServiceError } from "../types";
import {
  assertJobsiteLogApprovable,
  buildProgressSnapshotEntry,
  hasLegacyPhysicalPctOverflow,
  remainingPhysicalPct,
} from "./jobsite-log-guards";

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
      a: { approvedIncrementalPct: "110", remainingPct: "0.00" },
    }),
    true,
  );
});

test("hasLegacyPhysicalPctOverflow is false when each WBS within 100", () => {
  assert.equal(
    hasLegacyPhysicalPctOverflow({
      a: { approvedIncrementalPct: "60", remainingPct: "40.00" },
      b: { approvedIncrementalPct: "50", remainingPct: "50.00" },
    }),
    false,
  );
});

test("remainingPhysicalPct: 70 → 30", () => {
  assert.equal(remainingPhysicalPct("70"), "30.00");
  assert.equal(remainingPhysicalPct(70), "30.00");
});

test("remainingPhysicalPct: 0 → 100; over 100 → 0", () => {
  assert.equal(remainingPhysicalPct("0"), "100.00");
  assert.equal(remainingPhysicalPct("110"), "0.00");
});

test("buildProgressSnapshotEntry includes remaining and qty", () => {
  const e = buildProgressSnapshotEntry("70.00", "8.5");
  assert.equal(e.approvedIncrementalPct, "70.00");
  assert.equal(e.remainingPct, "30.00");
  assert.equal(e.approvedQty, "8.5000");
});

test("remainingPhysicalPct does not use IEEE float", () => {
  assert.equal(remainingPhysicalPct("10.1"), "89.90");
  assert.equal(remainingPhysicalPct("99.996"), "0.00");
});
