import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { Prisma, prisma } from "@bloqer/database";
import { getSupplierInvoiceById } from "./supplier-invoice.service";
import { getPayableById, getPayableBySupplierInvoiceId } from "./payable.service";
import { getSalesInvoiceById, updateSalesInvoice } from "../ar/sales-invoice.service";
import { clearProjectAccessModeCache } from "../security/access";
import { ServiceError, type ServiceContext } from "../types";

const restore: Array<() => void> = [];
function stub<T, K extends keyof T>(target: T, key: K, implementation: unknown) {
  const original = target[key];
  target[key] = implementation as T[K];
  restore.push(() => { target[key] = original; });
}

describe("shared AP/AR reads enforce corporate scope", { concurrency: false }, () => {
  const ctx: ServiceContext = {
    actorUserId: "user", tenantId: "tenant", companyId: "company", roles: ["FINANCE"],
  };
  let projectId: string | null;
  let companyId: string;
  let membership: { id: string } | null;
  const operations = {
    supplierInvoice: (c: ServiceContext, scope?: string) => getSupplierInvoiceById("document", c, scope),
    payable: (c: ServiceContext, scope?: string) => getPayableById("document", c, scope),
    payableFromInvoice: (c: ServiceContext, scope?: string) => getPayableBySupplierInvoiceId("document", c, scope),
    salesInvoice: (c: ServiceContext, scope?: string) => getSalesInvoiceById("document", c, scope),
  };
  const forbidden = (error: unknown) => error instanceof ServiceError && error.code === "FORBIDDEN";

  beforeEach(() => {
    projectId = null;
    companyId = "company";
    membership = null;
    clearProjectAccessModeCache();
    stub(prisma.tenantModuleSetting, "findMany", async () => []);
    stub(prisma.tenant, "findUnique", async () => ({ projectAccessMode: "MEMBERSHIP_SCOPED" }));
    stub(prisma.project, "findUnique", async () => ({ id: "project", tenantId: "tenant", companyId, status: "ACTIVE", country: "AR" }));
    stub(prisma.projectMembership, "findUnique", async () => membership);
    const document = () => ({
      id: "document", tenantId: "tenant", companyId, projectId, number: 1, documentKind: "INVOICE",
      subtotal: new Prisma.Decimal("8.26"), taxAmount: new Prisma.Decimal("1.74"),
      totalAmount: new Prisma.Decimal("10.00"), iibbPerceptionRate: new Prisma.Decimal(0),
      iibbPerceptionAmount: new Prisma.Decimal(0), lines: [],
      supplierContact: { legalName: "Supplier", fantasyName: null },
      clientContact: { legalName: "Client", fantasyName: null },
      originalAmount: new Prisma.Decimal("10"), paidAmount: new Prisma.Decimal(0),
      creditedAmount: new Prisma.Decimal(0), status: "OPEN", dueDate: new Date("2099-01-01"),
    });
    stub(prisma.supplierInvoice, "findUnique", async () => document());
    stub(prisma.salesInvoice, "findUnique", async () => document());
    stub(prisma.payable, "findUnique", async () => document());
    stub(prisma.payable, "updateMany", async () => { throw new Error("Unexpected write during read test"); });
  });
  afterEach(() => { restore.splice(0).reverse().forEach(fn => fn()); clearProjectAccessModeCache(); });

  it("sales edits reject another company before checking document state", async () => {
    companyId = "other-company";
    await assert.rejects(() => updateSalesInvoice("document", { notes: "Edit" }, ctx), forbidden);
  });

  it("sales edits in the active company still reach the draft-state guard", async () => {
    await assert.rejects(() => updateSalesInvoice("document", { notes: "Edit" }, ctx),
      (error: unknown) => error instanceof ServiceError && error.code === "CONFLICT");
  });

  for (const [name, read] of Object.entries(operations)) {
    it(`${name}: denies corporate documents to project-only finance roles`, async () => {
      await assert.rejects(() => read({ ...ctx, roles: ["PROJECT_FINANCE"] }), forbidden);
    });
    it(`${name}: denies another active company`, async () => {
      companyId = "other-company";
      await assert.rejects(() => read(ctx), forbidden);
    });
    it(`${name}: denies another tenant`, async () => {
      await assert.rejects(() => read({ ...ctx, tenantId: "other-tenant" }), forbidden);
    });
    it(`${name}: allows corporate finance without a project membership`, async () => {
      assert.equal((await read(ctx))?.id, "document");
    });
    it(`${name}: allows a global company context without hiding corporate documents`, async () => {
      companyId = "other-company";
      assert.equal((await read({ ...ctx, companyId: null }))?.id, "document");
    });
    it(`${name}: keeps project access for a project-finance member`, async () => {
      projectId = "project";
      membership = { id: "membership" };
      assert.equal((await read({ ...ctx, roles: ["PROJECT_FINANCE"] }, "project"))?.id, "document");
    });
    it(`${name}: cannot use the corporate entry point to bypass project membership`, async () => {
      projectId = "project";
      await assert.rejects(() => read({ ...ctx, roles: ["PROJECT_FINANCE"] }), forbidden);
    });
    it(`${name}: rejects corporate documents from a project route`, async () => {
      await assert.rejects(() => read(ctx, "project"), forbidden);
    });
  }
});
