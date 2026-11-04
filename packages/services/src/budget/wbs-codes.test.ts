import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildRenumberPlan, nextChildCode, nextRootGroupCode } from "./wbs-codes";

const row = (id: string, code: string, parentId: string | null = null) => ({ id, code, parentId, type: "GROUP" as const, sortOrder: 0 });

describe("WBS numbering integrity", () => {
  it("uses the next free suffix after gaps and large imported codes", () => {
    assert.equal(nextRootGroupCode([row("one", "1"), row("three", "3")]), "4");
    assert.equal(nextChildCode("ARQ.1", [row("one", "ARQ.1.1", "parent"), row("three", "ARQ.1.3", "parent")]), "ARQ.1.4");
    assert.equal(nextRootGroupCode([row("large", "9007199254740992")]), "9007199254740993");
  });

  it("renumbers descendants by actual parentage, without touching a separate matching prefix", () => {
    const plan = buildRenumberPlan([
      row("a", "1"), row("a-child", "1.1", "a"),
      row("b", "2"), row("b-child", "2.1", "b"),
      row("unrelated", "1.99", "b"),
    ], null, ["b", "a"]);
    assert.equal(plan.get("a-child"), "2.1");
    assert.equal(plan.get("b-child"), "1.1");
    assert.notEqual(plan.get("unrelated"), "2.99");
  });
});
