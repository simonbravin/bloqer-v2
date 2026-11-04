import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  blockScheduleItemSchema,
  createScheduleItemSchema,
  scheduleWorkspaceFiltersSchema,
  updateScheduleItemDatesSchema,
  updateScheduleItemProgressSchema,
} from "@bloqer/validators";
import { computeContainerRollup, parseDateOnly } from "./schedule-helpers";
import { applyMoveSibling, wouldCreateCycle } from "./schedule-placement";

describe("AG-05 schedule input and tree integrity", () => {
  it("rejects names and blocking reasons containing only whitespace", () => {
    assert.equal(createScheduleItemSchema.safeParse({ name: "   " }).success, false);
    assert.equal(blockScheduleItemSchema.safeParse({ blockReason: " \n " }).success, false);
    assert.equal(createScheduleItemSchema.parse({ name: "  Montaje  " }).name, "Montaje");
  });

  it("rejects calendar overflow in both schemas and service date parsing", () => {
    for (const date of ["2026-02-29", "2026-02-31", "2026-13-01", "2026-01-00", "26-01-01"]) {
      assert.equal(
        createScheduleItemSchema.safeParse({ name: "Tarea", startDate: date }).success,
        false,
      );
      assert.equal(
        updateScheduleItemDatesSchema.safeParse({ startDate: date, endDate: null }).success,
        false,
      );
      assert.throws(() => parseDateOnly(date), /Fecha inválida/);
    }
    assert.equal(parseDateOnly("2028-02-29").toISOString().slice(0, 10), "2028-02-29");
  });

  it("validates finite progress bounds before rounding", () => {
    for (const progressPct of [
      NaN,
      Infinity,
      -0.001,
      100.001,
      "",
      " ",
      "-0.001",
      "100.001",
      "NaN",
    ]) {
      assert.equal(updateScheduleItemProgressSchema.safeParse({ progressPct }).success, false);
    }
    assert.equal(
      updateScheduleItemProgressSchema.parse({ progressPct: "12.345" }).progressPct,
      12.35,
    );
    assert.equal(updateScheduleItemProgressSchema.parse({ progressPct: 0 }).progressPct, 0);
  });

  it("does not turn an explicit false URL filter into true", () => {
    for (const delayedOnly of ["0", "false", false]) {
      assert.equal(scheduleWorkspaceFiltersSchema.parse({ delayedOnly }).delayedOnly, false);
    }
    assert.equal(scheduleWorkspaceFiltersSchema.parse({ delayedOnly: "1" }).delayedOnly, true);
  });

  it("rejects a missing or cancelled parent instead of attaching to another schedule", () => {
    const rows = [
      { id: "a", parentId: null, sortOrder: 0 },
      { id: "b", parentId: null, sortOrder: 1, status: "CANCELLED" },
    ];
    assert.equal(
      applyMoveSibling(rows, "a", { kind: "place", parentId: "foreign", afterItemId: null }),
      null,
    );
    assert.equal(
      applyMoveSibling(rows, "a", { kind: "place", parentId: "b", afterItemId: null }),
      null,
    );
  });

  it("terminates on corrupt legacy cycles and refuses further cyclic placement", () => {
    const rows = [
      { id: "a", parentId: "b", sortOrder: 0 },
      { id: "b", parentId: "a", sortOrder: 0 },
      { id: "c", parentId: null, sortOrder: 1 },
    ];
    assert.equal(wouldCreateCycle(rows, "c", "a"), true);
    assert.throws(
      () =>
        computeContainerRollup(
          rows.map((row) => ({ ...row, status: "PLANNED", startDate: null, endDate: null })),
        ),
      /contiene un ciclo/,
    );
  });
});
