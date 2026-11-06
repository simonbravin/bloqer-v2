import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, it } from "node:test";
import { Prisma, prisma } from "@bloqer/database";
import { createPaymentSchema, createSupplierFiscalNoteSchema, registerApExpenseSchema } from "@bloqer/validators";
import { applyPaymentToPayable } from "./apply-payment-to-payable";
import { assertApReadRoot, assertApPayableMatchesInvoice, assertApInvoiceLineParents } from "./ap-integrity";
import { getCompanyPayableById } from "./payable.service";
import { createSupplierDebitNoteFromInvoice, createSupplierCreditNoteFromInvoice } from "./credit-debit-note.service";
import { cancelSupplierInvoice } from "./supplier-invoice.service";
import { ServiceError, type ServiceContext } from "../types";

const d = (value: string | number) => new Prisma.Decimal(value);
const ctx: ServiceContext = { actorUserId: randomUUID(), tenantId: randomUUID(), companyId: randomUUID(), roles: ["FINANCE"] };
const validation = (error: unknown) => error instanceof ServiceError && error.code === "VALIDATION";
const conflict = (error: unknown) => error instanceof ServiceError && error.code === "CONFLICT";
const restore: Array<() => void> = [];
function stub<T, K extends keyof T>(target: T, key: K, implementation: unknown) {
  const original = target[key];
  target[key] = implementation as T[K];
  restore.push(() => { target[key] = original; });
}

describe("AP settlement contracts", () => {
  function paymentHarness(currency = "USD") {
    const locks: string[] = [], payments: Prisma.PaymentCreateInput[] = [], movements: unknown[] = [];
    const payable = { id: randomUUID(), tenantId: ctx.tenantId, companyId: ctx.companyId!, projectId: null,
      supplierContactId: randomUUID(), supplierInvoiceId: randomUUID(), currency,
      originalAmount: d(100), paidAmount: d(0), creditedAmount: d(10) };
    const account = { id: randomUUID(), tenantId: ctx.tenantId, companyId: null as string | null,
      currency, status: "ACTIVE", openingBalance: d(200) };
    let period: { periodKey: string } | null = null;
    let moduleOff = false;
    let ledgerOutflow = d(0);
    const balanceQueries: Prisma.AccountMovementGroupByArgs[] = [];
    const tx = {
      $queryRaw: async (strings: TemplateStringsArray) => { locks.push(strings.join("").includes("companies") ? "company" : "account"); return []; },
      period: { findFirst: async () => period },
      tenantModuleSetting: { findMany: async () => moduleOff ? [{ moduleKey: "AP", isEnabled: false }] : [] },
      treasuryAccount: { findUnique: async () => account },
      payment: { create: async ({ data }: { data: Prisma.PaymentCreateInput }) => { payments.push(data); return { id: "payment" }; } },
      accountMovement: {
        groupBy: async (query: Prisma.AccountMovementGroupByArgs) => {
          balanceQueries.push(query);
          if (!query._sum?.amount || ledgerOutflow.isZero()) return [];
          return [{ accountId: account.id, type: "OUTFLOW", _sum: { amount: ledgerOutflow } }];
        },
        create: async ({ data }: { data: unknown }) => { movements.push(data); return { id: "movement" }; },
      },
      payable: { updateMany: async () => ({ count: 1 }) },
    } as unknown as Prisma.TransactionClient;
    const input = { payable, accountId: account.id, amount: d(90), paymentDate: "2026-11-05", supplierInvoiceNumber: 1, idempotencyKey: randomUUID() };
    return { tx, input, locks, payments, movements, balanceQueries,
      close: () => { period = { periodKey: "2026-11" }; },
      disable: () => { moduleOff = true; },
      setLedgerOutflow: (amount: number) => { ledgerOutflow = d(amount); },
    };
  }

  it("captures manual FX per payment and uses company before account lock", async () => {
    const h = paymentHarness();
    await applyPaymentToPayable(h.tx, { ...h.input, fxRate: "1250.123456" }, ctx);
    assert.deepEqual(h.locks, ["company", "account"]);
    assert.equal(h.payments.length, 1);
    assert.equal(h.payments[0]!.fxRate?.toString(), "1250.123456");
    assert.equal(h.payments[0]!.amountArs?.toString(), "112511.11");
    assert.equal(h.movements.length, 1);
  });
  it("requires FX for USD and produces no payment or cash row on failure", async () => {
    const h = paymentHarness();
    await assert.rejects(() => applyPaymentToPayable(h.tx, h.input, ctx), validation);
    assert.equal(h.payments.length + h.movements.length, 0);
  });
  it("normalizes ARS FX to one", async () => {
    const h = paymentHarness("ARS");
    await applyPaymentToPayable(h.tx, h.input, ctx);
    assert.equal(h.payments[0]!.fxRate?.toString(), "1");
    assert.equal(h.payments[0]!.amountArs?.toString(), "90");
  });
  it("closed period stops before account lock and effects", async () => {
    const h = paymentHarness(); h.close();
    await assert.rejects(() => applyPaymentToPayable(h.tx, { ...h.input, fxRate: "1200" }, ctx), conflict);
    assert.deepEqual(h.locks, ["company"]);
    assert.equal(h.balanceQueries.length, 0);
    assert.equal(h.payments.length + h.movements.length, 0);
  });
  it("checks the current module gate inside the transaction before payment effects", async () => {
    const h = paymentHarness(); h.disable();
    await assert.rejects(() => applyPaymentToPayable(h.tx, { ...h.input, fxRate: "1200" }, ctx),
      (error: unknown) => error instanceof ServiceError && error.code === "FORBIDDEN");
    assert.equal(h.payments.length + h.movements.length, 0);
  });
  it("does not spend beyond funds or the remaining balance after credit", async () => {
    const h = paymentHarness();
    await assert.rejects(() => applyPaymentToPayable(h.tx, { ...h.input, amount: d(91), fxRate: "1200" }, ctx), conflict);
    h.setLedgerOutflow(111);
    await assert.rejects(() => applyPaymentToPayable(h.tx, { ...h.input, fxRate: "1200" }, ctx), conflict);
    assert.equal(h.balanceQueries.length, 2);
    assert.equal(h.payments.length + h.movements.length, 0);
  });
  it("accepts only real dates and positive six-decimal FX", () => {
    const base = { payableId: randomUUID(), accountId: randomUUID(), paymentDate: "2026-11-05", amount: "10", idempotencyKey: randomUUID() };
    assert.equal(createPaymentSchema.parse({ ...base, fxRate: "1200.1234567" }).fxRate, "1200.123457");
    for (const fxRate of ["0", "-1", "NaN"]) assert.equal(createPaymentSchema.safeParse({ ...base, fxRate }).success, false);
    assert.equal(createPaymentSchema.safeParse({ ...base, paymentDate: "2026-02-31" }).success, false);
  });
});

describe("AP graph and read projections", { concurrency: false }, () => {
  beforeEach(() => { stub(prisma.tenantModuleSetting, "findMany", async () => []); });
  afterEach(() => restore.splice(0).reverse().forEach(fn => fn()));
  function root() {
    return { tenantId: ctx.tenantId, companyId: ctx.companyId!, projectId: null,
      supplierContactId: "supplier", company: { id: ctx.companyId!, tenantId: ctx.tenantId }, project: null,
      supplierContact: { id: "supplier", tenantId: ctx.tenantId, legalName: "Synthetic supplier", fantasyName: null } };
  }
  it("validates actual tenant at each root endpoint", () => {
    assert.doesNotThrow(() => assertApReadRoot(root(), ctx));
    assert.throws(() => assertApReadRoot({ ...root(), supplierContact: { ...root().supplierContact, tenantId: randomUUID() } }, ctx), conflict);
    assert.throws(() => assertApReadRoot({ ...root(), company: { id: ctx.companyId!, tenantId: randomUUID() } }, ctx), conflict);
  });
  it("cannot pay a forged obligation linked to another contact or total", () => {
    const invoice = { ...root(), id: "invoice", currency: "ARS", totalAmount: d(100), status: "ISSUED", documentKind: "INVOICE" };
    const payable = { ...root(), supplierInvoiceId: invoice.id, currency: invoice.currency, originalAmount: d(100) };
    assert.doesNotThrow(() => assertApPayableMatchesInvoice(payable, invoice));
    assert.throws(() => assertApPayableMatchesInvoice({ ...payable, supplierContactId: "other" }, invoice), conflict);
    assert.throws(() => assertApPayableMatchesInvoice({ ...payable, originalAmount: d(99) }, invoice), conflict);
  });
  it("validates note and subcontract reference endpoints before exposing their context", () => {
    const note = { ...root(), currency: "ARS", documentKind: "CREDIT_NOTE", referencedSupplierInvoiceId: "parent",
      referencedSupplierInvoice: { id: "parent", tenantId: ctx.tenantId, companyId: ctx.companyId!, projectId: null,
        supplierContactId: "supplier", currency: "ARS", documentKind: "INVOICE" } };
    assert.doesNotThrow(() => assertApReadRoot(note, ctx));
    assert.throws(() => assertApReadRoot({ ...note, referencedSupplierInvoice: { ...note.referencedSupplierInvoice, tenantId: randomUUID() } }, ctx), conflict);
    assert.throws(() => assertApReadRoot({ ...note, referencedSupplierInvoiceId: null }, ctx), conflict);
    const cert = { id: "certificate", tenantId: ctx.tenantId, companyId: ctx.companyId!, projectId: "project", subcontractorContactId: "supplier",
      subcontract: { tenantId: ctx.tenantId, companyId: ctx.companyId!, projectId: "project", subcontractorContactId: "supplier" } };
    const invoice = { ...root(), projectId: "project", project: { id: "project", tenantId: ctx.tenantId, companyId: ctx.companyId! },
      documentKind: "INVOICE", subcontractCertificationId: "certificate", subcontractCertification: cert };
    assert.doesNotThrow(() => assertApReadRoot(invoice, ctx));
    assert.throws(() => assertApReadRoot({ ...invoice, subcontractCertification: { ...cert, subcontract: { ...cert.subcontract, tenantId: randomUUID() } } }, ctx), conflict);
  });
  it("checks line ownership and both WBS/APU/PO endpoints", () => {
    const invoice = { ...root(), id: "invoice", projectId: "project", purchaseOrderId: "order" };
    const line: Parameters<typeof assertApInvoiceLineParents>[1][number] = {
      invoiceId: invoice.id, wbsNodeId: "wbs", purchaseOrderLineId: "po-line", costAnalysisLineId: "apu",
      wbsNode: { id: "wbs", budgetId: "budget", budget: { tenantId: ctx.tenantId, companyId: null, projectId: "project" } },
      purchaseOrderLine: { id: "po-line", purchaseOrderId: "order", wbsNodeId: "wbs", purchaseOrder: { tenantId: ctx.tenantId, companyId: ctx.companyId!, projectId: "project" } },
      costAnalysisLine: { id: "apu", budgetId: "budget", costItem: { budgetId: "budget", wbsNodeId: "wbs" } },
    };
    assert.doesNotThrow(() => assertApInvoiceLineParents(invoice, [line]));
    for (const patch of [
      { invoiceId: "another" }, { wbsNode: { ...line.wbsNode!, budget: { ...line.wbsNode!.budget, tenantId: randomUUID() } } },
      { wbsNode: { ...line.wbsNode!, budget: { ...line.wbsNode!.budget, projectId: "another" } } },
      { purchaseOrderLine: { ...line.purchaseOrderLine!, purchaseOrderId: "another" } },
      { costAnalysisLine: { ...line.costAnalysisLine!, costItem: { budgetId: "budget", wbsNodeId: "another" } } },
    ]) assert.throws(() => assertApInvoiceLineParents(invoice, [{ ...line, ...patch }]), conflict);
  });
  it("uses the debit-note GL source when cancelling an issued debit note", async () => {
    stub(prisma.supplierInvoice, "findUnique", async () => ({ ...root(), status: "ISSUED", documentKind: "DEBIT_NOTE" }));
    let checked = false;
    stub(prisma.journalEntry, "findFirst", async ({ where }: { where: { sourceType: string } }) => {
      assert.equal(where.sourceType, "SUPPLIER_DEBIT_NOTE"); checked = true;
      return { id: "journal", status: "POSTED", reversedByEntry: null };
    });
    await assert.rejects(() => cancelSupplierInvoice("note", ctx, undefined, "Synthetic GL guard"), conflict);
    assert.equal(checked, true);
  });
  it("reading a credit-settled obligation never invents cash or writes", async () => {
    const invoice = { ...root(), id: "invoice", currency: "ARS", totalAmount: d(100), status: "ISSUED", documentKind: "INVOICE", lines: [] };
    const payable = { ...root(), id: "payable", supplierInvoiceId: "invoice", supplierInvoice: invoice,
      currency: "ARS", originalAmount: d(100), paidAmount: d(40), creditedAmount: d(60), status: "OPEN", dueDate: new Date("2099-01-01") };
    stub(prisma.payable, "findUnique", async () => payable);
    stub(prisma.payable, "updateMany", async () => { throw new Error("Read must not mutate AP"); });
    const result = await getCompanyPayableById(payable.id, ctx);
    assert.equal(result.status, "PAID"); assert.equal(result.balanceDue, "0.00");
    assert.equal(result.paidAmount, "40.00"); assert.equal(result.creditedAmount, "60.00");
    assert.equal(payable.paidAmount.toString(), "40");
  });
});

describe("AP notes use the canonical money kernel", { concurrency: false }, () => {
  let lines: Array<Record<string, unknown>>, note: Record<string, unknown>, locks: string[];
  const parentId = randomUUID(), supplierId = randomUUID();
  const parent = () => ({ id: parentId, tenantId: ctx.tenantId, companyId: ctx.companyId!, projectId: null,
    supplierContactId: supplierId, documentKind: "INVOICE", status: "ISSUED", currency: "ARS", number: 1,
    issueDate: new Date("2026-11-05"), dueDate: new Date("2026-12-05"), fxRate: d(1), totalAmount: d(100),
    invoiceLetter: "A", iibbPerceptionRate: d(0), supplierContact: { legalName: "Synthetic supplier", fantasyName: null },
    company: { country: "AR" }, lines: [], payable: { id: "payable", tenantId: ctx.tenantId, companyId: ctx.companyId!, projectId: null,
      supplierContactId: supplierId, supplierInvoiceId: parentId, currency: "ARS", originalAmount: d(100), paidAmount: d(0), creditedAmount: d(0), status: "OPEN" } });
  beforeEach(() => {
    lines = []; note = {}; locks = [];
    stub(prisma.tenantModuleSetting, "findMany", async () => []);
    stub(prisma.supplierInvoice, "findUnique", async () => parent());
    const tx = {
      $queryRaw: async (s: TemplateStringsArray) => { locks.push(s.join("")); return []; },
      tenantModuleSetting: { findMany: async () => [] },
      company: { findUnique: async () => ({ tenantId: ctx.tenantId }), findFirst: async () => ({ id: ctx.companyId }) },
      contact: { findUnique: async () => ({ tenantId: ctx.tenantId }) },
      supplierInvoice: { findUnique: async () => parent(), aggregate: async () => ({ _max: { number: 1 } }),
        create: async ({ data }: { data: Record<string, unknown> }) => { note = { ...data, id: randomUUID(), status: "DRAFT", fxRate: d(1), amountArs: d(0) }; return note; },
        update: async ({ data }: { data: Record<string, unknown> }) => { Object.assign(note, data); return note; },
        findUniqueOrThrow: async () => ({ ...note, lines, supplierContact: parent().supplierContact }),
      },
      supplierInvoiceLine: { create: async ({ data }: { data: Record<string, unknown> }) => { lines.push({ ...data, id: randomUUID() }); }, findMany: async () => lines },
      auditLog: { create: async () => ({}) },
    } as unknown as Prisma.TransactionClient;
    stub(prisma, "$transaction", async (run: (tx: Prisma.TransactionClient) => unknown) => run(tx));
  });
  afterEach(() => restore.splice(0).reverse().forEach(fn => fn()));
  it("rounds each tax line before summing and locks the company series", async () => {
    const result = await createSupplierDebitNoteFromInvoice({ parentSupplierInvoiceId: parentId,
      lines: [0, 1].map(sortOrder => ({ description: "Synthetic tiny line", quantity: "1", unitPrice: "0.05", taxRate: "10", sortOrder })) }, ctx);
    assert.equal(result.taxAmount, "0.02"); assert.equal(result.totalAmount, "0.12");
    assert.equal(lines[0]!.lineTax?.toString(), "0.01");
    assert.ok(locks[0]?.includes("companies"));
    assert.equal(typeof result.fxRate, "string"); assert.equal(typeof result.amountArs, "string");
  });
  it("rejects malformed monetary and calendar inputs before creating a note", async () => {
    for (const input of [
      { issueDate: "2026-02-31" },
      { lines: [{ description: "Invalid", quantity: "1", unitPrice: "-10" }] },
      { lines: [{ description: "Invalid", quantity: "NaN", unitPrice: "10" }] },
    ]) await assert.rejects(() => createSupplierCreditNoteFromInvoice({ parentSupplierInvoiceId: parentId, ...input }, ctx), validation);
    assert.equal(lines.length, 0); assert.deepEqual(note, {});
  });
  it("uses the same validators for composite payment FX and note inputs", () => {
    assert.equal(createSupplierFiscalNoteSchema.safeParse({ parentSupplierInvoiceId: parentId, issueDate: "2026-02-31" }).success, false);
    const result = registerApExpenseSchema.safeParse({ supplierContactId: supplierId, issueDate: "2026-11-05", dueDate: "2026-12-05", currency: "USD", fxRate: "1200", invoiceLetter: "A",
      lines: [{ description: "Expense", quantity: "1", unitPrice: "10" }], idempotencyKey: randomUUID(),
      payNow: { accountId: randomUUID(), paymentDate: "2026-11-05", fxRate: "1300.1234567", payFullBalance: true, idempotencyKey: randomUUID() } });
    assert.ok(result.success); if (result.success) assert.equal(result.data.payNow?.fxRate, "1300.123457");
  });
});
