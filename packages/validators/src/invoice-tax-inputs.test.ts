import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createSalesInvoiceSchema, updateSalesInvoiceSchema, registerArSaleSchema, registerArIncomeSchema, createSalesNoteSchema, createInvoiceFromCertificationSchema } from "./sales-invoice";
import { createSupplierInvoiceSchema, updateSupplierInvoiceSchema, registerApExpenseSchema, createSupplierFiscalNoteSchema } from "./ap";

const id = "10000000-0000-4000-8000-000000000001";
const line = { description: "Synthetic tax input", quantity: "1", unitPrice: "100", taxRate: "0", discountPct: "0", sortOrder: 0, wbsNodeId: id };
const base = { projectId: id, clientContactId: id, supplierContactId: id, parentSalesInvoiceId: id, parentSupplierInvoiceId: id, issueDate: "2026-11-05", dueDate: "2026-11-05", currency: "ARS", invoiceLetter: "A", iibbPerceptionRate: "0", externalInvoiceRef: null, idempotencyKey: id, lines: [line] };

describe("D-133 AR/AP tax inputs", () => {
  for (const [name, schema, header] of [
    ["AR draft", createSalesInvoiceSchema, true], ["AR edit", updateSalesInvoiceSchema, true],
    ["AR sale", registerArSaleSchema, true], ["AR income", registerArIncomeSchema, true],
    ["AR note", createSalesNoteSchema, false], ["AP draft", createSupplierInvoiceSchema, true],
    ["AP edit", updateSupplierInvoiceSchema, true], ["AP expense", registerApExpenseSchema, true],
    ["AP note", createSupplierFiscalNoteSchema, false],
  ] as const) {
    it(`${name} accepts zero and rejects a negative line tax`, () => {
      assert.equal(schema.safeParse(base).success, true);
      assert.equal(schema.safeParse({ ...base, lines: [{ ...line, taxRate: "-10" }] }).success, false);
      assert.equal(schema.safeParse({ ...base, lines: [{ ...line, taxRate: "150" }] }).success, true);
      if (header) assert.equal(schema.safeParse({ ...base, iibbPerceptionRate: "-3" }).success, false);
    });
  }
  it("also rejects negative tax when billing a certification", () => {
    const input = { certificationId: id, issueDate: "2026-11-05", dueDate: "2026-11-05", taxRate: "0", iibbPerceptionRate: "0" };
    assert.equal(createInvoiceFromCertificationSchema.safeParse(input).success, true);
    assert.equal(createInvoiceFromCertificationSchema.safeParse({ ...input, taxRate: "-1" }).success, false);
    assert.equal(createInvoiceFromCertificationSchema.safeParse({ ...input, iibbPerceptionRate: "-1" }).success, false);
  });
});
