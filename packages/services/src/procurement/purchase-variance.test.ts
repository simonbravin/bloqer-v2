import assert from "node:assert/strict";
import { test } from "node:test";
import { Prisma } from "@bloqer/database";
import { evaluateLineVariance, poRequiresHighLevelApproval } from "./purchase-variance.service";

const settings = {
  varianceSoftAlertPct: "10",
  varianceNoteRequiredPct: "25",
  varianceExtraApprovalPct: "25",
};

test("evaluateLineVariance returns NONE under soft threshold", () => {
  const r = evaluateLineVariance(
    { unit: "m2", unitPrice: "105", budgetUnitCost: "100", budgetUnit: "m2" },
    settings,
  );
  assert.equal(r.varianceTier, "NONE");
  assert.equal(r.requiresExtraApproval, false);
});

test("evaluateLineVariance returns EXTRA_APPROVAL over extra threshold", () => {
  const r = evaluateLineVariance(
    { unit: "m2", unitPrice: "130", budgetUnitCost: "100", budgetUnit: "m2" },
    settings,
  );
  assert.equal(r.varianceTier, "EXTRA_APPROVAL");
  assert.equal(r.requiresExtraApproval, true);
  assert.equal(r.requiresJustification, true);
});

test("evaluateLineVariance requires a note between soft and extra thresholds", () => {
  const r = evaluateLineVariance(
    { unit: "m2", unitPrice: "115", budgetUnitCost: "100", budgetUnit: "m2" },
    settings,
  );
  assert.equal(r.varianceTier, "NOTE_REQUIRED");
  assert.equal(r.requiresJustification, true);
  assert.equal(r.requiresExtraApproval, false);
});

test("evaluateLineVariance requires a note when no budget baseline exists", () => {
  const r = evaluateLineVariance(
    { unit: "m2", unitPrice: "115", budgetUnitCost: null, budgetUnit: "m2" },
    settings,
  );
  assert.equal(r.varianceTier, "NO_BUDGET_BASELINE");
  assert.equal(r.requiresJustification, true);
  assert.equal(r.requiresExtraApproval, false);
});

test("evaluateLineVariance returns UNIT_MISMATCH when units differ", () => {
  const r = evaluateLineVariance(
    { unit: "kg", unitPrice: "10", budgetUnitCost: "10", budgetUnit: "m2" },
    settings,
  );
  assert.equal(r.varianceTier, "UNIT_MISMATCH");
  assert.equal(r.varianceUnitMismatch, true);
});

test("poRequiresHighLevelApproval is true at threshold", () => {
  assert.equal(
    poRequiresHighLevelApproval(new Prisma.Decimal("100000"), { poApprovalThresholdArs: "100000" }),
    true,
  );
});

test("poRequiresHighLevelApproval is false below threshold", () => {
  assert.equal(
    poRequiresHighLevelApproval(new Prisma.Decimal("99999"), { poApprovalThresholdArs: "100000" }),
    false,
  );
});
