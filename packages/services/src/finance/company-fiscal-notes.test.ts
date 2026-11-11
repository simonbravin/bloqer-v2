import assert from "node:assert/strict";
import { describe, it, type TestContext } from "node:test";

import { Prisma, prisma } from "@bloqer/database";

import {
  issueSalesCreditNote, issueSalesDebitNote, cancelSalesCreditNote,
} from "../ar/credit-debit-note.service";
import { listCompanySalesInvoices } from "../ar/sales-invoice.service";
import {
  issueSupplierCreditNote, issueSupplierDebitNote, cancelSupplierCreditNote,
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
