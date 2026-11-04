import assert from "node:assert/strict";
import test from "node:test";
import { Prisma, type BudgetSettings } from "@bloqer/database";
import { _recalcBudgetSummary, _recalcCostItemTotals, financialCostFactor } from "./budget-calc.service";
import { ServiceError } from "../types";
import { assertBudgetDecimalFits } from "./budget-decimal";

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

test("item recalculation preserves authoritative legacy APU precision and rounds the unit subtotal D-047/D-053", async () => {
  let saved: Record<string, Prisma.Decimal> | null = null;
  const tx = {
    costAnalysisLine: { findMany: async () => [{ totalCost: new D("0.104") }, { totalCost: new D("0.104") }] },
    costItem: {
      findUniqueOrThrow: async () => ({ quantity: new D("3") }),
      update: async ({ data }: { data: Record<string, Prisma.Decimal> }) => { saved = data; },
    },
  } as unknown as Parameters<typeof _recalcCostItemTotals>[0];
  const settings = { overheadPct: new D("50"), financialCostPct: new D("0"), financialDaysAvg: 0, profitPct: new D("0"), taxPct: new D("0") } as BudgetSettings;
  await _recalcCostItemTotals(tx, "item", settings);
  assert.ok(saved);
  const result = saved as Record<string, Prisma.Decimal>;
  assert.equal(result.unitCostDirect!.toString(), "0.21", "recalculating settings must not regularize stored legacy contributions per line");
  assert.equal(result.unitSalePrice!.toString(), "0.32");
  assert.equal(result.totalCostDirect!.toString(), "0.63");
  assert.equal(result.totalSalePrice!.toString(), "0.96");
});

test("budget storage guard preserves valid historical precision and rejects overflow without clamping", () => {
  assert.equal(assertBudgetDecimalFits("1.005", "Costo").toString(), "1.005");
  assert.equal(assertBudgetDecimalFits("99999999999999.9999", "Cantidad").toString(), "99999999999999.9999");
  assert.throws(() => assertBudgetDecimalFits("100000000000000", "Costo"), (error: unknown) => error instanceof ServiceError && error.code === "VALIDATION");
});

test("derived quantity and sale overflow is rejected before writing the CostItem", async () => {
  for (const [quantity, profitPct] of [["3", "0"], ["1", "100"]]) {
    let writes = 0;
    const tx = {
      costAnalysisLine: { findMany: async () => [{ totalCost: new D("50000000000000") }] },
      costItem: {
        findUniqueOrThrow: async () => ({ quantity: new D(quantity!) }),
        update: async () => { writes++; },
      },
    } as unknown as Parameters<typeof _recalcCostItemTotals>[0];
    const settings = { overheadPct: new D("0"), financialCostPct: new D("0"), financialDaysAvg: 0, profitPct: new D(profitPct!), taxPct: new D("0") } as BudgetSettings;
    await assert.rejects(() => _recalcCostItemTotals(tx, "item", settings), (error: unknown) => error instanceof ServiceError && error.code === "VALIDATION");
    assert.equal(writes, 0);
  }
});

test("budget aggregation rejects a total that exceeds its column even when each item fits", async () => {
  let writes = 0;
  const tx = {
    costItem: { findMany: async () => [1, 2].map(() => ({ totalCostDirect: new D("50000000000000"), totalSalePrice: new D("50000000000000") })) },
    budget: { update: async () => { writes++; } },
  } as unknown as Parameters<typeof _recalcBudgetSummary>[0];
  await assert.rejects(() => _recalcBudgetSummary(tx, "budget"), (error: unknown) => error instanceof ServiceError && error.code === "VALIDATION");
  assert.equal(writes, 0);
});
