import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Prisma } from "@bloqer/database";
import { roundToDecimals } from "@bloqer/utils";

/** Mirrors CostControlRow pct helpers (D-098) without pulling the full service. */
function pctOfBudget(num: Prisma.Decimal, den: Prisma.Decimal): string | null {
  if (den.isZero()) return null;
  return roundToDecimals(num.div(den).times(100).toString(), 2);
}

describe("cost-control percentage helpers (D-098)", () => {
  it("returns null when budget is zero", () => {
    assert.equal(pctOfBudget(new Prisma.Decimal(100), new Prisma.Decimal(0)), null);
  });

  it("computes purchased / exposure pct", () => {
    assert.equal(pctOfBudget(new Prisma.Decimal(50), new Prisma.Decimal(100)), "50.00");
    assert.equal(pctOfBudget(new Prisma.Decimal(110), new Prisma.Decimal(100)), "110.00");
  });

  it("supports physical qty ratio", () => {
    assert.equal(pctOfBudget(new Prisma.Decimal("2.5"), new Prisma.Decimal(10)), "25.00");
  });
});
