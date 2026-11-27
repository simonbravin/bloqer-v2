import assert from "node:assert/strict";
import { test } from "node:test";
import type { SupplierInvoiceDocumentPreview } from "@bloqer/ai";
import { mapSupplierInvoiceDocumentPrefill } from "./supplier-invoice-document-prefill";

const preview: SupplierInvoiceDocumentPreview = {
  documentKind: "INVOICE", currency: "ARS", supplierName: "Proveedor leído", supplierTaxId: "20123456789",
  fiscalReference: "0001-00000012", invoiceLetter: "A", issueDate: "2026-11-19", dueDate: null,
  pricesIncludeTax: false, iibbPerceptionRate: "0", iibbPerceptionAmount: "0", subtotal: "20", taxTotal: "4.20", total: "24.20",
  lines: [{ description: "Material", quantity: "2.0000", unitPrice: "10.0000", taxRate: "21", discountPercent: "0" }],
  warnings: [], reviewReasons: [], blockingReasons: [], canApply: true,
};

test("prefill retains decimal text, leaves missing due date blank and invents no master-data ids", () => {
  const value = mapSupplierInvoiceDocumentPrefill(preview)!;
  assert.equal(value.dueDate, "");
  assert.deepEqual(value.lines[0], {
    description: "Material", quantity: "2.0000", unitPrice: "10.0000", taxRate: "21", discountPct: "0",
    wbsNodeId: null, purchaseOrderLineId: null, costAnalysisLineId: null, costType: null,
  });
  assert.equal("supplierContactId" in value, false);
  assert.equal("number" in value, false);
  assert.equal("notes" in value, false);
});

test("unsupported type/currency or a blocked verdict never become an ordinary ARS invoice", () => {
  for (const patch of [
    { documentKind: "CREDIT_NOTE" as const }, { currency: "USD" }, { currency: null },
    { canApply: false }, { blockingReasons: ["Inconsistent amount"] }, { lines: [] },
  ]) assert.equal(mapSupplierInvoiceDocumentPrefill({ ...preview, ...patch }), null);
});

test("partial prefill keeps every missing financial input blank and preserves known text", () => {
  const result = mapSupplierInvoiceDocumentPrefill({ ...preview, issueDate: null, invoiceLetter: null,
    pricesIncludeTax: null, iibbPerceptionRate: null,
    lines: [{ ...preview.lines[0]!, description: null, quantity: null, taxRate: null, discountPercent: null }],
  })!;
  assert.equal(result.issueDate, "");
  assert.equal(result.invoiceLetter, null);
  assert.equal(result.pricesIncludeTax, null);
  assert.equal(result.iibbPerceptionRate, "");
  assert.deepEqual(result.lines[0], {
    description: "", quantity: "", unitPrice: "10.0000", taxRate: "", discountPct: "",
    wbsNodeId: null, purchaseOrderLineId: null, costAnalysisLineId: null, costType: null,
  });
});
