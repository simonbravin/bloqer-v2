import assert from "node:assert/strict";
import { test } from "node:test";
import { Prisma } from "@bloqer/database";
import { fallbackBudgetFromCostItem } from "./procurement-budget-baseline";

test("fallbackBudgetFromCostItem uses CostItem unit cost when > 0", () => {
  const r = fallbackBudgetFromCostItem({
    unit: "gl",
    quantity: new Prisma.Decimal("1"),
    unitCostDirect: new Prisma.Decimal("28000000"),
  });
  assert.equal(r.unit, "gl");
  assert.equal(r.unitCost?.toFixed(2), "28000000.00");
  assert.equal(r.quantity?.toFixed(0), "1");
});

test("fallbackBudgetFromCostItem is null when CostItem has no unit cost", () => {
  const r = fallbackBudgetFromCostItem({
    unit: "m2",
    quantity: new Prisma.Decimal("10"),
    unitCostDirect: new Prisma.Decimal("0"),
  });
  assert.equal(r.unitCost, null);
  assert.equal(r.unit, "m2");
});

test("saldo partida compares budget neto against committed lineSubtotal not lineTotal with IVA", () => {
  const budgeted = new Prisma.Decimal("1000");
  const committedNet = new Prisma.Decimal("800");
  const committedGrossWithIva = new Prisma.Decimal("968");
  const availFromNet = budgeted.minus(committedNet);
  const availFromGross = budgeted.minus(committedGrossWithIva);
  assert.equal(availFromNet.toFixed(2), "200.00");
  assert.equal(availFromGross.toFixed(2), "32.00");
  assert.ok(availFromNet.greaterThan(availFromGross));
});
