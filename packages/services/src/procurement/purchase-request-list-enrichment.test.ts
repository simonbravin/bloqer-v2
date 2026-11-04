import assert from "node:assert/strict";
import { test } from "node:test";
import {
  computeEstimatedAmount,
  computeLineSummaries,
  type PurchaseRequestLineForList,
} from "./purchase-request-list-enrichment";

function line(
  partial: Partial<PurchaseRequestLineForList> & Pick<PurchaseRequestLineForList, "description">,
): PurchaseRequestLineForList {
  return {
    wbsNodeId: null,
    wbsNodeCode: null,
    wbsNodeName: null,
    costAnalysisLineId: null,
    quantity: "1.0000",
    budgetUnitCostSnapshot: null,
    apuUnitCost: null,
    budgetCurrency: "ARS",
    ...partial,
  };
}

test("computeEstimatedAmount sums APU line snapshots", () => {
  const r = computeEstimatedAmount(
    { status: "SUBMITTED" },
    [
      line({
        description: "A",
        costAnalysisLineId: "apu-a",
        quantity: "10.0000",
        budgetUnitCostSnapshot: "100.0000",
      }),
      line({
        description: "B",
        costAnalysisLineId: "apu-b",
        quantity: "2.0000",
        budgetUnitCostSnapshot: "50.0000",
      }),
    ],
    null,
  );
  assert.equal(r.estimatedAmountSource, "budget");
  assert.equal(r.estimatedAmountCurrency, "ARS");
  assert.equal(r.estimatedAmount, "1100.00");
});

test("computeEstimatedAmount uses live APU unit cost on DRAFT lines", () => {
  const r = computeEstimatedAmount(
    { status: "DRAFT" },
    [
      line({
        description: "Cemento",
        costAnalysisLineId: "apu-a",
        quantity: "5.0000",
        apuUnitCost: "120000.0000",
      }),
    ],
    null,
  );
  assert.equal(r.estimatedAmountSource, "budget");
  assert.equal(r.estimatedAmount, "600000.00");
});

test("computeEstimatedAmount does not present a partial APU subtotal as the entire request estimate", () => {
  const r = computeEstimatedAmount(
    { status: "SUBMITTED" },
    [
      line({
        description: "A",
        costAnalysisLineId: "apu-a",
        quantity: "1.0000",
        budgetUnitCostSnapshot: "100.0000",
      }),
      line({
        description: "Manual",
        quantity: "99.0000",
        budgetUnitCostSnapshot: "99999.0000",
      }),
    ],
    null,
  );
  assert.equal(r.estimatedAmount, null);
});

test("computeEstimatedAmount returns null when APU line lacks unit cost", () => {
  const r = computeEstimatedAmount(
    { status: "DRAFT" },
    [line({ description: "A", costAnalysisLineId: "apu-a" })],
    null,
  );
  assert.equal(r.estimatedAmount, null);
  assert.equal(r.estimatedAmountSource, null);
});

test("computeEstimatedAmount returns null when no APU-bound lines", () => {
  const r = computeEstimatedAmount(
    { status: "SUBMITTED" },
    [line({ description: "Manual", budgetUnitCostSnapshot: "100.0000" })],
    null,
  );
  assert.equal(r.estimatedAmount, null);
});

test("computeEstimatedAmount prefers selected quote when status is QUOTE_SELECTED", () => {
  const r = computeEstimatedAmount(
    { status: "QUOTE_SELECTED" },
    [
      line({
        description: "A",
        costAnalysisLineId: "apu-a",
        budgetUnitCostSnapshot: "100.0000",
      }),
    ],
    { totalAmount: "646918.39", currency: "ARS" },
  );
  assert.equal(r.estimatedAmountSource, "quote");
  assert.equal(r.estimatedAmount, "646918.39");
  assert.equal(r.estimatedAmountCurrency, "ARS");
});

test("computeEstimatedAmount prefers active order totals over quote", () => {
  const r = computeEstimatedAmount(
    { status: "SUBMITTED" },
    [],
    { totalAmount: "999.00", currency: "ARS" },
    ["100.00", "50.50"],
  );
  assert.equal(r.estimatedAmountSource, "orders");
  assert.equal(r.estimatedAmount, "150.50");
  assert.equal(r.estimatedAmountCurrency, "ARS");
});

test("computeEstimatedAmount uses quote for COMPLETED status", () => {
  const r = computeEstimatedAmount(
    { status: "COMPLETED" },
    [line({ description: "A" })],
    { totalAmount: "500.00", currency: "USD" },
  );
  assert.equal(r.estimatedAmountSource, "quote");
  assert.equal(r.estimatedAmountCurrency, "USD");
});

test("computeEstimatedAmount preserves native budget currency without implied FX", () => {
  const r = computeEstimatedAmount({ status: "SUBMITTED" }, [line({
    description: "USD resource", costAnalysisLineId: "apu-usd", budgetUnitCostSnapshot: "12.50", quantity: "2", budgetCurrency: "USD",
  })], null);
  assert.equal(r.estimatedAmount, "25.00");
  assert.equal(r.estimatedAmountCurrency, "USD");
});

test("computeEstimatedAmount stays unknown for mixed or missing budget currency", () => {
  for (const currency of ["USD", null]) {
    const r = computeEstimatedAmount({ status: "SUBMITTED" }, [
      line({ description: "ARS", costAnalysisLineId: "apu-ars", budgetUnitCostSnapshot: "10" }),
      line({ description: "other", costAnalysisLineId: "apu-other", budgetUnitCostSnapshot: "20", budgetCurrency: currency }),
    ], null);
    assert.equal(r.estimatedAmount, null);
    assert.equal(r.estimatedAmountCurrency, null);
  }
});

test("submitted estimates do not substitute a live APU value for a missing historical snapshot", () => {
  const r = computeEstimatedAmount({ status: "SUBMITTED" }, [line({
    description: "Snapshot missing", costAnalysisLineId: "apu", apuUnitCost: "900.00",
  })], null);
  assert.equal(r.estimatedAmount, null);
});

test("computeLineSummaries flags multiple WBS and picks primary from first line with WBS", () => {
  const r = computeLineSummaries([
    line({
      description: "Cemento",
      wbsNodeId: "wbs-a",
      wbsNodeCode: "01.01",
      wbsNodeName: "Fundaciones",
    }),
    line({
      description: "Arena",
      wbsNodeId: "wbs-b",
      wbsNodeCode: "01.02",
      wbsNodeName: "Muros",
    }),
  ]);
  assert.equal(r.linesCount, 2);
  assert.equal(r.firstLineDescription, "Cemento");
  assert.equal(r.hasMultipleWbs, true);
  assert.equal(r.primaryWbsNodeCode, "01.01");
  assert.equal(r.primaryWbsNodeName, "Fundaciones");
});

test("computeLineSummaries single WBS is not flagged as multiple", () => {
  const r = computeLineSummaries([
    line({
      description: "A",
      wbsNodeId: "wbs-a",
      wbsNodeCode: "01.01",
      wbsNodeName: "Fundaciones",
    }),
    line({
      description: "B",
      wbsNodeId: "wbs-a",
      wbsNodeCode: "01.01",
      wbsNodeName: "Fundaciones",
    }),
  ]);
  assert.equal(r.hasMultipleWbs, false);
  assert.equal(r.primaryWbsNodeCode, "01.01");
});
