import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertScheduleStatusTransition,
  wouldCreateDependencyCycle,
  daysBetween,
  parseDateOnly,
  checkFinishStartViolations,
} from "./schedule-helpers";
import { ServiceError } from "../types";

describe("wouldCreateDependencyCycle", () => {
  it("detects direct self-loop", () => {
    assert.equal(wouldCreateDependencyCycle([], "a", "a"), true);
  });

  it("detects indirect cycle", () => {
    const edges = [
      { predecessorId: "a", successorId: "b" },
      { predecessorId: "b", successorId: "c" },
    ];
    assert.equal(wouldCreateDependencyCycle(edges, "c", "a"), true);
  });

  it("allows acyclic edge", () => {
    const edges = [{ predecessorId: "a", successorId: "b" }];
    assert.equal(wouldCreateDependencyCycle(edges, "a", "c"), false);
  });
});

describe("assertScheduleStatusTransition", () => {
  it("allows PLANNED → IN_PROGRESS", () => {
    assert.doesNotThrow(() => assertScheduleStatusTransition("PLANNED", "IN_PROGRESS"));
  });

  it("rejects COMPLETED → IN_PROGRESS", () => {
    assert.throws(
      () => assertScheduleStatusTransition("COMPLETED", "IN_PROGRESS"),
      (e: unknown) => e instanceof ServiceError,
    );
  });

  it("requires block path only from allowed states", () => {
    assert.doesNotThrow(() => assertScheduleStatusTransition("IN_PROGRESS", "BLOCKED"));
  });
});

describe("daysBetween", () => {
  it("returns at least 1 day", () => {
    const d = parseDateOnly("2026-01-01");
    assert.equal(daysBetween(d, d), 1);
  });
});

describe("checkFinishStartViolations", () => {
  it("returns empty when dates respect FS", () => {
    const item = {
      id: "b",
      name: "B",
      startDate: parseDateOnly("2026-02-01"),
      endDate: parseDateOnly("2026-02-10"),
    };
    const pred = {
      id: "a",
      name: "A",
      startDate: parseDateOnly("2026-01-01"),
      endDate: parseDateOnly("2026-01-31"),
    };
    assert.deepEqual(checkFinishStartViolations(item, [pred], []), []);
  });

  it("warns when successor starts before predecessor ends", () => {
    const item = {
      id: "b",
      name: "B",
      startDate: parseDateOnly("2026-01-15"),
      endDate: parseDateOnly("2026-02-10"),
    };
    const pred = {
      id: "a",
      name: "A",
      startDate: parseDateOnly("2026-01-01"),
      endDate: parseDateOnly("2026-01-31"),
    };
    const warnings = checkFinishStartViolations(item, [pred], []);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0]!, /FS/);
  });
});

describe("import idempotency (WBS link set semantics)", () => {
  it("treats WBS as already imported when present in linked set", () => {
    const linkedWbs = new Set(["wbs-a", "wbs-b"]);
    const nodes = [{ id: "wbs-a" }, { id: "wbs-c" }];
    const toCreate = nodes.filter((n) => !linkedWbs.has(n.id));
    assert.deepEqual(toCreate.map((n) => n.id), ["wbs-c"]);
  });
});
