import assert from "node:assert/strict";
import { test } from "node:test";
import { Prisma, prisma } from "@bloqer/database";
import { searchPurchaseOrdersTool, searchPurchaseRequestsTool, getPendingPurchaseOrdersTool } from "../ai/tools/procurement-tools";
import type { AiExecutionContext } from "../ai/types";
import { clearProjectAccessModeCache } from "../security/access";
import { ServiceError, type ServiceContext } from "../types";
import { listPurchaseOrdersByProject, searchPurchaseOrdersByProject } from "./purchase-order.service";
import { listPurchaseRequestsByProject, searchPurchaseRequestsByProject } from "./purchase-request.service";

const projectId = "00000000-0000-4000-8000-000000000001";
const ctx: ServiceContext = {
  tenantId: "tenant-a", actorUserId: "actor", companyId: "company-a", roles: ["OWNER"],
};

type Row = {
  id: string; tenantId: string; companyId: string; projectId: string; number: number; status: string;
  [key: string]: unknown;
};
type Query = {
  where: {
    tenantId?: string; companyId?: string; projectId?: string;
    status?: string | { in: string[] };
  };
  take?: number;
  orderBy?: { number: "asc" | "desc" };
};

function request(number: number, overrides: Partial<Row> = {}): Row {
  return {
    id: `request-${number}`, tenantId: ctx.tenantId, companyId: "company-a", projectId,
    number, status: "SUBMITTED", requestedByUserId: null,
    neededByDate: new Date("2026-11-20T00:00:00Z"),
    lines: [], quotes: [], purchaseOrders: [], ...overrides,
  };
}

function order(number: number, overrides: Partial<Row> = {}): Row {
  const zero = new Prisma.Decimal(0);
  return {
    id: `order-${number}`, tenantId: ctx.tenantId, companyId: "company-a", projectId,
    number, status: "SUBMITTED", currency: "ARS", supplierContactId: "supplier",
    supplierContact: { tenantId: ctx.tenantId, legalName: "Proveedor", fantasyName: null },
    purchaseRequest: null, selectedProcurementQuote: null, lines: [],
    subtotal: new Prisma.Decimal("1234.56"), taxAmount: zero, iibbPerceptionRate: zero,
    iibbPerceptionAmount: zero, totalAmount: new Prisma.Decimal("1234.56"),
    totalAmountArs: new Prisma.Decimal("1234.56"), fxRate: new Prisma.Decimal(1),
    ...overrides,
  };
}

/**
 * Execute the real services, guards, serializers and tools with only Prisma I/O
 * replaced. These verify query bounds/scope and behavior, not PostgreSQL isolation;
 * the maintained isolated live suites cover actual SQL/transaction guarantees.
 */
async function withFixture(run: (fixture: {
  requests: Row[]; orders: Row[];
  reads: Array<{ model: string; query: Query }>;
  counts: Array<{ model: string; query: Query }>;
  project: { id: string; tenantId: string; companyId: string | null; status: string; country: string };
  access: { enabled: boolean; scoped: boolean; member: boolean };
}) => Promise<void>) {
  const fixture = {
    requests: [] as Row[], orders: [] as Row[],
    reads: [] as Array<{ model: string; query: Query }>,
    counts: [] as Array<{ model: string; query: Query }>,
    project: { id: projectId, tenantId: ctx.tenantId, companyId: null as string | null, status: "ACTIVE", country: "AR" },
    access: { enabled: true, scoped: false, member: true },
  };
  const restore: Array<() => void> = [];
  function replace(target: object, key: string, value: unknown) {
    const record = target as Record<string, unknown>;
    const original = record[key];
    record[key] = value;
    restore.push(() => { record[key] = original; });
  }
  function matching(rows: Row[], { where }: Query) {
    return rows.filter((row) =>
      (!where.tenantId || row.tenantId === where.tenantId) &&
      (!where.companyId || row.companyId === where.companyId) &&
      (!where.projectId || row.projectId === where.projectId) &&
      (!where.status || (typeof where.status === "string" ? row.status === where.status : where.status.in.includes(row.status))),
    );
  }
  function stubModel(target: object, model: string, rows: Row[]) {
    replace(target, "findMany", async (query: Query) => {
      fixture.reads.push({ model, query });
      const selected = matching(rows, query).sort((a, b) => query.orderBy?.number === "desc" ? b.number - a.number : a.number - b.number);
      return query.take === undefined ? selected : selected.slice(0, query.take);
    });
    replace(target, "count", async (query: Query) => {
      fixture.counts.push({ model, query });
      return matching(rows, query).length;
    });
  }
  clearProjectAccessModeCache();
  try {
    replace(prisma.tenantModuleSetting, "findMany", async () => fixture.access.enabled ? [] : [{ moduleKey: "PROCUREMENT", isEnabled: false }]);
    replace(prisma.project, "findUnique", async ({ where }: { where: { id: string } }) => where.id === projectId ? fixture.project : null);
    replace(prisma.tenant, "findUnique", async () => ({ projectAccessMode: fixture.access.scoped ? "MEMBERSHIP_SCOPED" : "TENANT_WIDE" }));
    replace(prisma.projectMembership, "findUnique", async () => fixture.access.member ? { id: "membership" } : null);
    replace(prisma.user, "findMany", async () => []);
    replace(prisma.purchaseReceipt, "count", async () => 0);
    stubModel(prisma.purchaseRequest, "request", fixture.requests);
    stubModel(prisma.purchaseOrder, "order", fixture.orders);
    replace(prisma, "$transaction", async (queries: Promise<unknown>[], options: { isolationLevel: string }) => {
      assert.equal(options.isolationLevel, "RepeatableRead");
      return Promise.all(queries);
    });
    await run(fixture);
  } finally {
    for (const reset of restore.reverse()) reset();
    clearProjectAccessModeCache();
  }
}

function aiContext(service: ServiceContext = { ...ctx }): AiExecutionContext {
  return { service, correlationId: "test", locale: "es-AR", timezone: "America/Argentina/Buenos_Aires", currentProjectId: projectId };
}

test("request search bounds SQL and counts the same tenant/company/status scope in a shared project", async () => {
  await withFixture(async (f) => {
    f.requests.push(...Array.from({ length: 40 }, (_, i) => request(i + 1)));
    f.requests.push(request(99, { companyId: "company-b" }), request(98, { tenantId: "tenant-b" }), request(97, { status: "DRAFT" }));
    const result = await searchPurchaseRequestsByProject(projectId, { ...ctx }, { status: "SUBMITTED", limit: 3 });
    assert.equal(result.total, 40);
    assert.deepEqual(result.requests.map((r) => r.number), [40, 39, 38]);
    assert.equal(f.reads.length, 1);
    assert.equal(f.reads[0]!.query.take, 3);
    assert.deepEqual(f.reads[0]!.query.where, f.counts[0]!.query.where);
    assert.equal(result.requests[0]!.code, "SC-040");
  });
});

test("order search preserves ascending order, money serialization and all-company context", async () => {
  await withFixture(async (f) => {
    f.orders.push(order(3), order(1), order(2, { companyId: "company-b" }), order(4, { tenantId: "tenant-b" }));
    const result = await searchPurchaseOrdersByProject(projectId, { ...ctx, companyId: null }, { limit: 2 });
    assert.equal(result.total, 3);
    assert.deepEqual(result.orders.map((r) => r.number), [1, 2]);
    assert.equal(result.orders[0]!.totalAmount, "1234.56");
    assert.equal(result.orders[0]!.supplierName, "Proveedor");
    assert.equal(f.reads[0]!.query.take, 2);
    assert.equal(f.reads[0]!.query.where.companyId, undefined);
    assert.deepEqual(f.reads[0]!.query.where, f.counts[0]!.query.where);
  });
});

test("order filters intersect before limiting and retain empty results for unknown or incompatible statuses", async () => {
  await withFixture(async (f) => {
    f.orders.push(order(1), order(2, { status: "CONFIRMED" }), order(3, { status: "PARTIALLY_RECEIVED" }), order(4, { status: "RECEIVED" }));
    const receipt = await searchPurchaseOrdersByProject(projectId, { ...ctx }, { pendingReceipt: true, limit: 1 });
    assert.equal(receipt.total, 2);
    assert.deepEqual(receipt.orders.map((r) => r.number), [2]);
    for (const filters of [{ status: "unknown" }, { pendingApproval: true, pendingReceipt: true }, { status: "APPROVED", pendingReceipt: true }]) {
      const empty = await searchPurchaseOrdersByProject(projectId, { ...ctx }, filters);
      assert.deepEqual(empty, { orders: [], total: 0 });
    }
    assert.equal(f.reads.length, 1);
    assert.equal(f.counts.length, 1);
    assert.deepEqual(await searchPurchaseRequestsByProject(projectId, { ...ctx }, { status: "unknown" }), { requests: [], total: 0 });
  });
});

test("search does not read data when module, permission, tenant, company or membership denies access", async () => {
  await withFixture(async (f) => {
    const forbidden = (error: unknown) => error instanceof ServiceError && error.code === "FORBIDDEN";
    f.access.enabled = false;
    await assert.rejects(searchPurchaseRequestsByProject(projectId, { ...ctx }), forbidden);
    f.access.enabled = true;
    await assert.rejects(searchPurchaseOrdersByProject(projectId, { ...ctx, roles: ["SITE_FOREMAN"] }), forbidden);
    f.project.tenantId = "tenant-b";
    await assert.rejects(searchPurchaseOrdersByProject(projectId, { ...ctx }, { status: "unknown" }), forbidden);
    f.project.tenantId = ctx.tenantId;
    f.project.companyId = "company-b";
    await assert.rejects(searchPurchaseRequestsByProject(projectId, { ...ctx }), forbidden);
    f.project.companyId = null;
    f.access.scoped = true;
    f.access.member = false;
    clearProjectAccessModeCache();
    await assert.rejects(searchPurchaseRequestsByProject(projectId, { ...ctx, roles: ["SITE_FOREMAN"] }), forbidden);
    assert.equal(f.reads.length, 0);
    assert.equal(f.counts.length, 0);
  });
});

test("bounded reads keep relation guards for orders and requests", async () => {
  await withFixture(async (f) => {
    const conflict = (error: unknown) => error instanceof ServiceError && error.code === "CONFLICT";
    f.orders.push(order(1, { supplierContact: { tenantId: "tenant-b", legalName: "Hidden supplier", fantasyName: null } }));
    await assert.rejects(searchPurchaseOrdersByProject(projectId, { ...ctx }), conflict);
    f.requests.push(request(1, { quotes: [{ tenantId: ctx.tenantId, supplierContact: { tenantId: "tenant-b" } }] }));
    await assert.rejects(searchPurchaseRequestsByProject(projectId, { ...ctx }), conflict);
  });
});

test("existing unbounded list callers retain their records and order without a count query", async () => {
  await withFixture(async (f) => {
    f.requests.push(...Array.from({ length: 35 }, (_, i) => request(i + 1)));
    f.orders.push(...Array.from({ length: 35 }, (_, i) => order(i + 1)));
    const requests = await listPurchaseRequestsByProject(projectId, { ...ctx });
    const orders = await listPurchaseOrdersByProject(projectId, { ...ctx });
    assert.equal(requests.length, 35);
    assert.equal(requests[0]!.number, 35);
    assert.equal(orders.length, 35);
    assert.equal(orders[0]!.number, 1);
    assert.equal(f.counts.length, 0);
    assert.ok(f.reads.every(({ query }) => query.take === undefined));
  });
});

test("search tool totals and truncation describe matches rather than the bounded page", async () => {
  await withFixture(async (f) => {
    f.requests.push(...Array.from({ length: 35 }, (_, i) => request(i + 1)));
    f.orders.push(...Array.from({ length: 35 }, (_, i) => order(i + 1)));
    for (const tool of [searchPurchaseRequestsTool, searchPurchaseOrdersTool]) {
      const result = await tool.execute(aiContext(), { limit: 2 });
      assert.deepEqual(result.truncation, { total: 35, returned: 2 });
      assert.equal((result.data as { total: number }).total, 35);
      assert.equal(result.provenance.entityId, projectId);
    }
    assert.ok(f.reads.every(({ query }) => query.take === 2));
  });
});

test("pending tool queries at most ten orders per pending group and keeps hub counts", async () => {
  await withFixture(async (f) => {
    f.orders.push(...Array.from({ length: 15 }, (_, i) => order(i + 1)));
    f.orders.push(...Array.from({ length: 12 }, (_, i) => order(i + 16, { status: "CONFIRMED" })));
    f.orders.push(order(50, { status: "RECEIVED" }));
    const result = await getPendingPurchaseOrdersTool.execute(aiContext(), {});
    const data = result.data as { hub: { submitted: number; confirmedOpen: number }; pendingApproval: unknown[]; pendingReceipt: unknown[] };
    assert.equal(data.hub.submitted, 15);
    assert.equal(data.hub.confirmedOpen, 12);
    assert.equal(data.pendingApproval.length, 10);
    assert.equal(data.pendingReceipt.length, 10);
    assert.equal(f.reads.length, 2);
    assert.ok(f.reads.every(({ query }) => query.take === 10));
  });
});

test("search bounds are enforced even outside the tool schema and default to twenty", async () => {
  await withFixture(async (f) => {
    for (const limit of [0, -1, 31, 1.5, Number.NaN]) {
      await assert.rejects(searchPurchaseOrdersByProject(projectId, { ...ctx }, { limit }), (error: unknown) => error instanceof ServiceError && error.code === "VALIDATION");
    }
    assert.equal(f.reads.length, 0);
    await searchPurchaseRequestsByProject(projectId, { ...ctx });
    assert.equal(f.reads[0]!.query.take, 20);
  });
});
