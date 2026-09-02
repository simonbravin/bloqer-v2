import assert from "node:assert/strict";
import { test } from "node:test";
import { Prisma } from "@bloqer/database";
import {
  evaluateLineVariance,
  evaluateLineVarianceLenient,
  formatMissingVarianceJustificationError,
  isComparablePurchaseBaseline,
  poRequiresHighLevelApproval,
  resolveBudgetRefKind,
} from "./purchase-variance.service";

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

test("evaluateLineVariance savings vs baseline stay NONE (no justification)", () => {
  const r = evaluateLineVariance(
    { unit: "gl", unitPrice: "1200000", budgetUnitCost: "28000000", budgetUnit: "gl" },
    settings,
  );
  assert.equal(r.varianceTier, "NONE");
  assert.equal(r.requiresJustification, false);
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

test("resolveBudgetRefKind marks gl partida as GLOBAL_PARTIDA", () => {
  assert.equal(resolveBudgetRefKind("un", "gl", null), "GLOBAL_PARTIDA");
  assert.equal(resolveBudgetRefKind("un", "un", "200000"), "UNIT_PRICE");
  assert.equal(resolveBudgetRefKind("un", "un", null), "NONE");
});

test("isComparablePurchaseBaseline is false for gl partida vs physical line", () => {
  assert.equal(isComparablePurchaseBaseline("un", "gl"), false);
  assert.equal(isComparablePurchaseBaseline("gl", "gl"), true);
  assert.equal(isComparablePurchaseBaseline("m2", "m2"), true);
});

test("formatMissingVarianceJustificationError lists lines and points to Editar", () => {
  const msg = formatMissingVarianceJustificationError([
    "Perfil C 140 (unidad distinta al presupuesto)",
  ]);
  assert.match(msg, /Perfil C 140/);
  assert.match(msg, /Editar/);
});

test("evaluateLineVarianceLenient does not throw on incomplete unit price", () => {
  const r = evaluateLineVarianceLenient(
    { unit: "un", unitPrice: "12.", budgetUnitCost: "100", budgetUnit: "un" },
    settings,
  );
  assert.equal(r.varianceTier, "NONE");
  assert.equal(r.requiresJustification, false);
});

test("evaluateLineVariance throws on incomplete unit price (submit must not skip the gate)", () => {
  assert.throws(() =>
    evaluateLineVariance(
      { unit: "un", unitPrice: "12.", budgetUnitCost: "100", budgetUnit: "un" },
      settings,
    ),
  );
});

test("evaluateLineVariance does not treat global partida vs physical line as a desvío", () => {
  const r = evaluateLineVariance(
    {
      unit: "un",
      unitPrice: "107452.35",
      budgetUnitCost: "158669372",
      budgetUnit: "gl",
    },
    settings,
  );
  assert.equal(r.varianceTier, "NONE");
  assert.equal(r.requiresJustification, false);
  assert.equal(r.varianceUnitMismatch, false);
});

test("poRequiresHighLevelApproval is true at threshold", () => {
  assert.equal(
    poRequiresHighLevelApproval(new Prisma.Decimal("100000"), { poApprovalThresholdArs: "100000" }),
    true,
  );
});

test("evaluateLineVariance uses effective unit price after discount [D-093]", () => {
  const r = evaluateLineVariance(
    { unit: "m2", unitPrice: "130", discountPct: "10", budgetUnitCost: "100", budgetUnit: "m2" },
    settings,
  );
  // 130 × (1−10%) = 117 vs 100 → 17% → NOTE_REQUIRED (soft 10, extra 25)
  assert.equal(r.varianceTier, "NOTE_REQUIRED");
  assert.equal(r.requiresExtraApproval, false);
  assert.equal(r.requiresJustification, true);
});

test("poRequiresHighLevelApproval is false below threshold", () => {
  assert.equal(
    poRequiresHighLevelApproval(new Prisma.Decimal("99999"), { poApprovalThresholdArs: "100000" }),
    false,
  );
});
