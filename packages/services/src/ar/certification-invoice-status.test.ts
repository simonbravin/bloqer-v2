import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Prisma } from "@bloqer/database";
import { deriveCertificationInvoiceStatus } from "./certification-invoice-status";

type Facts = Parameters<typeof deriveCertificationInvoiceStatus>[0];
const dec = (value: string) => new Prisma.Decimal(value);
function invoice(id = "invoice", total = "121"): Facts {
  return {
    id,
    tenantId: "tenant",
    companyId: "company",
    projectId: "project",
    clientContactId: "client",
    number: 1,
    status: "ISSUED",
    currency: "ARS",
    totalAmount: dec(total),
    documentKind: "INVOICE",
    referencedSalesInvoiceId: null,
    company: { tenantId: "tenant" },
    clientContact: { tenantId: "tenant" },
    receivable: {
      id: "r-" + id,
      tenantId: "tenant",
      companyId: "company",
      projectId: "project",
      clientContactId: "client",
      salesInvoiceId: id,
      currency: "ARS",
      originalAmount: dec(total),
      paidAmount: dec("0"),
      creditedAmount: dec("0"),
      status: "OPEN",
    },
    creditDebitNotes: [],
  };
}
function paid(original = invoice()) {
  original.receivable!.paidAmount = original.totalAmount;
  original.receivable!.status = "PAID";
  return original;
}
function debit(original: Facts, settled = false) {
  const note = invoice("debit", "10");
  note.documentKind = "DEBIT_NOTE";
  note.referencedSalesInvoiceId = original.id;
  if (settled) paid(note);
  original.creditDebitNotes.push(note);
  return note;
}

describe("AG-08 certification invoice settlement facts", () => {
  it("keeps an open original collectible and does not claim completion", () => {
    assert.deepEqual(deriveCertificationInvoiceStatus(invoice()), {
      isSettled: false,
      collectionStatusAvailable: true,
      receivableId: "r-invoice",
      canCollect: true,
    });
  });
  it("requires both paid status and canonical zero balance", () => {
    assert.equal(deriveCertificationInvoiceStatus(paid()).isSettled, true);
    const inconsistent = invoice();
    inconsistent.receivable!.status = "PAID";
    assert.equal(deriveCertificationInvoiceStatus(inconsistent).collectionStatusAvailable, false);
  });
  it("accepts a credit-note settlement without inventing treasury collection", () => {
    const doc = invoice();
    doc.receivable!.creditedAmount = dec("121");
    doc.receivable!.status = "PAID";
    assert.deepEqual(deriveCertificationInvoiceStatus(doc), {
      isSettled: true,
      collectionStatusAvailable: true,
      receivableId: null,
      canCollect: false,
    });
  });
  it("keeps partial credit as an outstanding obligation", () => {
    const doc = invoice();
    doc.receivable!.creditedAmount = dec("10");
    doc.receivable!.status = "PARTIAL";
    assert.equal(deriveCertificationInvoiceStatus(doc).isSettled, false);
    assert.equal(deriveCertificationInvoiceStatus(doc).canCollect, true);
  });
  for (const reason of [
    "missing",
    "cancelled",
    "foreign-company",
    "foreign-client",
    "foreign-invoice",
    "currency",
    "total",
    "overpaid",
  ] as const) {
    it("does not turn an unavailable obligation into settled: " + reason, () => {
      const doc = paid();
      if (reason === "missing") doc.receivable = null;
      else if (reason === "cancelled") doc.receivable!.status = "CANCELLED";
      else if (reason === "foreign-company") doc.receivable!.companyId = "other";
      else if (reason === "foreign-client") doc.receivable!.clientContactId = "other";
      else if (reason === "foreign-invoice") doc.receivable!.salesInvoiceId = "other";
      else if (reason === "currency") doc.receivable!.currency = "USD";
      else if (reason === "total") doc.receivable!.originalAmount = dec("122");
      else doc.receivable!.paidAmount = dec("122");
      assert.deepEqual(deriveCertificationInvoiceStatus(doc), {
        isSettled: false,
        collectionStatusAvailable: false,
        receivableId: null,
        canCollect: false,
      });
    });
  }
  it("preserves sub-cent normalization while a real cent remains outstanding", () => {
    const dust = paid();
    dust.receivable!.paidAmount = dec("120.9999");
    assert.equal(deriveCertificationInvoiceStatus(dust).isSettled, true);
    dust.receivable!.paidAmount = dec("120.99");
    assert.equal(deriveCertificationInvoiceStatus(dust).collectionStatusAvailable, false);
  });
  it("keeps linked issued debit notes in the outstanding state without changing the original collection target", () => {
    const doc = paid();
    debit(doc);
    assert.deepEqual(deriveCertificationInvoiceStatus(doc), {
      isSettled: false,
      collectionStatusAvailable: true,
      receivableId: null,
      canCollect: false,
    });
    paid(doc.creditDebitNotes[0] as Facts);
    assert.equal(deriveCertificationInvoiceStatus(doc).isSettled, true);
  });
  it("marks a missing or contradictory debit obligation unavailable", () => {
    const doc = paid(),
      note = debit(doc);
    note.receivable = null;
    assert.equal(deriveCertificationInvoiceStatus(doc).collectionStatusAvailable, false);
    note.receivable = invoice("debit", "10").receivable;
    note.companyId = "other";
    assert.equal(deriveCertificationInvoiceStatus(doc).collectionStatusAvailable, false);
  });
  it("keeps drafts as a billing step with no collection or settled claim", () => {
    const doc = invoice();
    doc.status = "DRAFT";
    doc.receivable = null;
    assert.deepEqual(deriveCertificationInvoiceStatus(doc), {
      isSettled: false,
      collectionStatusAvailable: true,
      receivableId: null,
      canCollect: false,
    });
  });
});
