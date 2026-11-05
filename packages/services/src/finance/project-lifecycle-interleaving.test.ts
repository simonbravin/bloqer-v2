import assert from "node:assert/strict";
import { describe, it, type TestContext } from "node:test";

import { prisma, Prisma, type ProjectStatus } from "@bloqer/database";
import {
  createInvoiceFromCertificationSchema, createSalesInvoiceSchema, createSupplierInvoiceSchema,
  registerApExpenseSchema, registerArSaleSchema,
} from "@bloqer/validators";
import { clearProjectAccessModeCache } from "../security/access";
import { ServiceError, type ServiceContext } from "../types";
import { createInvoiceFromCertification, createSalesInvoice, issueSalesInvoice, updateSalesInvoice, cancelSalesInvoice } from "../ar/sales-invoice.service";
import { registerArSale } from "../ar/register-ar-sale.service";
import { createSalesCreditNoteFromInvoice, createSalesDebitNoteFromInvoice, issueSalesCreditNote, issueSalesDebitNote, cancelSalesCreditNote } from "../ar/credit-debit-note.service";
import { createSupplierInvoice, issueSupplierInvoice, updateSupplierInvoice, cancelSupplierInvoice } from "../ap/supplier-invoice.service";
import { createSupplierInvoiceDraftFromPurchaseOrder } from "../ap/supplier-invoice-from-po.service";
import { registerApExpense } from "../ap/register-ap-expense.service";
import { createSupplierCreditNoteFromInvoice, createSupplierDebitNoteFromInvoice, issueSupplierCreditNote, issueSupplierDebitNote, cancelSupplierCreditNote } from "../ap/credit-debit-note.service";
import { createPayment, cancelPayment } from "../ap/payment.service";
import { createCollection, cancelCollection } from "../treasury/collection.service";

const tenantId = "00000000-0000-0000-0000-000000000001";
const projectId = "00000000-0000-0000-0000-000000000002";
const companyId = "00000000-0000-0000-0000-000000000003";
const contactId = "00000000-0000-0000-0000-000000000004";
const wbsId = "00000000-0000-0000-0000-000000000005";
const documentId = "00000000-0000-0000-0000-000000000006";
const idempotencyKey = "00000000-0000-4000-8000-000000000007";
const budgetId = "00000000-0000-0000-0000-000000000008";
const ctx: ServiceContext = { tenantId, companyId, actorUserId: "actor", roles: ["OWNER"] };
const date = "2026-11-03";
const line = { description: "Synthetic line", quantity: "1", unitPrice: "10", wbsNodeId: wbsId };
const saleInput = createSalesInvoiceSchema.parse({ projectId, clientContactId: contactId, issueDate: date, dueDate: date, invoiceLetter: "C", lines: [line] });
const expenseInput = createSupplierInvoiceSchema.parse({ projectId, supplierContactId: contactId, issueDate: date, dueDate: date, invoiceLetter: "C", lines: [line] });
const checkpoint = new Error("Reached document work after the project lock");

const originals = new WeakMap<TestContext, Map<object, Set<string>>>();
function stub(t: TestContext, target: object, method: string, replacement: unknown) {
  const delegate = target as Record<string, unknown>;
  let objects = originals.get(t);
  if (!objects) { objects = new Map(); originals.set(t, objects); }
  let methods = objects.get(target);
  if (!methods) { methods = new Set(); objects.set(target, methods); }
  if (!methods.has(method)) {
    const original = delegate[method];
    t.after(() => { delegate[method] = original; });
    methods.add(method);
  }
  delegate[method] = replacement;
}

function setup(t: TestContext, lockedStatus: ProjectStatus = "CANCELLED") {
  clearProjectAccessModeCache();
  t.after(clearProjectAccessModeCache);
  const state = { lockedStatus, invoiceStatus: "DRAFT", transactions: 0, locks: [] as string[], projectChecked: false };
  const project = () => ({ id: projectId, tenantId, companyId, status: "ACTIVE", country: "AR", clientContactId: contactId });
  const obligation = { id: documentId, tenantId, companyId, projectId, status: "OPEN", originalAmount: new Prisma.Decimal(10), paidAmount: new Prisma.Decimal(0), creditedAmount: new Prisma.Decimal(0) };
  const invoice = () => ({
    id: documentId, tenantId, companyId, projectId, status: state.invoiceStatus, documentKind: "INVOICE", number: 1,
    clientContactId: contactId, supplierContactId: contactId, invoiceLetter: "C", currency: "ARS", fxRate: new Prisma.Decimal(1),
    totalAmount: new Prisma.Decimal(10), taxAmount: new Prisma.Decimal(0), dueDate: new Date(date),
    receivable: obligation, payable: obligation, lines: [], notes: null, internalNotes: null, purchaseOrderId: null,
  });
  stub(t, prisma.tenantModuleSetting, "findMany", async () => []);
  stub(t, prisma.tenant, "findUnique", async () => ({ projectAccessMode: "TENANT_WIDE" }));
  stub(t, prisma.project, "findUnique", async () => project());
  stub(t, prisma.company, "findMany", async () => [{ id: companyId }]);
  stub(t, prisma.company, "findUnique", async () => ({ id: companyId, country: "AR" }));
  stub(t, prisma.company, "findFirst", async () => ({ id: companyId }));
  stub(t, prisma.companyProcurementSettings, "findUnique", async () => null);
  stub(t, prisma.contact, "findUnique", async () => ({ id: contactId, tenantId, status: "ACTIVE", country: "AR" }));
  stub(t, prisma.contactRole, "findUnique", async () => ({ tenantId, status: "ACTIVE" }));
  stub(t, prisma.contactRole, "findFirst", async () => ({ tenantId, status: "ACTIVE" }));
  stub(t, prisma.wbsNode, "findFirst", async () => ({ id: wbsId, type: "ITEM", budget: { tenantId, projectId, status: "APPROVED" } }));
  stub(t, prisma.wbsNode, "findMany", async () => []);
  for (const model of [prisma.salesInvoice, prisma.supplierInvoice]) {
    stub(t, model, "findUnique", async () => invoice());
    stub(t, model, "aggregate", async () => ({ _max: { number: 1 } }));
    stub(t, model, "findFirst", async () => null);
  }
  for (const model of [prisma.payable, prisma.receivable]) stub(t, model, "findUnique", async () => obligation);
  for (const model of [prisma.payment, prisma.collection]) {
    stub(t, model, "findFirst", async () => null);
    stub(t, model, "findUnique", async () => ({ tenantId, companyId, projectId, status: "CONFIRMED", paymentDate: new Date(date), collectionDate: new Date(date) }));
  }
  stub(t, prisma.period, "findFirst", async () => null);
  stub(t, prisma.journalEntry, "findFirst", async () => null);
  stub(t, prisma.accountMovement, "findFirst", async () => null);
  stub(t, prisma.certification, "findUnique", async () => ({
    id: documentId, tenantId, companyId, projectId, budgetId, status: "APPROVED",
    updatedAt: new Date(date), totalAmount: new Prisma.Decimal(10),
    company: { id: companyId, tenantId },
    project: { ...project(), company: { id: companyId, tenantId } },
    budget: { id: budgetId, tenantId, companyId, projectId, currency: "ARS", status: "APPROVED", company: { id: companyId, tenantId } },
    lines: [{
      id: "cert-line", certificationId: documentId, wbsNodeId: wbsId,
      currentQty: new Prisma.Decimal(1), unitSalePriceSnapshot: new Prisma.Decimal(10), periodAmount: new Prisma.Decimal(10),
      wbsNode: { id: wbsId, budgetId, type: "ITEM", code: "1", name: "Synthetic line", costItem: { budgetId, wbsNodeId: wbsId } },
    }],
  }));

  const reachDocument = () => {
    assert.equal(state.projectChecked, true, "Financial work must follow the locked project recheck");
    throw checkpoint;
  };
  const tx = {
    $executeRaw: async () => reachDocument(),
    $queryRaw: async (parts: TemplateStringsArray) => {
      const sql = parts.join("?");
      state.locks.push(sql);
      if (state.locks.length > 1) return reachDocument();
      assert.match(sql, /FROM projects.*FOR NO KEY UPDATE/);
      return [{ id: projectId }];
    },
    project: {
      findFirst: async (args: { where: { id: string; tenantId: string } }) => {
        assert.deepEqual(args.where, { id: projectId, tenantId });
        state.projectChecked = true;
        return { ...project(), status: state.lockedStatus };
      },
      findUnique: async () => project(),
    },
  } as Record<string, unknown>;
  for (const model of ["salesInvoice", "supplierInvoice", "purchaseOrder", "certification", "receivable", "payable", "payment", "collection"]) {
    tx[model] = new Proxy({}, { get: () => reachDocument });
  }
  stub(t, prisma, "$transaction", async (operation: (transaction: unknown) => Promise<unknown>) => {
    state.transactions += 1;
    return operation(tx);
  });
  return { state, tx };
}

type Operation = { name: string; run: () => Promise<unknown>; issuedParent?: boolean };
const operations: Operation[] = [
  { name: "AR draft create", run: () => createSalesInvoice(saleInput, ctx) },
  { name: "AR draft edit", run: () => updateSalesInvoice(documentId, { notes: "Synthetic" }, ctx) },
  { name: "AR issue", run: () => issueSalesInvoice(documentId, ctx) },
  { name: "certification invoice", run: () => createInvoiceFromCertification(createInvoiceFromCertificationSchema.parse({ certificationId: documentId, issueDate: date, dueDate: date, invoiceLetter: "C" }), ctx) },
  { name: "AR quick register", run: () => registerArSale(registerArSaleSchema.parse({ ...saleInput, idempotencyKey }), ctx) },
  { name: "AP draft create", run: () => createSupplierInvoice(expenseInput, ctx) },
  { name: "AP draft edit", run: () => updateSupplierInvoice(documentId, { notes: "Synthetic" }, ctx) },
  { name: "AP issue", run: () => issueSupplierInvoice(documentId, ctx) },
  { name: "PO invoice", run: () => createSupplierInvoiceDraftFromPurchaseOrder({ projectId, purchaseOrderId: documentId, basis: "received" }, ctx) },
  { name: "AP quick register", run: () => registerApExpense(registerApExpenseSchema.parse({ ...expenseInput, idempotencyKey }), ctx) },
  { name: "payment", run: () => createPayment({ payableId: documentId, accountId: companyId, paymentDate: date, amount: "10", idempotencyKey, reference: null }, ctx) },
  { name: "collection", run: () => createCollection({ receivableId: documentId, accountId: companyId, collectionDate: date, amount: "10", idempotencyKey, reference: null }, ctx) },
  { name: "AR credit draft", issuedParent: true, run: () => createSalesCreditNoteFromInvoice({ parentSalesInvoiceId: documentId }, ctx) },
  { name: "AR debit draft", issuedParent: true, run: () => createSalesDebitNoteFromInvoice({ parentSalesInvoiceId: documentId }, ctx) },
  { name: "AR credit issue", run: () => issueSalesCreditNote(documentId, ctx) },
  { name: "AR debit issue", run: () => issueSalesDebitNote(documentId, ctx) },
  { name: "AR credit cancellation", run: () => cancelSalesCreditNote(documentId, ctx) },
  { name: "AP credit draft", issuedParent: true, run: () => createSupplierCreditNoteFromInvoice({ parentSupplierInvoiceId: documentId }, ctx) },
  { name: "AP debit draft", issuedParent: true, run: () => createSupplierDebitNoteFromInvoice({ parentSupplierInvoiceId: documentId }, ctx) },
  { name: "AP credit issue", run: () => issueSupplierCreditNote(documentId, ctx) },
  { name: "AP debit issue", run: () => issueSupplierDebitNote(documentId, ctx) },
  { name: "AP credit cancellation", run: () => cancelSupplierCreditNote(documentId, ctx) },
];

describe("AG-03 financial mutations serialize with the project lifecycle (no database)", { concurrency: false }, () => {
  for (const operation of operations) {
    it(`${operation.name} rejects a cancellation committed after its ACTIVE preflight`, async (t) => {
      const { state } = setup(t);
      if (operation.issuedParent) state.invoiceStatus = "ISSUED";
      await assert.rejects(operation.run, (error: unknown) => error instanceof ServiceError && error.code === "CONFLICT" && error.message.includes("cancelada"));
      assert.equal(state.transactions, 1);
      assert.equal(state.projectChecked, true);
      assert.equal(state.locks.length, 1);
    });
    it(`${operation.name} acquires Project before financial or document locks`, async (t) => {
      const { state } = setup(t, "ACTIVE");
      if (operation.issuedParent) state.invoiceStatus = "ISSUED";
      await assert.rejects(operation.run, (error: unknown) => error === checkpoint);
      assert.equal(state.projectChecked, true);
      assert.match(state.locks[0] ?? "", /FROM projects.*FOR NO KEY UPDATE/);
    });
  }

  for (const [name, run] of [
    ["AR invoice cancellation", () => cancelSalesInvoice(documentId, ctx)],
    ["AP invoice cancellation", () => cancelSupplierInvoice(documentId, ctx)],
    ["payment cancellation", () => cancelPayment(documentId, ctx)],
    ["collection cancellation", () => cancelCollection(documentId, ctx)],
  ] as const) {
    it(`${name} locks Project while preserving its existing status-neutral reversal rule`, async (t) => {
      const { state } = setup(t, "CANCELLED");
      await assert.rejects(run, (error: unknown) => error === checkpoint);
      assert.equal(state.projectChecked, true);
      assert.match(state.locks[0] ?? "", /FROM projects.*FOR NO KEY UPDATE/);
    });
  }

  it("an inherited AP transaction repeats the Project lock before writing its invoice", async (t) => {
    const { state, tx } = setup(t);
    await assert.rejects(() => createSupplierInvoice(expenseInput, ctx, { tx: tx as Prisma.TransactionClient }),
      (error: unknown) => error instanceof ServiceError && error.code === "CONFLICT" && error.message.includes("cancelada"));
    assert.equal(state.transactions, 0);
    assert.equal(state.projectChecked, true);
  });
});
