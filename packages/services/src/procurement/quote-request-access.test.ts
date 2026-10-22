import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { prisma } from "@bloqer/database";
import { clearProjectAccessModeCache } from "../security/access";
import { ServiceError, type ServiceContext } from "../types";
import {
  createProcurementQuote, updateProcurementQuote, deleteProcurementQuote,
  listProcurementQuotesForRequest, listProcurementQuotesDetailedForRequest,
} from "./procurement-quote.service";
import {
  createPurchaseOrderFromQuoteLines, createPurchaseOrdersFromAwards,
  selectProcurementQuoteAndCreatePo,
} from "./purchase-request-to-po.service";

// Prisma delegates are dynamic proxies, not own methods supported by mock.method.
const restore: Array<() => void> = [];
function stub<T, K extends keyof T>(target: T, key: K, implementation: unknown) {
  const original = target[key];
  target[key] = implementation as T[K];
  restore.push(() => { target[key] = original; });
}

describe("quote and award service scope", { concurrency: false }, () => {
  const ctx: ServiceContext = {
    actorUserId: "user", tenantId: "tenant", companyId: "company", roles: ["PROCUREMENT"],
  };
  const request = {
    id: "request", tenantId: "tenant", companyId: "company", projectId: "project",
    status: "SUBMITTED", lines: [{ id: "line", awardedPurchaseOrderId: null }],
  };
  let projectStatus = "ACTIVE";
  let membership: { id: string } | null = null;
  const operations = {
    create: (context: ServiceContext) => createProcurementQuote({
      purchaseRequestId: request.id, supplierContactId: "supplier", currency: "ARS", iibbPerceptionRate: "0",
      lines: [{ purchaseRequestLineId: "line", unitPrice: "10", taxRate: "21", discountPct: "0", sortOrder: 0 }],
    }, context),
    update: (context: ServiceContext) => updateProcurementQuote("quote", request.id, { currency: "ARS", lines: [] }, context),
    delete: (context: ServiceContext) => deleteProcurementQuote("quote", request.id, context),
    list: (context: ServiceContext) => listProcurementQuotesForRequest(request.id, context),
    detail: (context: ServiceContext) => listProcurementQuotesDetailedForRequest(request.id, context),
    award: (context: ServiceContext) => createPurchaseOrderFromQuoteLines("quote", ["line"], context),
    batch: (context: ServiceContext) => createPurchaseOrdersFromAwards(request.id, [
      { procurementQuoteId: "quote", purchaseRequestLineIds: ["line"] },
    ], context),
    shortcut: (context: ServiceContext) => selectProcurementQuoteAndCreatePo("quote", context),
  };

  beforeEach(() => {
    projectStatus = "ACTIVE";
    membership = null;
    clearProjectAccessModeCache();
    stub(prisma.tenantModuleSetting, "findMany", async () => []);
    stub(prisma.tenant, "findUnique", async () => ({ projectAccessMode: "MEMBERSHIP_SCOPED" }));
    stub(prisma.project, "findUnique", async () => ({
      id: "project", tenantId: "tenant", companyId: "company", status: projectStatus, country: "AR",
    }));
    stub(prisma.projectMembership, "findUnique", async () => membership);
    stub(prisma.purchaseRequest, "findUnique", async () => request);
    stub(prisma.procurementQuote, "findUnique", async () => ({
      id: "quote", tenantId: "tenant", purchaseRequestId: request.id, purchaseRequest: request,
      status: "RECEIVED", lines: [],
    }));
    stub(prisma.procurementQuote, "findMany", async () => []);
    stub(prisma.purchaseOrder, "count", async () => 0);
    stub(prisma.purchaseRequestLine, "findMany", async () => []);
    stub(prisma.contact, "findUnique", async () => null);
    stub(prisma.contactRole, "findUnique", async () => null);
    // No real transaction or query is run, even when exercising the missing guard.
    stub(prisma, "$queryRaw", async () => []);
    stub(prisma, "$transaction", async (run: (tx: typeof prisma) => Promise<unknown>) => run(prisma));
    stub(prisma.company, "findFirst", async () => null);
    stub(prisma.procurementQuote, "deleteMany", async () => { throw new Error("Unexpected write"); });
  });
  afterEach(() => { restore.splice(0).reverse().forEach(fn => fn()); clearProjectAccessModeCache(); });

  for (const [name, run] of Object.entries(operations)) {
    it(`${name}: denies another tenant`, async () => {
      await assert.rejects(() => run({ ...ctx, tenantId: "other-tenant", roles: ["OWNER"] }),
        (error: unknown) => error instanceof ServiceError && error.code === "NOT_FOUND");
    });
    it(`${name}: denies a user without membership in the request project`, async () => {
      await assert.rejects(() => run(ctx), (error: unknown) =>
        error instanceof ServiceError && error.code === "FORBIDDEN");
    });
    it(`${name}: denies another active company even with a tenant-wide role`, async () => {
      await assert.rejects(() => run({ ...ctx, companyId: "other-company", roles: ["OWNER"] }),
        (error: unknown) => error instanceof ServiceError && error.code === "FORBIDDEN");
    });
    if (name !== "list" && name !== "detail") {
      for (const status of ["DRAFT", "ON_HOLD", "COMPLETED", "CANCELLED"]) {
        it(`${name}: blocks mutations in a ${status} project`, async () => {
          projectStatus = status;
          membership = { id: "membership" };
          await assert.rejects(() => run(ctx), (error: unknown) =>
            error instanceof ServiceError && error.code === "CONFLICT" && error.message.includes("obra"));
        });
      }
    }
  }
  it("allows members to read quotes on a completed project", async () => {
    projectStatus = "COMPLETED";
    membership = { id: "membership" };
    assert.deepEqual(await operations.list(ctx), []);
    assert.deepEqual(await operations.detail(ctx), []);
  });
  it("keeps tenant-wide owner access without an active company filter", async () => {
    assert.deepEqual(await operations.list({ ...ctx, companyId: null, roles: ["OWNER"] }), []);
  });
  it("allows an authorized creator to reach supplier validation", async () => {
    membership = { id: "membership" };
    await assert.rejects(() => operations.create(ctx), (error: unknown) =>
      error instanceof ServiceError && error.code === "NOT_FOUND" && error.message.includes("Contacto"));
  });
});
