import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  activeSiblings,
  applyMoveSibling,
  nextSiblingSortOrder,
  resolveInsertSortOrder,
  shouldSyncProgressFromJobsite,
  suggestPlacementForWbs,
  wouldCreateCycle,
  type ScheduleTreeNode,
} from "./schedule-placement";

function node(
  partial: Partial<ScheduleTreeNode> & { id: string },
): ScheduleTreeNode {
  return {
    parentId: null,
    sortOrder: 0,
    status: "PLANNED",
    wbsNodeIds: [],
    ...partial,
  };
}

describe("schedule-placement", () => {
  it("nextSiblingSortOrder appends after max", () => {
    assert.equal(nextSiblingSortOrder([]), 0);
    assert.equal(nextSiblingSortOrder([{ sortOrder: 0 }, { sortOrder: 2 }]), 3);
  });

  it("resolveInsertSortOrder inserts after sibling", () => {
    const siblings = [
      { id: "a", sortOrder: 0 },
      { id: "b", sortOrder: 1 },
    ];
    assert.equal(resolveInsertSortOrder(siblings, "a"), 1);
    assert.equal(resolveInsertSortOrder(siblings, null), 2);
  });

  it("suggestPlacementForWbs places as sibling under existing leaf", () => {
    const items: ScheduleTreeNode[] = [
      node({ id: "chapter", sortOrder: 0 }),
      node({
        id: "paneles",
        parentId: "chapter",
        sortOrder: 0,
        wbsNodeIds: ["wbs-panels"],
      }),
      node({ id: "other", parentId: "chapter", sortOrder: 1 }),
    ];
    const p = suggestPlacementForWbs(items, "wbs-panels");
    assert.ok(p);
    assert.equal(p!.parentId, "chapter");
    assert.equal(p!.afterItemId, "paneles");
    assert.equal(p!.sortOrder, 1);
  });

  it("suggestPlacementForWbs returns null when no link", () => {
    assert.equal(suggestPlacementForWbs([node({ id: "a" })], "missing"), null);
  });

  it("wouldCreateCycle detects ancestor loops", () => {
    const items = [
      node({ id: "root" }),
      node({ id: "child", parentId: "root" }),
      node({ id: "grand", parentId: "child" }),
    ];
    assert.equal(wouldCreateCycle(items, "root", "grand"), true);
    assert.equal(wouldCreateCycle(items, "grand", "root"), false);
    assert.equal(wouldCreateCycle(items, "child", null), false);
  });

  it("applyMoveSibling up/down swaps order", () => {
    const items = [
      node({ id: "a", sortOrder: 0 }),
      node({ id: "b", sortOrder: 1 }),
      node({ id: "c", sortOrder: 2 }),
    ];
    const up = applyMoveSibling(items, "b", { kind: "up" });
    assert.deepEqual(up?.orderedSiblingIds, ["b", "a", "c"]);
    const down = applyMoveSibling(items, "b", { kind: "down" });
    assert.deepEqual(down?.orderedSiblingIds, ["a", "c", "b"]);
    assert.equal(applyMoveSibling(items, "a", { kind: "up" }), null);
  });

  it("applyMoveSibling indent under previous sibling and flags leaf promotion", () => {
    const items = [
      node({ id: "a", sortOrder: 0 }),
      node({ id: "b", sortOrder: 1 }),
    ];
    const result = applyMoveSibling(items, "b", { kind: "indent" });
    assert.ok(result);
    assert.equal(result!.parentId, "a");
    assert.deepEqual(result!.orderedSiblingIds, ["b"]);
    assert.equal(result!.promotesLeafToContainer, true);
  });

  it("applyMoveSibling outdent places after former parent", () => {
    const items = [
      node({ id: "root", sortOrder: 0 }),
      node({ id: "child", parentId: "root", sortOrder: 0 }),
      node({ id: "sib", sortOrder: 1 }),
    ];
    const result = applyMoveSibling(items, "child", { kind: "outdent" });
    assert.ok(result);
    assert.equal(result!.parentId, null);
    assert.deepEqual(result!.orderedSiblingIds, ["root", "child", "sib"]);
  });

  it("applyMoveSibling place rejects unknown afterItemId", () => {
    const items = [
      node({ id: "a", sortOrder: 0 }),
      node({ id: "b", sortOrder: 1 }),
    ];
    assert.equal(
      applyMoveSibling(items, "b", {
        kind: "place",
        parentId: null,
        afterItemId: "missing",
      }),
      null,
    );
  });

  it("applyMoveSibling place respects afterItemId", () => {
    const items = [
      node({ id: "a", sortOrder: 0 }),
      node({ id: "b", sortOrder: 1 }),
      node({ id: "c", parentId: "x", sortOrder: 0 }),
    ];
    const result = applyMoveSibling(items, "c", {
      kind: "place",
      parentId: null,
      afterItemId: "a",
    });
    assert.deepEqual(result?.orderedSiblingIds, ["a", "c", "b"]);
  });

  it("applyMoveSibling place flags leaf→container when nesting under a leaf", () => {
    const items = [
      node({ id: "leaf", sortOrder: 0 }),
      node({ id: "other", sortOrder: 1 }),
    ];
    const result = applyMoveSibling(items, "other", {
      kind: "place",
      parentId: "leaf",
      afterItemId: null,
    });
    assert.ok(result);
    assert.equal(result!.parentId, "leaf");
    assert.equal(result!.promotesLeafToContainer, true);
    const reorderOnly = applyMoveSibling(
      [
        node({ id: "parent", sortOrder: 0 }),
        node({ id: "child", parentId: "parent", sortOrder: 0 }),
      ],
      "child",
      { kind: "place", parentId: "parent", afterItemId: null },
    );
    assert.equal(reorderOnly?.promotesLeafToContainer, false);
  });

  it("activeSiblings excludes cancelled", () => {
    const items = [
      node({ id: "a", sortOrder: 0 }),
      node({ id: "b", sortOrder: 1, status: "CANCELLED" }),
    ];
    assert.deepEqual(
      activeSiblings(items, null).map((i) => i.id),
      ["a"],
    );
  });

  it("shouldSyncProgressFromJobsite skips milestones (D-103)", () => {
    assert.equal(shouldSyncProgressFromJobsite("TASK"), true);
    assert.equal(shouldSyncProgressFromJobsite("MILESTONE"), false);
  });
});
