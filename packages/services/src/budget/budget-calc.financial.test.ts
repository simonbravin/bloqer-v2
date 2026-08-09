import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "@bloqer/database";
import { financialCostFactor } from "./budget-calc.service";

const D = Prisma.Decimal;

test("financialCostFactor: days=0 keeps flat % (legacy)", () => {
  const f = financialCostFactor(40, 0);
  assert.equal(f.toString(), "0.4");
});

test("financialCostFactor: days>0 applies annual × days/365 [D-073]", () => {
  // 40% × 180/365 ≈ 0.19726027397…
  const f = financialCostFactor(40, 180);
  const expected = new D(40).div(100).times(180).div(365);
  assert.ok(f.equals(expected));
  // Example from BUDGET_FORMULAS: 10_000_000 × factor ≈ 1_972_602.74
  const cf = new D(10_000_000).times(f).toDecimalPlaces(2, D.ROUND_HALF_UP);
  assert.equal(cf.toString(), "1972602.74");
});

test("financialCostFactor: zero rate yields zero", () => {
  assert.equal(financialCostFactor(0, 180).toString(), "0");
  assert.equal(financialCostFactor(0, 0).toString(), "0");
});
