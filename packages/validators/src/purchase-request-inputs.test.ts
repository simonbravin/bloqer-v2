import assert from "node:assert/strict";
import { test } from "node:test";

import { createProcurementQuoteSchema, updateProcurementQuoteSchema, returnPurchaseRequestSchema } from "./purchase-request";

const input = {
  purchaseRequestId: "11111111-1111-4111-8111-111111111111",
  supplierContactId: "22222222-2222-4222-8222-222222222222",
  currency: "USD", fxRate: "1234.5678904",
  lines: [{ purchaseRequestLineId: "33333333-3333-4333-8333-333333333333", unitPrice: "10", taxRate: "21" }],
};

test("quotes validate real validity dates and canonical positive six-decimal FX", () => {
  const valid = createProcurementQuoteSchema.parse({ ...input, validUntil: "2024-02-29" });
  assert.equal(valid.fxRate, "1234.567890");
  for (const validUntil of ["2026-02-29", "2026-04-31", "not-a-date"]) {
    assert.equal(createProcurementQuoteSchema.safeParse({ ...input, validUntil }).success, false);
  }
  for (const fxRate of ["0", "-1", "0.0000001", "NaN"]) {
    assert.equal(createProcurementQuoteSchema.safeParse({ ...input, fxRate }).success, false);
  }
});

test("quote taxes reject negative/invalid values and edit omission preserves currency", () => {
  for (const taxRate of ["-1", "NaN"]) {
    assert.equal(createProcurementQuoteSchema.safeParse({ ...input, lines: [{ ...input.lines[0]!, taxRate }] }).success, false);
  }
  const edited = updateProcurementQuoteSchema.parse({ lines: input.lines });
  assert.equal(edited.currency, undefined);
  assert.equal(edited.fxRate, undefined);
});

test("return reasons cannot consist only of whitespace", () => {
  assert.equal(returnPurchaseRequestSchema.safeParse({ reason: "   " }).success, false);
  assert.deepEqual(returnPurchaseRequestSchema.parse({ reason: "  Corregir cantidades  " }), { reason: "Corregir cantidades" });
});
