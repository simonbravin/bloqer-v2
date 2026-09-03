import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { matchesGgWbsLabel, selectGgItemIds } from "./gg-wbs-detect";

describe("matchesGgWbsLabel", () => {
  it("matches common Spanish labels and GG codes", () => {
    assert.equal(matchesGgWbsLabel("9", "Gastos Generales"), true);
    assert.equal(matchesGgWbsLabel("9.1", "Gasto general de obra"), true);
    assert.equal(matchesGgWbsLabel("8", "Indirectos"), true);
    assert.equal(matchesGgWbsLabel("GG", "Oficina"), true);
    assert.equal(matchesGgWbsLabel("GG.1", "Seguros"), true);
    assert.equal(matchesGgWbsLabel("GG1", "Varios"), true);
    assert.equal(matchesGgWbsLabel("1.1", "Replanteo"), false);
  });

  it("rejects product names that only contain GG as a token", () => {
    assert.equal(matchesGgWbsLabel("3.2", "Cable GG 4mm"), false);
    assert.equal(matchesGgWbsLabel("2.1", "Seguros GG"), false);
    assert.equal(matchesGgWbsLabel("1.5", "Costos indirectos de materiales"), false);
  });
});

describe("selectGgItemIds", () => {
  it("includes items under a matching GROUP and matching leaf items", () => {
    const ids = selectGgItemIds([
      { id: "g1", parentId: null, type: "GROUP", code: "9", name: "Gastos Generales" },
      { id: "i1", parentId: "g1", type: "ITEM", code: "9.1", name: "Oficina de obra" },
      { id: "i2", parentId: "g1", type: "ITEM", code: "9.2", name: "Seguros" },
      { id: "i3", parentId: null, type: "ITEM", code: "1.1", name: "Replanteo" },
      { id: "i4", parentId: null, type: "ITEM", code: "4.2", name: "Gastos generales varios" },
      { id: "i5", parentId: null, type: "ITEM", code: "3.2", name: "Cable GG 4mm" },
    ]);
    assert.deepEqual([...ids].sort(), ["i1", "i2", "i4"]);
  });
});
