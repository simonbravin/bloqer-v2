import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyApuToPurchaseRequestLine,
  buildLinesFromApuShortfalls,
  computeApuCoverage,
  computeApuLineEstimatedAmount,
  createEmptyPurchaseRequestLine,
  formatApuCoverageHint,
  mergeApuShortfallLines,
  preparePurchaseRequestLinesForSubmit,
  selectedApuIds,
  sumPurchaseRequestApuEstimates,
  validatePurchaseRequestLines,
  type PurchaseRequestApuLine,
  type PurchaseRequestLineDraft,
} from "./purchase-request-form-lines";

const WBS = "11111111-1111-4111-8111-111111111111";

const apuA: PurchaseRequestApuLine = {
  id: "apu-a",
  description: "Cemento",
  unit: "tn",
  unitCost: "120000.0000",
  productId: null,
  quantity: "5",
  needQty: "10",
  orderedQty: "5",
  shortfallQty: "5",
};

const apuB: PurchaseRequestApuLine = {
  id: "apu-b",
  description: "Arena",
  unit: "m3",
  unitCost: "8000.0000",
  productId: null,
  quantity: "0",
  needQty: "20",
  orderedQty: "20",
  shortfallQty: "0",
};

const apuC: PurchaseRequestApuLine = {
  id: "apu-c",
  description: "Hierro",
  unit: "kg",
  unitCost: "1500.0000",
  productId: null,
  quantity: "100",
  shortfallQty: "100",
};

function line(overrides: Partial<PurchaseRequestLineDraft> = {}): PurchaseRequestLineDraft {
  return {
    rowKey: overrides.rowKey ?? "row-1",
    costAnalysisLineId: null,
    description: "",
    quantity: "1",
    unit: "",
    productId: null,
    ...overrides,
  };
}

test("computeApuCoverage counts selected and remaining shortfalls", () => {
  const coverage = computeApuCoverage([apuA, apuB, apuC], [
    line({ costAnalysisLineId: "apu-a", description: "Cemento", quantity: "5" }),
  ]);
  assert.equal(coverage.totalApuCount, 3);
  assert.equal(coverage.selectedApuCount, 1);
  assert.equal(coverage.remainingApuCount, 2);
  assert.equal(coverage.remainingWithShortfallCount, 1);
  assert.equal(coverage.allSelected, false);
});

test("formatApuCoverageHint messages", () => {
  assert.match(
    formatApuCoverageHint(computeApuCoverage([apuA, apuC], [])) ?? "",
    /2 insumos APU más/,
  );
  assert.match(
    formatApuCoverageHint(computeApuCoverage([apuA, apuC], [])) ?? "",
    /2 con faltante/,
  );
  assert.equal(
    formatApuCoverageHint(
      computeApuCoverage([apuA], [line({ costAnalysisLineId: "apu-a", description: "x", quantity: "1" })]),
    ),
    "Están todos los insumos APU de esta partida en la solicitud.",
  );
  assert.equal(
    formatApuCoverageHint(computeApuCoverage([], [])),
    "Esta partida no tiene insumos APU de materiales. Cargá descripción a mano.",
  );
});

test("applyApu prefills shortfall quantity", () => {
  const next = applyApuToPurchaseRequestLine(createEmptyPurchaseRequestLine(), apuA);
  assert.equal(next.costAnalysisLineId, "apu-a");
  assert.equal(next.description, "Cemento");
  assert.equal(next.quantity, "5");
  assert.equal(next.unit, "tn");
});

test("computeApuLineEstimatedAmount multiplies qty by APU unit cost", () => {
  assert.equal(computeApuLineEstimatedAmount("5", "120000.0000"), "600000.00");
  assert.equal(computeApuLineEstimatedAmount("1", ""), null);
});

test("sumPurchaseRequestApuEstimates sums only APU-bound lines", () => {
  const total = sumPurchaseRequestApuEstimates(
    [
      line({ costAnalysisLineId: "apu-a", quantity: "5" }),
      line({ rowKey: "manual", description: "Varios", quantity: "99" }),
      line({ rowKey: "row-2", costAnalysisLineId: "apu-c", quantity: "2" }),
    ],
    [apuA, apuC],
  );
  assert.equal(total, "603000.00");
});

test("buildLinesFromApuShortfalls skips selected and zero shortfall", () => {
  const existing = [line({ costAnalysisLineId: "apu-a", description: "Cemento", quantity: "5" })];
  const added = buildLinesFromApuShortfalls([apuA, apuB, apuC], existing);
  assert.equal(added.length, 1);
  assert.equal(added[0]?.costAnalysisLineId, "apu-c");
  assert.equal(added[0]?.quantity, "100");
});

test("mergeApuShortfallLines replaces blank-only draft and drops stray blank rows", () => {
  const fromBlank = mergeApuShortfallLines([apuA, apuC], [line()]);
  assert.equal(fromBlank.length, 2);
  assert.equal(fromBlank[0]?.costAnalysisLineId, "apu-a");

  const mixed = mergeApuShortfallLines(
    [apuA, apuC],
    [
      line({ costAnalysisLineId: "apu-a", description: "Cemento", quantity: "5" }),
      line({ rowKey: "blank" }),
    ],
  );
  assert.equal(mixed.length, 2);
  assert.equal(mixed[1]?.costAnalysisLineId, "apu-c");
});

test("validate rejects duplicate APU and empty submit", () => {
  assert.equal(
    validatePurchaseRequestLines([line()]),
    "Agregá al menos un material",
  );
  assert.equal(
    validatePurchaseRequestLines([
      line({ costAnalysisLineId: "apu-a", description: "A", quantity: "1" }),
      line({ rowKey: "row-2", costAnalysisLineId: "apu-a", description: "B", quantity: "2" }),
    ]),
    "No podés repetir el mismo insumo APU en la solicitud",
  );
});

test("preparePurchaseRequestLinesForSubmit builds payload", () => {
  const prepared = preparePurchaseRequestLinesForSubmit(
    [
      line({ costAnalysisLineId: "apu-a", description: "Cemento", quantity: "5", unit: "tn" }),
      line({ rowKey: "row-2" }),
    ],
    WBS,
    "un",
  );
  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;
  assert.equal(prepared.lines.length, 1);
  assert.equal(prepared.lines[0]?.wbsNodeId, WBS);
  assert.equal(prepared.lines[0]?.costAnalysisLineId, "apu-a");
  assert.equal(prepared.lines[0]?.sortOrder, 0);
});

test("selectedApuIds collects bound lines", () => {
  assert.deepEqual(
    [...selectedApuIds([
      line({ costAnalysisLineId: "apu-a" }),
      line({ rowKey: "r2", costAnalysisLineId: "apu-c" }),
    ])].sort(),
    ["apu-a", "apu-c"],
  );
});
