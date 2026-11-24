import assert from "node:assert/strict";
import test from "node:test";
import { buildSupplierDeliveryEvidence, type SupplierDeliverySourceOrder } from "./supplier-delivery-evidence";

const source: SupplierDeliverySourceOrder = {
  id: "order-a", number: 1, supplierContactId: "supplier-a", supplierName: "Proveedor A",
  status: "CONFIRMED", issueDate: new Date("2026-10-01"), expectedDeliveryDate: null, receiptDates: [],
};

test("shows missing dates and receipts without assigning a delivery score", () => {
  const [row] = buildSupplierDeliveryEvidence([source]);
  assert.equal(row!.withExpectedDateCount, 0);
  assert.equal(row!.withReceiptCount, 0);
  assert.equal(row!.orders[0]!.expectedDeliveryDate, null);
  assert.equal(row!.orders[0]!.lastReceiptDate, null);
  assert.equal(row!.confirmedCount, 1);
});

test("counts orders, not partial receipt events, and keeps evidence after the PO issue period", () => {
  const [row] = buildSupplierDeliveryEvidence([{ ...source, status: "PARTIALLY_RECEIVED",
    expectedDeliveryDate: new Date("2026-10-20"), receiptDates: [new Date("2026-12-03"), new Date("2026-11-01")] }]);
  assert.equal(row!.orderCount, 1);
  assert.equal(row!.partiallyReceivedCount, 1);
  assert.equal(row!.receivedCount, 0);
  assert.equal(row!.withExpectedDateCount, 1);
  assert.equal(row!.withReceiptCount, 1);
  assert.equal(row!.orders[0]!.lastReceiptDate, "2026-12-03");
});

test("retains the recorded received status even when historical receipt evidence is absent", () => {
  const [row] = buildSupplierDeliveryEvidence([{ ...source, status: "RECEIVED" }]);
  assert.equal(row!.receivedCount, 1);
  assert.equal(row!.withReceiptCount, 0);
  assert.equal(row!.orders[0]!.lastReceiptDate, null);
});

test("deduplicates orders, excludes drafts and cancelled orders, and separates suppliers", () => {
  const rows = buildSupplierDeliveryEvidence([source, source,
    { ...source, id: "draft", status: "DRAFT" }, { ...source, id: "cancelled", status: "CANCELLED" },
    { ...source, id: "other", supplierContactId: "supplier-b", supplierName: "Proveedor B" },
  ]);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(row => row.orderCount), [1, 1]);
  assert.equal(rows[0]!.orders[0]!.id, "order-a");
  assert.deepEqual(buildSupplierDeliveryEvidence([]), []);
});
