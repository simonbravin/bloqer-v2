import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Prisma } from "@bloqer/database";
import {
  assertSubcontractDateRange,
  assertSubcontractQuantityWithinBalance,
  subcontractLineTotal,
} from "./subcontract-values";
const decimal = (value: string) => new Prisma.Decimal(value);
describe("AG08 subcontract value invariants", () => {
  it("rounds the final product to money without rounding quantity or price early", () => {
    assert.equal(subcontractLineTotal(decimal("1.2345"), decimal("1.2550")).toFixed(2), "1.55");
    assert.equal(subcontractLineTotal(decimal("1"), decimal("1.0050")).toFixed(2), "1.01");
    assert.throws(() => subcontractLineTotal(decimal("99999999999999"), decimal("2")), /capacidad/);
  });
  it("checks aggregate current quantities against approved quantities before committing", () => {
    assert.doesNotThrow(() =>
      assertSubcontractQuantityWithinBalance(decimal("4"), decimal("6"), decimal("10")),
    );
    for (const [current, previous] of [
      ["4.0001", "6"],
      ["0", "6"],
      ["-1", "6"],
      ["1", "-1"],
    ])
      assert.throws(
        () =>
          assertSubcontractQuantityWithinBalance(
            decimal(current!),
            decimal(previous!),
            decimal("10"),
          ),
        /saldo/,
      );
  });
  it("rechecks merged date ranges rather than validating only the submitted half of a patch", () => {
    assert.doesNotThrow(() =>
      assertSubcontractDateRange(new Date("2026-11-05"), new Date("2026-11-05")),
    );
    assert.throws(
      () => assertSubcontractDateRange(new Date("2026-11-06"), new Date("2026-11-05")),
      /posterior/,
    );
  });
});
