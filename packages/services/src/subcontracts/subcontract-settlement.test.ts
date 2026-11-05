import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Prisma } from "@bloqer/database";
import { deriveSubcontractSettlement } from "./subcontract-settlement";
const decimal = (value: string) => new Prisma.Decimal(value);
const source = {
  id: "cert",
  tenantId: "tenant",
  companyId: "company",
  projectId: "project",
  subcontractorContactId: "contact",
  currency: "ARS",
  invoiceId: "invoice",
};
const asOf = new Date("2026-11-05T00:00:00Z");
type Row = NonNullable<Parameters<typeof deriveSubcontractSettlement>[0]>;
function payable(
  options: { paid?: string; credited?: string; status?: string; due?: string } = {},
): Row {
  const paid = options.paid ?? "0",
    credited = options.credited ?? "0";
  return {
    id: "payable",
    tenantId: source.tenantId,
    companyId: source.companyId,
    projectId: source.projectId,
    supplierContactId: source.subcontractorContactId,
    supplierInvoiceId: source.invoiceId,
    currency: "ARS",
    originalAmount: decimal("100"),
    paidAmount: decimal(paid),
    creditedAmount: decimal(credited),
    status: options.status ?? "OPEN",
    dueDate: new Date(options.due ?? "2026-11-06"),
    supplierInvoice: {
      id: source.invoiceId,
      tenantId: source.tenantId,
      companyId: source.companyId,
      projectId: source.projectId,
      supplierContactId: source.subcontractorContactId,
      subcontractCertificationId: source.id,
      status: "ISSUED",
      documentKind: "INVOICE",
      currency: "ARS",
      totalAmount: decimal("100"),
      referencedSupplierInvoiceId: null,
      purchaseOrderId: null,
    },
    payments:
      paid === "0"
        ? []
        : [
            {
              id: "payment",
              tenantId: source.tenantId,
              companyId: source.companyId,
              projectId: source.projectId,
              supplierContactId: source.subcontractorContactId,
              supplierInvoiceId: source.invoiceId,
              payableId: "payable",
              currency: "ARS",
              amount: decimal(paid),
              status: "CONFIRMED",
              account: { tenantId: source.tenantId, companyId: null, currency: "ARS" },
            },
          ],
    creditApplications:
      credited === "0"
        ? []
        : [
            {
              id: "credit",
              tenantId: source.tenantId,
              companyId: source.companyId,
              payableId: "payable",
              status: "CONFIRMED",
              amount: decimal(credited),
              creditNoteSupplierInvoice: {
                tenantId: source.tenantId,
                companyId: source.companyId,
                projectId: source.projectId,
                supplierContactId: source.subcontractorContactId,
                documentKind: "CREDIT_NOTE",
                status: "ISSUED",
                currency: "ARS",
                referencedSupplierInvoiceId: source.invoiceId,
                totalAmount: decimal(credited),
              },
            },
          ],
  } as unknown as Row;
}
const derive = (row: Row | null) => deriveSubcontractSettlement(row, source, asOf);
type DebitNote = NonNullable<Parameters<typeof deriveSubcontractSettlement>[3]>[number];
function debitNote(
  options: { paid?: string; status?: string; due?: string; id?: string } = {},
): DebitNote {
  const row = payable(options),
    id = options.id ?? "debit-note";
  row.id = id + "-payable";
  row.originalAmount = decimal("10");
  row.supplierInvoiceId = id;
  row.supplierInvoice = {
    ...row.supplierInvoice,
    id,
    documentKind: "DEBIT_NOTE",
    totalAmount: decimal("10"),
    referencedSupplierInvoiceId: source.invoiceId,
    subcontractCertificationId: null,
  };
  for (const payment of row.payments) {
    payment.payableId = row.id;
    payment.supplierInvoiceId = id;
  }
  return { ...row.supplierInvoice, payable: row };
}

describe("AG08 D027 settlement from validated AP sources", () => {
  it("never calls a missing, cancelled or inconsistent payable settled", () => {
    assert.equal(derive(null).settlementStatus, null);
    assert.equal(derive(payable({ status: "CANCELLED" })).settlementStatus, null);
    assert.equal(derive(payable({ status: "PAID" })).settlementStatus, null);
    const row = payable({ paid: "100", status: "OPEN" });
    assert.equal(derive(row).settlementStatus, null);
  });
  it("shows an active future obligation without reductions as unsettled", () => {
    assert.deepEqual(derive(payable()), {
      settlementStatus: "UNSETTLED",
      settlementUnavailableReason: null,
    });
  });
  it("maps an actual partial payment to partially settled", () => {
    assert.equal(
      derive(payable({ paid: "20", status: "PARTIAL" })).settlementStatus,
      "PARTIALLY_SETTLED",
    );
  });
  it("maps partial and complete credit settlement without pretending there was cash", () => {
    assert.equal(
      derive(payable({ credited: "20", status: "PARTIAL" })).settlementStatus,
      "PARTIALLY_SETTLED",
    );
    const creditOnly = payable({ credited: "100", status: "PAID" });
    assert.equal(creditOnly.payments.length, 0);
    assert.equal(derive(creditOnly).settlementStatus, "SETTLED");
  });
  it("prioritizes overdue debt and does not treat a due-today obligation as overdue", () => {
    assert.equal(derive(payable({ paid: "20", due: "2026-11-04" })).settlementStatus, "OVERDUE");
    assert.equal(
      derive(payable({ paid: "20", due: "2026-11-05" })).settlementStatus,
      "PARTIALLY_SETTLED",
    );
  });
  it("requires reconciled active sources before showing a fully settled balance", () => {
    const row = payable({ paid: "100", status: "PAID" });
    assert.equal(derive(row).settlementStatus, "SETTLED");
    row.payments[0]!.status = "CANCELLED";
    assert.equal(derive(row).settlementStatus, null);
    const credits = payable({ credited: "100", status: "PAID" });
    credits.creditApplications[0]!.status = "CANCELLED";
    assert.equal(derive(credits).settlementStatus, null);
  });
  it("ignores cancelled rows instead of counting them again", () => {
    const row = payable({ paid: "100", status: "PAID" });
    row.payments.push({ ...row.payments[0]!, id: "cancelled", status: "CANCELLED" });
    assert.equal(derive(row).settlementStatus, "SETTLED");
  });
  it("rejects foreign payment, account or credit-note provenance without returning private labels", () => {
    for (const change of [
      (row: Row) => {
        row.payments[0]!.tenantId = "foreign";
      },
      (row: Row) => {
        row.payments[0]!.companyId = "foreign";
      },
      (row: Row) => {
        row.payments[0]!.account.tenantId = "foreign";
      },
      (row: Row) => {
        row.payments[0]!.supplierInvoiceId = "foreign";
      },
    ]) {
      const row = payable({ paid: "100", status: "PAID" });
      change(row);
      const result = derive(row);
      assert.equal(result.settlementStatus, null);
      assert.ok(!result.settlementUnavailableReason?.includes("foreign"));
    }
    const row = payable({ credited: "100", status: "PAID" });
    row.creditApplications[0]!.creditNoteSupplierInvoice.tenantId = "foreign";
    assert.equal(derive(row).settlementStatus, null);
    const wrongReference = payable({ credited: "100", status: "PAID" });
    wrongReference.creditApplications[0]!.creditNoteSupplierInvoice.referencedSupplierInvoiceId =
      "other-invoice";
    assert.equal(derive(wrongReference).settlementStatus, null);
    const wrongAmount = payable({ credited: "100", status: "PAID" });
    wrongAmount.creditApplications[0]!.creditNoteSupplierInvoice.totalAmount = decimal("20");
    assert.equal(derive(wrongAmount).settlementStatus, null);
  });
  it("keeps another currency unavailable and does not convert it by assumption", () => {
    const result = deriveSubcontractSettlement(payable(), { ...source, currency: "USD" }, asOf);
    assert.equal(result.settlementStatus, null);
    assert.match(result.settlementUnavailableReason!, /monedas/);
  });
  it("accepts shared/own-company accounts and rejects another company's historical payment account", () => {
    const row = payable({ paid: "100", status: "PAID" });
    assert.equal(derive(row).settlementStatus, "SETTLED");
    row.payments[0]!.account.companyId = source.companyId;
    assert.equal(derive(row).settlementStatus, "SETTLED");
    row.payments[0]!.account.companyId = "other-company";
    assert.equal(derive(row).settlementStatus, null);
    row.payments[0]!.account.companyId = null;
    assert.equal(derive(row).settlementStatus, "SETTLED");
  });
  it("rejects over-settlement and missing invoice amounts", () => {
    assert.equal(derive(payable({ paid: "101", status: "PAID" })).settlementStatus, null);
    const row = payable();
    row.supplierInvoice.totalAmount = decimal("200");
    assert.equal(derive(row).settlementStatus, null);
  });
  it("keeps settled original invoices partially settled while an issued debit note remains open", () => {
    const original = payable({ paid: "100", status: "PAID" });
    assert.equal(
      deriveSubcontractSettlement(original, source, asOf, [debitNote()]).settlementStatus,
      "PARTIALLY_SETTLED",
    );
    assert.equal(
      deriveSubcontractSettlement(payable(), source, asOf, [debitNote()]).settlementStatus,
      "UNSETTLED",
    );
  });
  it("prioritizes overdue balances across original and debit-note obligations", () => {
    const original = payable({ paid: "100", status: "PAID" });
    assert.equal(
      deriveSubcontractSettlement(original, source, asOf, [debitNote({ due: "2026-11-04" })])
        .settlementStatus,
      "OVERDUE",
    );
    assert.equal(
      deriveSubcontractSettlement(payable({ due: "2026-11-04" }), source, asOf, [
        debitNote({ paid: "10", status: "PAID" }),
      ]).settlementStatus,
      "OVERDUE",
    );
  });
  it("requires all debit notes' active sources to reconcile before showing no pending balance", () => {
    const original = payable({ paid: "100", status: "PAID" }),
      note = debitNote({ paid: "10", status: "PAID" });
    assert.equal(
      deriveSubcontractSettlement(original, source, asOf, [note]).settlementStatus,
      "SETTLED",
    );
    note.payable!.payments[0]!.status = "CANCELLED";
    assert.equal(
      deriveSubcontractSettlement(original, source, asOf, [note]).settlementStatus,
      null,
    );
  });
  it("makes missing/cancelled/inconsistent debit-note payables unavailable", () => {
    const original = payable({ paid: "100", status: "PAID" });
    for (const change of [
      (note: DebitNote) => {
        note.payable = null;
      },
      (note: DebitNote) => {
        note.payable!.status = "CANCELLED";
      },
      (note: DebitNote) => {
        note.payable!.paidAmount = decimal("10");
        note.payable!.status = "PAID";
      },
      (note: DebitNote) => {
        note.payable!.originalAmount = decimal("9");
      },
      (note: DebitNote) => {
        note.payable!.supplierInvoice.documentKind = "INVOICE";
      },
    ]) {
      const note = debitNote();
      change(note);
      assert.equal(
        deriveSubcontractSettlement(original, source, asOf, [note]).settlementStatus,
        null,
      );
    }
  });
  it("checks every debit-note root and currency before aggregating", () => {
    const original = payable({ paid: "100", status: "PAID" });
    for (const change of [
      (note: DebitNote) => {
        note.tenantId = "foreign";
      },
      (note: DebitNote) => {
        note.companyId = "foreign";
      },
      (note: DebitNote) => {
        note.projectId = "foreign";
      },
      (note: DebitNote) => {
        note.supplierContactId = "foreign";
      },
      (note: DebitNote) => {
        note.currency = "USD";
      },
      (note: DebitNote) => {
        note.referencedSupplierInvoiceId = "foreign";
      },
      (note: DebitNote) => {
        note.documentKind = "CREDIT_NOTE";
      },
      (note: DebitNote) => {
        note.subcontractCertificationId = source.id;
      },
      (note: DebitNote) => {
        note.purchaseOrderId = "foreign";
      },
    ]) {
      const note = debitNote();
      change(note);
      const result = deriveSubcontractSettlement(original, source, asOf, [note]);
      assert.equal(result.settlementStatus, null);
      assert.ok(!result.settlementUnavailableReason?.includes("foreign"));
    }
  });
  it("ignores draft/cancelled debit notes and handles multiple issued balances", () => {
    const original = payable({ paid: "100", status: "PAID" }),
      draft = debitNote(),
      cancelled = debitNote();
    draft.status = "DRAFT";
    draft.payable = null;
    cancelled.status = "CANCELLED";
    cancelled.payable = null;
    assert.equal(
      deriveSubcontractSettlement(original, source, asOf, [draft, cancelled]).settlementStatus,
      "SETTLED",
    );
    const settled = debitNote({ id: "settled-note", paid: "10", status: "PAID" }),
      partial = debitNote({ id: "partial-note", paid: "5", status: "PARTIAL" });
    assert.equal(
      deriveSubcontractSettlement(original, source, asOf, [settled, partial]).settlementStatus,
      "PARTIALLY_SETTLED",
    );
  });
});
