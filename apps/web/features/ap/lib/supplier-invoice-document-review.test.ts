import assert from "node:assert/strict";
import { test } from "node:test";
import { getSupplierInvoiceDocumentReview, supplierInvoiceDocumentFileError } from "./supplier-invoice-document-review";

const complete = {
  supplierContactId: "supplier", invoiceLetter: "A", requireLetter: true,
  issueDate: "2026-11-19", dueDate: "2026-12-19", pricesIncludeTax: false,
  iibbPerceptionRate: "0", requireWbs: false,
  lines: [{ description: "Material", quantity: "1", unitPrice: "100.0000", taxRate: "0", discountPct: "0", wbsNodeId: null as string | null, costType: null as string | null }],
};

test("explicit zero taxes/discounts complete review; unknown fields do not", () => {
  assert.deepEqual(getSupplierInvoiceDocumentReview(complete), { pending: [], amountsPending: false });
  for (const key of ["quantity", "unitPrice", "taxRate", "discountPct"] as const) {
    const result = getSupplierInvoiceDocumentReview({ ...complete, lines: [{ ...complete.lines[0]!, [key]: "" }] });
    assert.equal(result.amountsPending, true);
    assert.ok(result.pending.some((item) => item.target === "invoice-lines"));
  }
  assert.equal(getSupplierInvoiceDocumentReview({ ...complete, iibbPerceptionRate: "" }).amountsPending, true);
  assert.equal(getSupplierInvoiceDocumentReview({ ...complete, pricesIncludeTax: null }).amountsPending, true);
});

test("unread dates/payee/letter block confirmation without hiding complete amounts", () => {
  const result = getSupplierInvoiceDocumentReview({ ...complete, supplierContactId: "", issueDate: "", dueDate: "", invoiceLetter: null });
  assert.deepEqual(result.pending.map((item) => item.target), ["invoice-payee", "invoiceLetter", "issueDate", "dueDate"]);
  assert.equal(result.amountsPending, false);
});

test("project review requires explicit imputation; corporate has no hidden EDT requirement", () => {
  assert.equal(getSupplierInvoiceDocumentReview(complete).pending.length, 0);
  assert.equal(getSupplierInvoiceDocumentReview({ ...complete, requireWbs: true }).pending.length, 1);
  assert.equal(getSupplierInvoiceDocumentReview({ ...complete, requireWbs: true, lines: [{ ...complete.lines[0]!, wbsNodeId: "wbs", costType: "MATERIAL" }] }).pending.length, 0);
});

test("letter changes cannot silently discard IVA when the user confirms a partial prefill", () => {
  for (const invoiceLetter of ["C", "E"]) {
    assert.equal(getSupplierInvoiceDocumentReview({ ...complete, invoiceLetter }).pending.length, 0);
    assert.ok(getSupplierInvoiceDocumentReview({ ...complete, invoiceLetter, pricesIncludeTax: true }).pending.some((item) => item.target === "invoiceLetter"));
    assert.ok(getSupplierInvoiceDocumentReview({ ...complete, invoiceLetter, lines: [{ ...complete.lines[0]!, taxRate: "21" }] }).pending.some((item) => item.target === "invoiceLetter"));
  }
});

test("file hints accept the exact limit and explain unsupported mobile formats without conversion", () => {
  assert.equal(supplierInvoiceDocumentFileError(null), null);
  assert.equal(supplierInvoiceDocumentFileError({ type: "application/pdf", size: 3 * 1024 * 1024 }), null);
  for (const size of [0, 3 * 1024 * 1024 + 1]) assert.match(supplierInvoiceDocumentFileError({ type: "image/jpeg", size })!, /3 MiB/);
  assert.match(supplierInvoiceDocumentFileError({ type: "image/heic", size: 1000 })!, /Carga manual/);
});
