import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeScheduleProcurement, remainingScheduleProcurementQuantity, type ScheduleProcurementByWbs, type ScheduleProcurementLine } from "./schedule-procurement";

const line: ScheduleProcurementLine = {
  id: "line-a", purchaseOrderId: "po", purchaseOrderCode: "OC-001", wbsNodeId: "a", wbsCode: "1.1",
  description: "Panel", unit: "m2", quantity: "10.1234", receivedQuantity: "2.0001",
  remainingQuantity: "8.1233", expectedDeliveryDate: "2026-11-30",
};

test("remaining physical quantities preserve four decimals and clamp over-receipts to zero", () => {
  assert.equal(remainingScheduleProcurementQuantity("10.1234", "2.0001"), "8.1233");
  assert.equal(remainingScheduleProcurementQuantity("0.0002", "0.0001"), "0.0001");
  assert.equal(remainingScheduleProcurementQuantity("10", "10.5"), "0.0000");
});

test("merging linked EDT keeps line identity and units without summing or duplicating", () => {
  const byWbs = new Map<string, ScheduleProcurementByWbs>([
    ["a", { expectedDeliveryDate: "2026-11-30", latestReceiptDate: "2026-11-15", pendingLines: [line] }],
    ["b", { expectedDeliveryDate: "2026-11-28", latestReceiptDate: "2026-11-20", pendingLines: [{ ...line, id: "line-b", wbsNodeId: "b", unit: "bolsa" }] }],
  ]);
  const result = mergeScheduleProcurement(["a", "a", "b"], byWbs)!;
  assert.equal(result.expectedDeliveryDate, "2026-11-28");
  assert.equal(result.latestReceiptDate, "2026-11-20");
  assert.deepEqual(result.pendingLines!.map((row) => row.unit), ["m2", "bolsa"]);
  assert.equal(result.pendingLines!.length, 2);
});

test("missing promised dates do not hide pending quantities or invent readiness", () => {
  const result = mergeScheduleProcurement(["a"], new Map([["a", {
    expectedDeliveryDate: null, latestReceiptDate: null, pendingLines: [{ ...line, expectedDeliveryDate: null }],
  }]]))!;
  assert.equal(result.expectedDeliveryDate, null);
  assert.equal(result.pendingLines!.length, 1);
  assert.equal(result.deliveryAfterSiblingStart, false);
  assert.equal(mergeScheduleProcurement(["a"], new Map()), null);
});

test("date-only access and inconsistent sources never become a verified empty pending list", () => {
  const datesOnly = mergeScheduleProcurement(["a"], new Map([["a", {
    expectedDeliveryDate: "2026-11-30", latestReceiptDate: null, pendingLines: null,
  }]]))!;
  assert.equal(datesOnly.pendingLines, null);
  const partial = mergeScheduleProcurement(["a"], new Map([["a", {
    expectedDeliveryDate: null, latestReceiptDate: null, pendingLines: [], incompleteSources: true,
  }]]))!;
  assert.equal(partial.incompleteSources, true);
  assert.deepEqual(partial.pendingLines, []);
});
