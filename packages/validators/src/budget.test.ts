import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  budgetReturnForChangesSchema, createBudgetSchema, createCostAnalysisLineSchema,
  budgetImportRowSchema, isBudgetDecimalWithinStorage,
  createWbsNodeSchema, reorderWbsNodesSchema, saveCostItemApuSchema,
  updateBudgetSchema, updateBudgetSettingsSchema, updateCostAnalysisLineSchema, updateCostItemSchema,
} from "./budget";

const projectId = "4f7720df-dfbc-4026-80ee-6e1f0161138f";
const costItemId = "055d965b-bb64-4403-8b59-0bdd37f0cdba";
const lineId = "73bb6570-fe6f-48ab-8f75-7d41c099609e";
const line = { category: "MATERIAL", description: "Insumo", unit: "un", coefficient: 1, unitCost: 2, totalCost: 2 };

describe("budget input contracts", () => {
  it("rejects blank names and whitespace review observations", () => {
    assert.equal(createBudgetSchema.safeParse({ projectId, name: "   " }).success, false);
    assert.equal(updateBudgetSchema.safeParse({ name: "\n\t" }).success, false);
    assert.equal(budgetReturnForChangesSchema.safeParse({ comment: "  " }).success, false);
    assert.equal(createBudgetSchema.parse({ projectId, name: "  Base  ", currency: " usd " }).currency, "USD");
    assert.equal(budgetReturnForChangesSchema.parse({ comment: "  Corregir cómputo  " }).comment, "Corregir cómputo");
  });

  it("rejects nonfinite numbers before they reach Decimal or Prisma", () => {
    for (const value of [Infinity, -Infinity, NaN]) {
      assert.equal(createWbsNodeSchema.safeParse({ type: "ITEM", name: "A", quantity: value }).success, false);
      assert.equal(updateCostItemSchema.safeParse({ quantity: value }).success, false);
      for (const field of ["coefficient", "unitCost", "totalCost", "partidaQuantity"]) {
        assert.equal(createCostAnalysisLineSchema.safeParse({ ...line, costItemId, [field]: value }).success, false);
        assert.equal(updateCostAnalysisLineSchema.safeParse({ [field]: value }).success, false);
        assert.equal(saveCostItemApuSchema.safeParse({ costItemId, lines: [{ ...line, [field]: value }] }).success, false);
      }
    }
  });

  it("keeps import placeholders possible while requiring a positive stored quantity for active edits", () => {
    assert.equal(createWbsNodeSchema.parse({ type: "ITEM", name: "Pendiente", quantity: 0 }).quantity, 0);
    assert.equal(updateCostItemSchema.safeParse({ quantity: 0.00001 }).success, false);
    assert.equal(saveCostItemApuSchema.safeParse({ costItemId, quantity: 0.00001, lines: [] }).success, false);
    assert.equal(updateCostItemSchema.parse({ quantity: 1.23455 }).quantity, 1.2346);
    assert.equal(updateCostItemSchema.safeParse({ unit: "  " }).success, false);
    assert.equal(saveCostItemApuSchema.safeParse({ costItemId, unit: "  ", lines: [] }).success, false);
    assert.equal(updateCostItemSchema.parse({ unit: " m2 ", notes: null }).unit, "m2");
  });

  it("rounds authoritative money to 2 and APU coefficients/prices to 4 D-047/D-053", () => {
    const parsed = createCostAnalysisLineSchema.parse({ ...line, costItemId, coefficient: 1.23455, unitCost: 2.34565, totalCost: 2.675 });
    assert.equal(parsed.coefficient, 1.2346);
    assert.equal(parsed.unitCost, 2.3457);
    assert.equal(parsed.totalCost, 2.68);
    assert.equal(updateBudgetSettingsSchema.parse({ overheadPct: 12.34565 }).overheadPct, 12.3457);
    assert.equal(updateBudgetSettingsSchema.safeParse({ financialDaysAvg: 2_147_483_648 }).success, false);
  });

  it("rejects duplicate WBS ids and duplicate APU lines before any write", () => {
    assert.equal(reorderWbsNodesSchema.safeParse({ parentId: null, orderedNodeIds: [costItemId, costItemId] }).success, false);
    assert.equal(saveCostItemApuSchema.safeParse({ costItemId, lines: [{ ...line, id: lineId }, { ...line, id: lineId, _delete: true }] }).success, false);
    assert.equal(saveCostItemApuSchema.safeParse({ costItemId, lines: [line, line] }).success, true, "two new resources without ids may be intentionally identical");
  });

  it("rejects finite values that overflow the existing Decimal(18,4) columns", () => {
    assert.equal(isBudgetDecimalWithinStorage("99999999999999.9999"), true);
    assert.equal(isBudgetDecimalWithinStorage("99999999999999.99995"), false, "database-scale rounding must still fit");
    assert.equal(isBudgetDecimalWithinStorage("100000000000000"), false);
    assert.equal(updateCostItemSchema.safeParse({ quantity: 1e14 }).success, false);
    for (const field of ["coefficient", "unitCost", "totalCost", "partidaQuantity"]) {
      assert.equal(createCostAnalysisLineSchema.safeParse({ ...line, costItemId, [field]: 1e14 }).success, false);
    }
    const row = { code: "1", type: "ITEM", name: "Capacity" };
    assert.equal(budgetImportRowSchema.safeParse({ ...row, quantity: "100000000000000" }).success, false);
    assert.equal(budgetImportRowSchema.safeParse({ ...row, material_cost: "99999999999999.995" }).success, false);
    assert.equal(budgetImportRowSchema.safeParse({ ...row, quantity: "99999999999999.9999", material_cost: "99999999999999.99" }).success, true);
  });
});
