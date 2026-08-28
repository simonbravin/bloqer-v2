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
    quantity: "1.0000",
    budgetUnitCostSnapshot: null,
    ...partial,
  };
}

test("computeEstimatedAmount sums budget snapshots when all lines have ref", () => {
  const r = computeEstimatedAmount(
    { status: "SUBMITTED" },
    [
      line({ description: "A", quantity: "10.0000", budgetUnitCostSnapshot: "100.0000" }),
      line({ description: "B", quantity: "2.0000", budgetUnitCostSnapshot: "50.0000" }),
    ],
    null,
  );
  assert.equal(r.estimatedAmountSource, "budget");
  assert.equal(r.estimatedAmountCurrency, "ARS");
  assert.equal(r.estimatedAmount, "1100.00");
});

test("computeEstimatedAmount returns null when any line lacks budget snapshot", () => {
  const r = computeEstimatedAmount(
    { status: "SUBMITTED" },
    [
      line({ description: "A", budgetUnitCostSnapshot: "100.0000" }),
      line({ description: "B", budgetUnitCostSnapshot: null }),
    ],
    null,
  );
  assert.equal(r.estimatedAmount, null);
  assert.equal(r.estimatedAmountSource, null);
});

test("computeEstimatedAmount prefers selected quote when status is QUOTE_SELECTED", () => {
  const r = computeEstimatedAmount(
    { status: "QUOTE_SELECTED" },
    [line({ description: "A", budgetUnitCostSnapshot: "100.0000" })],
    { totalAmount: "646918.39", currency: "ARS" },
  );
  assert.equal(r.estimatedAmountSource, "quote");
  assert.equal(r.estimatedAmount, "646918.39");
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
