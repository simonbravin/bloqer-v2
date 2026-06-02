import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  capSyncProgressPct,
  resolveScheduleStatusAfterProgressSync,
} from "./schedule-progress-sync-pure";

describe("capSyncProgressPct", () => {
  it("returns null for non-positive or over 100", () => {
    assert.equal(capSyncProgressPct(0), null);
    assert.equal(capSyncProgressPct(-1), null);
    assert.equal(capSyncProgressPct(100.1), null);
  });

  it("caps at 100 with two decimals", () => {
    assert.equal(capSyncProgressPct(99.996), 100);
    assert.equal(capSyncProgressPct(42.5), 42.5);
  });
});

describe("resolveScheduleStatusAfterProgressSync", () => {
  it("PLANNED → IN_PROGRESS when pct > 0", () => {
    assert.equal(resolveScheduleStatusAfterProgressSync("PLANNED", 1), "IN_PROGRESS");
  });

  it("IN_PROGRESS → COMPLETED at 100%", () => {
    assert.equal(resolveScheduleStatusAfterProgressSync("IN_PROGRESS", 100), "COMPLETED");
  });

  it("keeps BLOCKED unchanged", () => {
    assert.equal(resolveScheduleStatusAfterProgressSync("BLOCKED", 50), "BLOCKED");
  });
});
