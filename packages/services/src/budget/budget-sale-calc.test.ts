import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { addDecimal } from "@bloqer/utils";
import { computeBudgetItemUnitSaleBreakdown, computeBudgetSaleBreakdown, type BudgetSaleSettings } from "./budget-sale-calc";

const zero: BudgetSaleSettings = {
  overheadPct: "0", financialCostPct: "0", financialDaysAvg: 0, profitPct: "0", taxPct: "0",
};

describe("budget sale kernel: persisted cascade and preview agree", () => {
  it("rounds each commercial stage half-up and uses annual rate/days D-073", () => {
    const result = computeBudgetItemUnitSaleBreakdown("100", {
      overheadPct: "10", financialCostPct: "40", financialDaysAvg: 180, profitPct: "15", taxPct: "21",
    });
    assert.deepEqual(result, {
      directCost: "100.00", overhead: "10.00", subtotal1: "110.00",
      financialCost: "21.70", financialEffectivePct: "19.7260", subtotal2: "131.70",
      profit: "19.76", subtotal3: "151.46", tax: "31.81", totalSale: "183.27",
    });
  });

  it("sums rounded item prices instead of reapplying percentages to the budget header", () => {
    const result = computeBudgetSaleBreakdown([
      { unitCostDirect: "0.01", quantity: "1" }, { unitCostDirect: "0.01", quantity: "1" },
    ], { ...zero, overheadPct: "50" });
    assert.equal(result.directCost, "0.02");
    assert.equal(result.overhead, "0.02");
    assert.equal(result.totalSale, "0.04", "header-wide markup would incorrectly report 0.03");
  });

  it("keeps the breakdown additive for fractional quantities", () => {
    const result = computeBudgetSaleBreakdown([{ unitCostDirect: "0.01", quantity: "1.5" }], { ...zero, profitPct: "50" });
    assert.equal(result.directCost, "0.02");
    assert.equal(result.totalSale, "0.03");
    assert.equal(result.profit, "0.01");
    assert.equal(addDecimal(addDecimal(addDecimal(addDecimal(result.directCost, result.overhead), result.financialCost), result.profit), result.tax), result.totalSale);
  });

  it("never rounds the effective annual percentage before calculating money", () => {
    const result = computeBudgetItemUnitSaleBreakdown("10000000", { ...zero, financialCostPct: "40", financialDaysAvg: 180 });
    assert.equal(result.financialCost, "1972602.74", "rounding the display percentage first would produce 1972600.00");
    assert.equal(result.totalSale, "11972602.74");
  });

  it("retains the legacy flat percentage when days are zero", () => {
    const result = computeBudgetItemUnitSaleBreakdown("100.05", { ...zero, financialCostPct: "10" });
    assert.equal(result.financialCost, "10.01");
    assert.equal(result.totalSale, "110.06");
  });

  it("handles zero quantity placeholders and an empty draft without NaN", () => {
    assert.equal(computeBudgetSaleBreakdown([{ unitCostDirect: "100", quantity: "0" }], zero).totalSale, "0.00");
    const empty = computeBudgetSaleBreakdown([], zero);
    assert.equal(empty.directCost, "0.00");
    assert.equal(empty.totalSale, "0.00");
  });

  it("preserves cents above the safe integer arithmetic boundary", () => {
    const result = computeBudgetSaleBreakdown([
      { unitCostDirect: "9007199254740.01", quantity: "1" },
      { unitCostDirect: "0.02", quantity: "1" },
    ], zero);
    assert.equal(result.totalSale, "9007199254740.03");
  });
});
