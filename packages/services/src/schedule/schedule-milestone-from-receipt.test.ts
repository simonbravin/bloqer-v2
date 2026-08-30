import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canCompleteScheduleItemDirectly,
  computeDeliveryAfterSiblingStart,
  mergeProcurementDatesByWbs,
  selectMilestonesToCompleteFromReceipt,
  type MilestoneWithWbs,
} from "./schedule-milestone-from-receipt";
import { isScheduleStatusTransitionAllowed } from "./schedule-helpers";

describe("schedule-milestone-from-receipt", () => {
  it("selects PLANNED/IN_PROGRESS milestones linked to receipt WBS", () => {
    const items: MilestoneWithWbs[] = [
      { id: "ms1", type: "MILESTONE", status: "PLANNED", wbsNodeIds: ["wbs-a"] },
      { id: "ms2", type: "MILESTONE", status: "IN_PROGRESS", wbsNodeIds: ["wbs-b"] },
      { id: "ms3", type: "MILESTONE", status: "COMPLETED", wbsNodeIds: ["wbs-a"] },
      { id: "ms4", type: "MILESTONE", status: "BLOCKED", wbsNodeIds: ["wbs-a"] },
      { id: "task", type: "TASK", status: "PLANNED", wbsNodeIds: ["wbs-a"] },
      { id: "ms5", type: "MILESTONE", status: "PLANNED", wbsNodeIds: ["wbs-other"] },
    ];
    const selected = selectMilestonesToCompleteFromReceipt(items, ["wbs-a", "wbs-b"]);
    assert.deepEqual(
      selected.map((i) => i.id).sort(),
      ["ms1", "ms2"],
    );
  });

  it("is idempotent for already COMPLETED (not selected)", () => {
    const items: MilestoneWithWbs[] = [
      { id: "ms", type: "MILESTONE", status: "COMPLETED", wbsNodeIds: ["wbs-a"] },
    ];
    assert.equal(selectMilestonesToCompleteFromReceipt(items, ["wbs-a"]).length, 0);
  });

  it("does not select TASK or BLOCKED", () => {
    const items: MilestoneWithWbs[] = [
      { id: "t", type: "TASK", status: "PLANNED", wbsNodeIds: ["w"] },
      { id: "b", type: "MILESTONE", status: "BLOCKED", wbsNodeIds: ["w"] },
      { id: "c", type: "MILESTONE", status: "CANCELLED", wbsNodeIds: ["w"] },
    ];
    assert.equal(selectMilestonesToCompleteFromReceipt(items, ["w"]).length, 0);
  });

  it("allows PLANNED→COMPLETED only for MILESTONE", () => {
    assert.equal(isScheduleStatusTransitionAllowed("PLANNED", "COMPLETED"), true);
    assert.equal(canCompleteScheduleItemDirectly("MILESTONE", "PLANNED", "COMPLETED"), true);
    assert.equal(canCompleteScheduleItemDirectly("TASK", "PLANNED", "COMPLETED"), false);
    assert.equal(canCompleteScheduleItemDirectly("TASK", "IN_PROGRESS", "COMPLETED"), true);
  });

  it("flags risk per shared WBS when promised date is after sibling TASK start", () => {
    const all = [
      {
        id: "ms",
        parentId: "ch",
        type: "MILESTONE",
        status: "PLANNED",
        startDate: "2026-09-01",
        wbsNodeIds: ["wbs-panels"],
      },
      {
        id: "task",
        parentId: "ch",
        type: "TASK",
        status: "PLANNED",
        startDate: "2026-09-10",
        wbsNodeIds: ["wbs-panels"],
      },
    ];
    const byWbs = new Map([["wbs-panels", "2026-09-20"]]);
    assert.equal(
      computeDeliveryAfterSiblingStart(all[0]!, all, () => true, byWbs),
      true,
    );
  });

  it("does not flag risk when delivery is on or before sibling start", () => {
    const all = [
      {
        id: "ms",
        parentId: "ch",
        type: "MILESTONE",
        status: "PLANNED",
        startDate: "2026-09-01",
        wbsNodeIds: ["wbs-panels"],
      },
      {
        id: "task",
        parentId: "ch",
        type: "TASK",
        status: "PLANNED",
        startDate: "2026-09-10",
        wbsNodeIds: ["wbs-panels"],
      },
    ];
    const byWbs = new Map([["wbs-panels", "2026-09-10"]]);
    assert.equal(
      computeDeliveryAfterSiblingStart(all[0]!, all, () => true, byWbs),
      false,
    );
  });

  it("does not false-positive when late PO is on a WBS the sibling does not share", () => {
    const all = [
      {
        id: "ms",
        parentId: "ch",
        type: "MILESTONE",
        status: "PLANNED",
        startDate: "2026-09-01",
        wbsNodeIds: ["wbs-a", "wbs-b"],
      },
      {
        id: "task",
        parentId: "ch",
        type: "TASK",
        status: "PLANNED",
        startDate: "2026-09-10",
        wbsNodeIds: ["wbs-a"],
      },
    ];
    // Late only on B; sibling shares only A (no open PO on A)
    const byWbs = new Map<string, string | null>([
      ["wbs-a", null],
      ["wbs-b", "2026-09-20"],
    ]);
    assert.equal(
      computeDeliveryAfterSiblingStart(all[0]!, all, () => true, byWbs),
      false,
    );
  });

  it("mergeProcurementDatesByWbs takes min expected and max receipt", () => {
    const byWbs = new Map([
      ["a", { expectedDeliveryDate: "2026-09-15", latestReceiptDate: "2026-09-01" }],
      ["b", { expectedDeliveryDate: "2026-09-10", latestReceiptDate: "2026-09-05" }],
    ]);
    const merged = mergeProcurementDatesByWbs(["a", "b"], byWbs);
    assert.equal(merged.expectedDeliveryDate, "2026-09-10");
    assert.equal(merged.latestReceiptDate, "2026-09-05");
  });
});
