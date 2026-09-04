import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { compareSortValues, sortRowsByAccessor } from "./client-table-sort";

describe("compareSortValues", () => {
  it("compares numbers numerically", () => {
    assert.equal(compareSortValues(9, 10, "asc") < 0, true);
    assert.equal(compareSortValues(9, 10, "desc") > 0, true);
    assert.equal(compareSortValues(1000.5, 999, "asc") > 0, true);
  });

  it("puts null and NaN last in both directions", () => {
    assert.equal(compareSortValues(null, 1, "asc") > 0, true);
    assert.equal(compareSortValues(null, 1, "desc") > 0, true);
    assert.equal(compareSortValues(Number.NaN, 1, "asc") > 0, true);
    assert.equal(compareSortValues(1, null, "asc") < 0, true);
  });

  it("uses numeric localeCompare for codes", () => {
    assert.equal(compareSortValues("SC-2", "SC-10", "asc") < 0, true);
  });
});

describe("sortRowsByAccessor", () => {
  it("sorts amounts with missing values last", () => {
    const rows = [
      { id: "a", amount: 50 },
      { id: "b", amount: null as number | null },
      { id: "c", amount: 10 },
    ];
    const asc = sortRowsByAccessor(rows, (r) => r.amount, "asc").map((r) => r.id);
    const desc = sortRowsByAccessor(rows, (r) => r.amount, "desc").map((r) => r.id);
    assert.deepEqual(asc, ["c", "a", "b"]);
    assert.deepEqual(desc, ["a", "c", "b"]);
  });
});
