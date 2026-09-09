import assert from "node:assert/strict";
import { test } from "node:test";
import { Prisma } from "@bloqer/database";
import { withDraftAwareRemainingQuantity } from "./purchase-receipt.service";
import type { PurchaseOrderLineView } from "./purchase-order.service";

function stubLine(overrides: Partial<PurchaseOrderLineView> & Pick<PurchaseOrderLineView, "id">): PurchaseOrderLineView {
  return {
    purchaseOrderId: "po-1",
    purchaseRequestLineId: null,
    wbsNodeId: null,
    wbsNodeCode: null,
    wbsNodeName: null,
    productId: null,
    costAnalysisLineId: null,
    costType: "MATERIAL",
    description: "Item",
    unit: "un",
    quantity: "10.0000",
    unitPrice: "1.000000",
    taxRate: "0.0000",
    discountPct: "0.0000",
    lineSubtotal: "10.00",
    lineTax: "0.00",
    lineTotal: "10.00",
    receivedQuantity: "0.0000",
    remainingQuantity: "10.0000",
    sortOrder: 0,
    budgetUnitCostSnapshot: null,
    budgetUnit: null,
    budgetRefKind: "NONE",
    suggestedApu: null,
    varianceTier: "NONE",
    variancePct: null,
    varianceJustification: null,
    ...overrides,
  };
}

test("withDraftAwareRemainingQuantity subtracts other DRAFT reservations", () => {
  const lines = [stubLine({ id: "line-1", remainingQuantity: "10.0000" })];
  const reserved = new Map([["line-1", new Prisma.Decimal("6")]]);
  const patched = withDraftAwareRemainingQuantity(lines, reserved);
  assert.equal(patched[0]!.remainingQuantity, "4.0000");
});

test("withDraftAwareRemainingQuantity floors at zero", () => {
  const lines = [
    stubLine({
      id: "line-1",
      quantity: "5.0000",
      receivedQuantity: "2.0000",
      remainingQuantity: "3.0000",
    }),
  ];
  const reserved = new Map([["line-1", new Prisma.Decimal("9")]]);
  const patched = withDraftAwareRemainingQuantity(lines, reserved);
  assert.equal(patched[0]!.remainingQuantity, "0.0000");
});
