import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as access from "./field-pending-access";
import { assertOperationalExportLimit } from "../report-exports/operational-list-export-pure";
import { ServiceError, type ServiceContext } from "../types";

const projectId = "00000000-0000-4000-8000-000000000010";
const ctx: ServiceContext = { tenantId: "tenant-a", companyId: "company-a", actorUserId: "user-a", roles: ["WAREHOUSE"] };

function loadInbox(total = 123, denied = false) {
  const queries: Array<{ take?: number; where: Record<string, unknown> }> = [];
  const rows = Array.from({ length: Math.min(total, 123) }, (_, i) => ({
    id: `order-${i}`, number: i, totalAmount: "123.45", currency: "ARS", createdAt: new Date("2026-11-01"),
    confirmedAt: new Date("2026-11-02"), expectedDeliveryDate: new Date("2026-11-03"), status: "CONFIRMED",
    createdBy: "user-a", originRequestedByUserId: null, projectId,
    project: { code: "PR-1", name: "Obra" }, supplierContact: { legalName: "Proveedor", fantasyName: null },
  }));
  const dependencies: Record<string, unknown> = {
    "../types": { ServiceError },
    "@bloqer/database": { Prisma: {}, prisma: { purchaseOrder: {
      findMany: async (query: typeof queries[number]) => { queries.push(query); return rows.slice(0, query.take); },
      count: async (query: typeof queries[number]) => { queries.push(query); return total; },
    } } },
    "@bloqer/utils": { productCalendarDateUtc: () => new Date("2026-11-27") },
    "../ap/supplier-invoice-from-po-pure": {},
    "../finance/money-decimal": { serializeMoneyDecimal: (value: string) => value },
    "../finance/pagination": { MAX_EXPORT_ROWS: 10_000 },
    "../report-exports/operational-list-export-pure": { assertOperationalExportLimit },
    "../tenant-modules/tenant-module.service": { getTenantModuleGate: async () => ({ isEnabled: () => true }) },
    "../user/resolve-user-display-names": { resolveUserDisplayNames: async () => new Map([["user-a", "Solicitante"]]) },
    "../company-scope": { companyScopeFilter: () => ({ companyId: "company-a" }) },
    "./field-pending-access": access,
    "../procurement/company-procurement-settings.service": {},
    "../procurement/purchase-order-workflow.service": {},
    "../security/access": {
      requireProjectAccess: async (id: string, context: ServiceContext) => { assert.equal(id, projectId); assert.equal(context, ctx); if (denied) throw new Error("Acceso revocado"); },
      resolveAccessibleProjectScope: async () => ({ projectIds: [projectId] }),
      projectIdWhereForScope: () => ({ projectId: { in: [projectId] } }),
    },
  };
  const code = ts.transpileModule(readFileSync(new URL("./field-pending.service.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  runInNewContext(code, { exports, require(name: string) { assert.ok(name in dependencies, name); return dependencies[name]; } });
  return { queries, api: exports as typeof import("./field-pending.service") };
}

test("complete pending reader retrieves more than 80 from the authorized source and retains scoping", async () => {
  const loaded = loadInbox();
  const list = await loaded.api.getMyFieldPendingItems(ctx, { projectId, complete: true });
  assert.equal(list.items.length, 123);
  assert.equal(list.counts.total, 123);
  assert.ok(list.items.some((item) => item.entityId === "order-122"));
  for (const query of loaded.queries) {
    assert.equal(query.where.tenantId, ctx.tenantId);
    assert.equal(query.where.companyId, ctx.companyId);
    assert.equal(query.where.projectId, projectId);
  }
  const compactRead = await loaded.api.getMyFieldPendingItems(ctx);
  assert.equal(compactRead.items.length, 80, "dashboard consumers retain the existing bounded read");
});

test("count-only reads do not load details; inaccessible project fails before queries", async () => {
  const loaded = loadInbox();
  const result = await loaded.api.getMyFieldPendingCounts(ctx);
  assert.equal(result.total, 123);
  assert.ok(loaded.queries.every((query) => query.take === undefined));
  const denied = loadInbox(123, true);
  await assert.rejects(denied.api.getMyFieldPendingItems(ctx, { projectId, complete: true }), /Acceso revocado/);
  assert.equal(denied.queries.length, 0);
});

test("over-limit full read rejects instead of silently returning a partial export", async () => {
  await assert.rejects(loadInbox(10_001).api.getMyFieldPendingItems(ctx, { complete: true }), /Acotá los filtros/);
});

test("oversized inbox retains scoped actions with a warning while exports still reject", async () => {
  const loaded = loadInbox(10_001);
  const list = await loaded.api.getMyFieldPendingInbox(ctx, { projectId });
  assert.equal(list.items.length, 80);
  assert.equal(list.counts.total, 10_001);
  assert.match(list.limitWarning!, /selección de pendientes/);
  assert.ok(loaded.queries.every((query) => query.where.projectId === projectId && query.where.tenantId === ctx.tenantId && query.where.companyId === ctx.companyId));
  await assert.rejects(loaded.api.getMyFieldPendingItems(ctx, { projectId, complete: true }), /Acotá los filtros/);
  const normal = await loadInbox().api.getMyFieldPendingInbox(ctx, { projectId });
  assert.equal(normal.items.length, 123);
  assert.equal(normal.limitWarning, undefined);
  const denied = loadInbox(123, true);
  await assert.rejects(denied.api.getMyFieldPendingInbox(ctx, { projectId }), /Acceso revocado/);
  assert.equal(denied.queries.length, 0);
});
