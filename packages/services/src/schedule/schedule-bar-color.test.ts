import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SCHEDULE_BAR_COLORS,
  resolveScheduleItemBarColor,
} from "./schedule-bar-color";

describe("resolveScheduleItemBarColor", () => {
  it("uses danger color for late TASK and late MILESTONE", () => {
    assert.equal(
      resolveScheduleItemBarColor({
        type: "TASK",
        status: "IN_PROGRESS",
        daysLate: 2,
      }),
      SCHEDULE_BAR_COLORS.taskLate,
    );
    assert.equal(
      resolveScheduleItemBarColor({
        type: "MILESTONE",
        status: "PLANNED",
        daysLate: 1,
      }),
      SCHEDULE_BAR_COLORS.milestoneLate,
    );
    assert.equal(SCHEDULE_BAR_COLORS.taskLate, SCHEDULE_BAR_COLORS.milestoneLate);
  });

  it("keeps status color for on-time TASK and fixed color for on-time milestone", () => {
    assert.equal(
      resolveScheduleItemBarColor({
        type: "TASK",
        status: "IN_PROGRESS",
        daysLate: null,
      }),
      SCHEDULE_BAR_COLORS.status.IN_PROGRESS,
    );
    assert.equal(
      resolveScheduleItemBarColor({
        type: "MILESTONE",
        status: "PLANNED",
        daysLate: null,
      }),
      SCHEDULE_BAR_COLORS.milestone,
    );
  });

  it("marks completed milestone and container summary", () => {
    assert.equal(
      resolveScheduleItemBarColor({
        type: "MILESTONE",
        status: "COMPLETED",
        daysLate: null,
      }),
      SCHEDULE_BAR_COLORS.milestoneDone,
    );
    assert.equal(
      resolveScheduleItemBarColor(
        { type: "TASK", status: "PLANNED", daysLate: 3 },
        true,
      ),
      SCHEDULE_BAR_COLORS.container,
    );
  });
});
