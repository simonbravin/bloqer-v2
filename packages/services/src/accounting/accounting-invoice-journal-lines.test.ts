import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Prisma } from "@bloqer/database";
import {
  buildSalesInvoiceJournalInput,
  buildSupplierInvoiceJournalInput,
} from "./accounting-invoice-journal-lines";

describe("buildSalesInvoiceJournalInput", () => {
  it("splits IVA when tax > 0 and IVA account present", () => {
    const { input, usedIvaSplit } = buildSalesInvoiceJournalInput({
      companyId: "c1",
      projectId: "p1",
      entryDate: "2026-08-10",
      description: "test",
      reference: "1",
      currency: "ARS",
      subtotal: new Prisma.Decimal("1000"),
      taxAmount: new Prisma.Decimal("210"),
      totalAmount: new Prisma.Decimal("1210"),
      clientsAccountId: "acc-clients",
      incomeAccountId: "acc-income",
      ivaDebitAccountId: "acc-iva-debit",
      sourceId: "inv1",
    });
    assert.equal(usedIvaSplit, true);
    assert.equal(input.lines.length, 3);
    assert.equal(input.lines[0]?.debit, "1210.00");
    assert.equal(input.lines[1]?.credit, "1000.00");
    assert.equal(input.lines[2]?.credit, "210.00");
  });

  it("falls back to two lines when tax is zero", () => {
    const { input, usedIvaSplit } = buildSalesInvoiceJournalInput({
      companyId: "c1",
      projectId: null,
      entryDate: "2026-08-10",
      description: "test",
      reference: "1",
      currency: "ARS",
      subtotal: new Prisma.Decimal("1000"),
      taxAmount: new Prisma.Decimal("0"),
      totalAmount: new Prisma.Decimal("1000"),
      clientsAccountId: "acc-clients",
      incomeAccountId: "acc-income",
      ivaDebitAccountId: "acc-iva-debit",
      sourceId: "inv1",
    });
    assert.equal(usedIvaSplit, false);
    assert.equal(input.lines.length, 2);
  });
});

describe("buildSupplierInvoiceJournalInput", () => {
  it("splits IVA crédito when tax > 0", () => {
    const { input, usedIvaSplit } = buildSupplierInvoiceJournalInput({
      companyId: "c1",
      projectId: "p1",
      entryDate: "2026-08-10",
      description: "test",
      reference: "1",
      currency: "ARS",
      subtotal: new Prisma.Decimal("1000"),
      taxAmount: new Prisma.Decimal("105"),
      totalAmount: new Prisma.Decimal("1105"),
      expenseAccountId: "acc-exp",
      suppliersAccountId: "acc-sup",
      ivaCreditAccountId: "acc-iva-credit",
      sourceId: "inv1",
    });
    assert.equal(usedIvaSplit, true);
    assert.equal(input.lines.length, 3);
    assert.equal(input.lines[0]?.debit, "1000.00");
    assert.equal(input.lines[1]?.debit, "105.00");
    assert.equal(input.lines[2]?.credit, "1105.00");
  });
});
