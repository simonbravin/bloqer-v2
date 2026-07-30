import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  capSyncProgressPct,
  resolveScheduleStatusAfterProgressSync,
  serializeProgressPct,
} from "./schedule-progress-sync-pure";

describe("serializeProgressPct", () => {
  it("half-up to 2 dp", () => {
    assert.equal(serializeProgressPct("99.996"), "100.00");
    assert.equal(serializeProgressPct(42.5), "42.50");
  });
});

describe("capSyncProgressPct", () => {
  it("returns null for non-positive", () => {
    assert.equal(capSyncProgressPct(0), null);
    assert.equal(capSyncProgressPct(-1), null);
    assert.equal(capSyncProgressPct("0.00"), null);
  });

  it("clamps over 100 to 100.00", () => {
    assert.equal(capSyncProgressPct(100.1), "100.00");
    assert.equal(capSyncProgressPct("150"), "100.00");
  });

  it("caps at 100 with two decimals as string", () => {
    assert.equal(capSyncProgressPct(99.996), "100.00");
    assert.equal(capSyncProgressPct(42.5), "42.50");
  });
});

describe("resolveScheduleStatusAfterProgressSync", () => {
  it("PLANNED → IN_PROGRESS when pct > 0", () => {
    assert.equal(resolveScheduleStatusAfterProgressSync("PLANNED", "1.00"), "IN_PROGRESS");
  });

  it("IN_PROGRESS → COMPLETED at 100%", () => {
    assert.equal(resolveScheduleStatusAfterProgressSync("IN_PROGRESS", "100.00"), "COMPLETED");
  });

  it("keeps BLOCKED unchanged", () => {
    assert.equal(resolveScheduleStatusAfterProgressSync("BLOCKED", "50.00"), "BLOCKED");
  });
});
