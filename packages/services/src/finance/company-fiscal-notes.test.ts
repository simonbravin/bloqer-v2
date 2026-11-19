import assert from "node:assert/strict";
import { describe, it, type TestContext } from "node:test";

import { Prisma, prisma } from "@bloqer/database";

import {
  issueSalesCreditNote, issueSalesDebitNote, cancelSalesCreditNote,
  createSalesCreditNoteFromInvoice, createSalesDebitNoteFromInvoice,
} from "../ar/credit-debit-note.service";
import { listCompanySalesInvoices } from "../ar/sales-invoice.service";
import {
  issueSupplierCreditNote, issueSupplierDebitNote, cancelSupplierCreditNote,
  createSupplierCreditNoteFromInvoice, createSupplierDebitNoteFromInvoice,
} from "../ap/credit-debit-note.service";
import { listCompanySupplierInvoices } from "../ap/supplier-invoice.service";
import { ServiceError, type ServiceContext } from "../types";

const ctx: ServiceContext = {
  tenantId: "00000000-0000-4000-8000-000000000001",
  companyId: "00000000-0000-4000-8000-000000000002",
  actorUserId: "00000000-0000-4000-8000-000000000003",
  roles: ["OWNER"],
};
const forbidden = (error: unknown) => error instanceof ServiceError && error.code === "FORBIDDEN";

function modules(t: TestContext) {
  const previous = prisma.tenantModuleSetting.findMany;
  prisma.tenantModuleSetting.findMany = (async () => []) as unknown as typeof previous;
  t.after(() => { prisma.tenantModuleSetting.findMany = previous; });
}

function corporateRows(area: "AR" | "AP") {
  const contactId = "00000000-0000-4000-8000-000000000004";
  const invoice = {
    id: "invoice", tenantId: ctx.tenantId, companyId: ctx.companyId!, projectId: null,
    number: 1, documentKind: "INVOICE", status: "ISSUED", currency: "ARS",
    company: { id: ctx.companyId!, tenantId: ctx.tenantId }, project: null,
    certificationId: null, certification: null, purchaseOrderId: null, purchaseOrder: null,
    subcontractCertificationId: null, subcontractCertification: null,
    subtotal: new Prisma.Decimal(100), taxAmount: new Prisma.Decimal(0), totalAmount: new Prisma.Decimal(100),
    amountArs: new Prisma.Decimal(100), fxRate: new Prisma.Decimal(1),
    iibbPerceptionRate: new Prisma.Decimal(0), iibbPerceptionAmount: new Prisma.Decimal(0),
    clientContactId: contactId, supplierContactId: contactId,
    clientContact: { id: contactId, tenantId: ctx.tenantId, legalName: "Cliente", fantasyName: null },
    supplierContact: { id: contactId, tenantId: ctx.tenantId, legalName: "Proveedor", fantasyName: null },
    lines: [], referencedSalesInvoiceId: null, referencedSalesInvoice: null,
    referencedSupplierInvoiceId: null, referencedSupplierInvoice: null,
  };
  const obligation = {
    ...invoice, id: "obligation", originalAmount: new Prisma.Decimal(100), paidAmount: new Prisma.Decimal(20),
    creditedAmount: new Prisma.Decimal(30), status: "PARTIAL", salesInvoiceId: invoice.id,
    supplierInvoiceId: invoice.id, salesInvoice: invoice,
  };
  const note = {
    ...invoice, id: "credit", documentKind: "CREDIT_NOTE", status: "DRAFT",
    ...(area === "AR"
      ? { referencedSalesInvoiceId: invoice.id, referencedSalesInvoice: invoice, receivable: null }
      : { referencedSupplierInvoiceId: invoice.id, referencedSupplierInvoice: invoice, payable: null }),
  };
  return [{ ...invoice, ...(area === "AR" ? { receivable: obligation } : { payable: obligation }) }, note];
}

describe("corporate fiscal document boundaries", { concurrency: false }, () => {
  for (const area of ["AR", "AP"] as const) {
    it(`${area} exposes a non-cash credit draft and derives the parent balance from cash plus credit`, async (t) => {
      modules(t);
      const delegate = area === "AR" ? prisma.salesInvoice : prisma.supplierInvoice;
      const previousFind = delegate.findMany, previousCount = delegate.count;
      delegate.findMany = (async () => corporateRows(area)) as unknown as typeof previousFind;
      delegate.count = (async () => 2) as typeof previousCount;
      t.after(() => { delegate.findMany = previousFind; delegate.count = previousCount; });
      if (area === "AR") {
        const result = await listCompanySalesInvoices(ctx);
        assert.equal(result.data[0]?.receivable?.balanceDue, "50.00");
        assert.equal(result.data[1]?.receivable, null);
        assert.equal(result.data[1]?.code, "NC-00001");
        assert.equal(result.data[1]?.totalAmount, "100.00");
      } else {
        const result = await listCompanySupplierInvoices(ctx);
        assert.equal(result.data[0]?.payable?.balanceDue, "50.00");
        assert.equal(result.data[1]?.payable, null);
        assert.equal(result.data[1]?.code, "NC-00001");
        assert.equal(result.data[1]?.totalAmount, "100.00");
      }
    });

    it(`${area} lists only corporate documents in the active tenant/company, including notes without debt`, async (t) => {
      modules(t);
      const delegate = area === "AR" ? prisma.salesInvoice : prisma.supplierInvoice;
      const previousFind = delegate.findMany, previousCount = delegate.count;
      const reads: Array<{ where: unknown; skip?: number; take?: number }> = [];
      const counts: Array<{ where: unknown }> = [];
      delegate.findMany = (async (args: { where: unknown; skip?: number; take?: number }) => { reads.push(args); return []; }) as unknown as typeof previousFind;
      delegate.count = (async (args: { where: unknown }) => { counts.push(args); return 7; }) as unknown as typeof previousCount;
      t.after(() => { delegate.findMany = previousFind; delegate.count = previousCount; });
      const list = area === "AR" ? listCompanySalesInvoices : listCompanySupplierInvoices;
      const result = await list(ctx, { page: 2, pageSize: 10, documentKind: "CREDIT_NOTE", includeCancelled: true });
      assert.deepEqual(result, { data: [], total: 7 });
      assert.equal(reads[0]?.skip, 10); assert.equal(reads[0]?.take, 10);
      assert.deepEqual(reads[0]?.where, {
        tenantId: ctx.tenantId, projectId: null, companyId: ctx.companyId, documentKind: "CREDIT_NOTE",
      });
      assert.deepEqual(counts[0]?.where, reads[0]?.where);
    });

    it(`${area} selects issued invoices only for note parents and restricts search inside corporate scope`, async (t) => {
      modules(t);
      const delegate = area === "AR" ? prisma.salesInvoice : prisma.supplierInvoice;
      const previousFind = delegate.findMany, previousCount = delegate.count;
      let where: Record<string, unknown> = {};
      delegate.findMany = (async (args: { where?: Record<string, unknown> }) => { where = args.where ?? {}; return []; }) as typeof previousFind;
      delegate.count = (async () => 0) as typeof previousCount;
      t.after(() => { delegate.findMany = previousFind; delegate.count = previousCount; });
      const list = area === "AR" ? listCompanySalesInvoices : listCompanySupplierInvoices;
      await list(ctx, { documentKind: "INVOICE", status: "ISSUED", search: "Factura 12" });
      assert.equal(where.tenantId, ctx.tenantId); assert.equal(where.companyId, ctx.companyId);
      assert.equal(where.projectId, null); assert.equal(where.documentKind, "INVOICE");
      assert.equal(where.status, "ISSUED"); assert.ok(Array.isArray(where.OR));
    });

    it(`${area} rejects project-only finance before corporate document queries`, async (t) => {
      modules(t);
      const list = area === "AR" ? listCompanySalesInvoices : listCompanySupplierInvoices;
      await assert.rejects(() => list({ ...ctx, roles: ["PROJECT_FINANCE"] }), forbidden);
    });
  }

  const mutations = [
    { area: "AR", run: issueSalesCreditNote }, { area: "AR", run: issueSalesDebitNote },
    { area: "AR", run: cancelSalesCreditNote }, { area: "AP", run: issueSupplierCreditNote },
    { area: "AP", run: issueSupplierDebitNote }, { area: "AP", run: cancelSupplierCreditNote },
  ];
  for (const { area, run } of mutations) {
    it(`${run.name} rejects a project document when corporate scope is explicit`, async (t) => {
      modules(t);
      const delegate = area === "AR" ? prisma.salesInvoice : prisma.supplierInvoice;
      const previous = delegate.findUnique;
      delegate.findUnique = (async () => ({ tenantId: ctx.tenantId, companyId: ctx.companyId, projectId: "project" })) as unknown as typeof previous;
      t.after(() => { delegate.findUnique = previous; });
      await assert.rejects(() => run("note", ctx, null), forbidden);
    });

    it(`${run.name} keeps corporate note mutations isolated by tenant, company and role`, async (t) => {
      modules(t);
      const delegate = area === "AR" ? prisma.salesInvoice : prisma.supplierInvoice;
      const previous = delegate.findUnique;
      delegate.findUnique = (async () => ({ tenantId: ctx.tenantId, companyId: ctx.companyId, projectId: null })) as unknown as typeof previous;
      t.after(() => { delegate.findUnique = previous; });
      for (const context of [
        { ...ctx, tenantId: "another-tenant" }, { ...ctx, companyId: "another-company" },
        { ...ctx, roles: ["PROJECT_FINANCE"] as ServiceContext["roles"] },
      ]) await assert.rejects(() => run("note", context, null), forbidden);
    });
  }
});

/** Exercise the real services and money kernel with controlled reads before/after the transaction lock. */
function draftHarness(t: TestContext, area: "AR" | "AP") {
  modules(t);
  const parentId = "00000000-0000-4000-8000-000000000005";
  const [row] = corporateRows(area);
  const parent = {
    ...row!, id: parentId, issueDate: new Date("2026-11-01"), dueDate: new Date("2026-12-01"),
    invoiceLetter: "A", notes: null, internalNotes: null,
    lines: [{
      id: "source-line", invoiceId: parentId, description: "IVA incluido", quantity: new Prisma.Decimal(1),
      unitPrice: new Prisma.Decimal("8.2645"), taxRate: new Prisma.Decimal(21), discountPct: new Prisma.Decimal(0),
      lineSubtotal: new Prisma.Decimal("8.26"), lineTax: new Prisma.Decimal("1.74"), lineTotal: new Prisma.Decimal(10),
      sortOrder: 0, wbsNodeId: null, costType: "LABOR", purchaseOrderLineId: null, costAnalysisLineId: null,
    }],
  };
  const obligation = {
    ...parent, id: "obligation", salesInvoiceId: parentId, supplierInvoiceId: parentId, salesInvoice: parent,
    originalAmount: new Prisma.Decimal(100), paidAmount: new Prisma.Decimal(20),
    creditedAmount: new Prisma.Decimal(30), status: "PARTIAL",
  };
  const debtKey = area === "AR" ? "receivable" : "payable";
  let currentPaid = obligation.paidAmount;
  const currentParent = () => ({ ...parent, [debtKey]: { ...obligation, paidAmount: currentPaid } });
  const lines: Array<Record<string, unknown>> = [];
  let note: Record<string, unknown> | undefined;
  const delegate = area === "AR" ? prisma.salesInvoice : prisma.supplierInvoice;
  const previousFind = delegate.findUnique, previousTransaction = prisma.$transaction;
  delegate.findUnique = (async () => ({ ...parent, [debtKey]: obligation })) as unknown as typeof previousFind;
  const invoiceDelegate = {
    findUnique: async () => currentParent(),
    findUniqueOrThrow: async ({ where }: { where: { id: string } }) => where.id === parentId
      ? currentParent() : { ...note, lines },
    aggregate: async () => ({ _max: { number: 0 } }),
    create: async ({ data }: { data: Record<string, unknown> }) => {
      note = { ...parent, ...data, id: "note", status: "DRAFT", amountArs: new Prisma.Decimal(0) };
      return note;
    },
    update: async ({ data }: { data: Record<string, unknown> }) => { Object.assign(note!, data); return note; },
  };
  const tx = {
    $queryRaw: async () => [],
    company: { findUnique: async () => parent.company, findFirst: async () => parent.company },
    contact: { findUnique: async () => parent.supplierContact },
    tenantModuleSetting: { findMany: async () => [] },
    [area === "AR" ? "salesInvoice" : "supplierInvoice"]: invoiceDelegate,
    [area === "AR" ? "salesInvoiceLine" : "supplierInvoiceLine"]: {
      findMany: async () => lines,
      create: async ({ data }: { data: Record<string, unknown> }) => { lines.push({ ...data, id: "line" }); },
    },
    auditLog: { create: async () => ({}) },
  };
  prisma.$transaction = (async (run: (client: unknown) => unknown) => run(tx)) as unknown as typeof previousTransaction;
  t.after(() => { delegate.findUnique = previousFind; prisma.$transaction = previousTransaction; });
  return {
    parentId, lines, getNote: () => note,
    settleBeforeLock: () => { currentPaid = new Prisma.Decimal(70); },
    create: (kind: "CREDIT_NOTE" | "DEBIT_NOTE", options: { issueDate?: string; dueDate?: string; lines?: Array<{ description: string; quantity: string; unitPrice: string; taxRate?: string }> } = {}) =>
      area === "AR"
        ? (kind === "CREDIT_NOTE" ? createSalesCreditNoteFromInvoice : createSalesDebitNoteFromInvoice)({ parentSalesInvoiceId: parentId, ...options }, ctx)
        : (kind === "CREDIT_NOTE" ? createSupplierCreditNoteFromInvoice : createSupplierDebitNoteFromInvoice)({ parentSupplierInvoiceId: parentId, ...options }, ctx),
  };
}

describe("fiscal note draft regressions", { concurrency: false }, () => {
  for (const area of ["AR", "AP"] as const) {
    for (const kind of ["CREDIT_NOTE", "DEBIT_NOTE"] as const) {
      it(`${area} ${kind} preserves explicit calendar dates without shifting them to the previous day`, async (t) => {
        const h = draftHarness(t, area);
        const result = await h.create(kind, { issueDate: "2026-11-01", dueDate: "2026-12-01" });
        assert.equal(result.issueDate.toISOString(), "2026-11-01T00:00:00.000Z");
        assert.equal(result.dueDate.toISOString(), "2026-12-01T00:00:00.000Z");
      });
    }
    it(`${area} refuses a default NC if the last balance was settled while waiting for the lock`, async (t) => {
      const h = draftHarness(t, area);
      h.settleBeforeLock();
      await assert.rejects(() => h.create("CREDIT_NOTE"), (error: unknown) =>
        error instanceof ServiceError && error.code === "CONFLICT" && /saldo pendiente/.test(error.message));
      assert.equal(h.getNote(), undefined, "must reject before creating an empty note");
    });
    it(`${area} copies stored gross-inclusive line money unchanged to a debit note`, async (t) => {
      const h = draftHarness(t, area);
      const result = await h.create("DEBIT_NOTE");
      assert.equal(result.subtotal, "8.26");
      assert.equal(result.taxAmount, "1.74");
      assert.equal(result.totalAmount, "10.00");
    });
    it(`${area} recalculates explicitly entered debit amounts instead of reusing the source totals`, async (t) => {
      const h = draftHarness(t, area);
      const result = await h.create("DEBIT_NOTE", { lines: [{ description: "Recargo", quantity: "1", unitPrice: "9", taxRate: "21" }] });
      assert.equal(result.totalAmount, "10.89");
    });
  }
  it("AP partial NC retains the source cost category just like the default full-balance NC", async (t) => {
    const h = draftHarness(t, "AP");
    const result = await h.create("CREDIT_NOTE", { lines: [{ description: "Nota de crédito", quantity: "1", unitPrice: "12.34", taxRate: "0" }] });
    assert.equal(h.lines[0]?.costType, "LABOR");
    assert.equal(h.lines[0]?.lineTotal?.toString(), "12.34");
    assert.equal(result.totalAmount, "12.34");
    assert.equal(result.iibbPerceptionRate, "0.0000");
    assert.equal(h.lines[0]?.purchaseOrderLineId, null);
    assert.equal(h.lines[0]?.costAnalysisLineId, null);
  });
  it("AP preserves an explicitly selected cost category on a custom note line", async (t) => {
    const h = draftHarness(t, "AP");
    const line = { description: "Recargo", quantity: "1", unitPrice: "9", costType: "EQUIPMENT" as const };
    await h.create("DEBIT_NOTE", { lines: [line] });
    assert.equal(h.lines[0]?.costType, "EQUIPMENT");
  });
});
