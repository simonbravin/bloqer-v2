import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sortTreeOrder } from "./sort-tree-order";

describe("sortTreeOrder", () => {
  it("walks parents then children by sortOrder", () => {
    const nodes = [
      { id: "g2", parentId: null, sortOrder: 1, code: "2" },
      { id: "g1", parentId: null, sortOrder: 0, code: "1" },
      { id: "i12", parentId: "g1", sortOrder: 1, code: "1.2" },
      { id: "i11", parentId: "g1", sortOrder: 0, code: "1.1" },
      { id: "i21", parentId: "g2", sortOrder: 0, code: "2.1" },
    ];
    assert.deepEqual(
      sortTreeOrder(nodes).map((n) => n.code),
      ["1", "1.1", "1.2", "2", "2.1"],
    );
  });

  it("treats missing parents as roots so ITEM-only lists group by sibling sortOrder", () => {
    const leaves = [
      { id: "a", parentId: "g19", sortOrder: 0, code: "19.1" },
      { id: "b", parentId: "g1", sortOrder: 1, code: "1.2" },
      { id: "c", parentId: "g20", sortOrder: 0, code: "20.1" },
    ];
    assert.deepEqual(
      sortTreeOrder(leaves).map((n) => n.code),
      ["19.1", "20.1", "1.2"],
    );
  });
});
