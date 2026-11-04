import assert from "node:assert/strict";
import { test } from "node:test";

import { createPurchaseOrderSchema, createPurchaseReceiptSchema, returnPurchaseOrderSchema } from "./procurement";

const id = "deeb2ea2-a3d3-4a18-b066-7940f6e8996a";
const order = { projectId: id, supplierContactId: id, issueDate: "2026-11-04", lines: [{ wbsNodeId: id, description: "Material", quantity: "1", unitPrice: "10" }] };

test("procurement rejects impossible calendar dates and accepts a real leap day", () => {
  for (const issueDate of ["2026-02-30", "2026-02-29", "2026-13-01"]) assert.equal(createPurchaseOrderSchema.safeParse({ ...order, issueDate }).success, false);
  assert.equal(createPurchaseOrderSchema.safeParse({ ...order, issueDate: "2028-02-29" }).success, true);
  assert.equal(createPurchaseReceiptSchema.safeParse({ purchaseOrderId: id, receiptDate: "2026-02-30", idempotencyKey: id, lines: [{ purchaseOrderLineId: id, quantityReceived: "1" }] }).success, false);
});

test("procurement preserves positive manual FX at six decimals and rejects rates rounded to zero", () => {
  const parsed = createPurchaseOrderSchema.parse({ ...order, currency: "USD", fxRate: "1234.5678904" });
  assert.equal(parsed.fxRate, "1234.567890");
  for (const fxRate of ["0", "-1", "0.00000001"]) assert.equal(createPurchaseOrderSchema.safeParse({ ...order, currency: "USD", fxRate }).success, false);
});

test("procurement rejects blank operational text after whitespace normalization", () => {
  assert.equal(createPurchaseOrderSchema.safeParse({ ...order, lines: [{ ...order.lines[0], description: "   " }] }).success, false);
  assert.equal(returnPurchaseOrderSchema.safeParse({ reason: "   " }).success, false);
});
