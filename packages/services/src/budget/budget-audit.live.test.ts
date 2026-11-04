/** Maintained SQL regressions; writes only to an explicitly verified disposable audit DB. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it, type TestContext } from "node:test";
import { setTimeout as delay } from "node:timers/promises";

import { prisma, type Prisma } from "@bloqer/database";
import { clearProjectAccessModeCache } from "../security/access";
import { assertAuditDatabaseIdentity } from "../testing/audit-fixture";
import { ServiceError, type ServiceContext } from "../types";
import { getApprovedBudgetEditsPolicy, updateProjectApprovedBudgetEditsPolicy, updateTenantApprovedBudgetEditsPolicy } from "./approved-budget-edits.service";
import { updateBudgetSettings } from "./budget-settings.service";
import {
  approveBudget, cancelBudget, closeBudget, createBudget, getBudgetById, getBudgetLifecycleLog,
  listBudgetsByProject, lockBudgetForEconomicEdit, submitBudgetForReview, updateBudget,
} from "./budget.service";

const live = process.env.BLOQER_AUDIT_LIVE === "1";
const conflict = (error: unknown) => error instanceof ServiceError && error.code === "CONFLICT";
const forbidden = (error: unknown) => error instanceof ServiceError && error.code === "FORBIDDEN";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

/** Pause after real SQL, preserving the actual transaction and all delegates. */
function observeTransactionQueries(t: TestContext, onQuery: (sql: string, tx: Prisma.TransactionClient) => Promise<void>) {
  type Operation = (tx: Prisma.TransactionClient) => Promise<unknown>;
  type Options = { timeout?: number; maxWait?: number };
  const original = prisma.$transaction;
  const transact = original.bind(prisma) as (operation: Operation, options?: Options) => Promise<unknown>;
  (prisma as unknown as Record<string, unknown>)["$transaction"] = (operation: Operation, options?: Options) => transact(async (tx) => {
    const query = tx.$queryRaw.bind(tx) as (parts: unknown, ...values: unknown[]) => Promise<unknown>;
    const wrapped = new Proxy(tx, {
      get(target, property) {
        if (property === "$queryRaw") return async (parts: unknown, ...values: unknown[]) => {
          const result = await query(parts, ...values);
          await onQuery(Array.isArray(parts) ? parts.join("") : String(parts), tx);
          return result;
        };
        const value: unknown = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    return operation(wrapped);
  }, options);
  t.after(() => { (prisma as unknown as Record<string, unknown>)["$transaction"] = original; });
}

describe("AG-04 budgets: lifecycle, isolation, rollback and policy locks", { skip: !live, concurrency: false }, () => {
  const tenantId = randomUUID();
  const companyId = randomUUID();
  const otherCompanyId = randomUUID();
  const clientId = randomUUID();
  const actorId = randomUUID();
  const ctx: ServiceContext = { tenantId, companyId, actorUserId: actorId, roles: ["OWNER"] };
  const otherCompany: ServiceContext = { ...ctx, companyId: otherCompanyId };
  const missingActor: ServiceContext = { ...ctx, actorUserId: randomUUID() };
  let verified = false;

  async function project(shared = false) {
    return prisma.project.create({ data: {
      tenantId, companyId: shared ? null : companyId, clientContactId: clientId,
      code: randomUUID(), name: "Synthetic budget audit", status: "ACTIVE", country: "AR",
    } });
  }

  async function draft(projectId: string, currency = "ARS") {
    return createBudget({ projectId, name: "Synthetic audit budget", currency }, ctx);
  }

  async function item(budgetId: string, quantity = "1", unit = "un") {
    const node = await prisma.wbsNode.create({ data: { budgetId, code: randomUUID(), name: "Synthetic item", type: "ITEM" } });
    const leaf = await prisma.costItem.create({ data: { budgetId, wbsNodeId: node.id, quantity, unit } });
    await prisma.costAnalysisLine.create({ data: { budgetId, costItemId: leaf.id, category: "MATERIAL", description: "Synthetic resource", unit: "un", coefficient: "1", unitCost: "100", totalCost: "100" } });
    return leaf;
  }

  async function approvedBudget() {
    const p = await project();
    const b = await draft(p.id);
    await item(b.id);
    await updateBudgetSettings(b.id, { profitPct: 10 }, ctx);
    await submitBudgetForReview(b.id, ctx);
    await approveBudget(b.id, ctx);
    await updateTenantApprovedBudgetEditsPolicy({ allow: true }, ctx);
    await updateProjectApprovedBudgetEditsPolicy({ projectId: p.id, allow: true }, ctx);
    return { p, b };
  }

  async function waitForBlockedWriter(pid: number) {
    const deadline = Date.now() + 8_000;
    do {
      const rows = await prisma.$queryRaw<Array<{ waiting: boolean }>>`
        SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE ${pid} = ANY(pg_blocking_pids(pid))) AS waiting`;
      if (rows[0]?.waiting) return;
      await delay(25);
    } while (Date.now() < deadline);
    assert.fail("Expected the real service transaction to wait on the held row lock");
  }

  async function whileLocked(
    kind: "tenant" | "project", id: string,
    mutation: (tx: Prisma.TransactionClient) => Promise<unknown>,
    concurrent: (pid: number, release: () => void) => Promise<void>,
  ) {
    const released = deferred<void>();
    const ready = deferred<number>();
    const holding = prisma.$transaction(async (tx) => {
      if (kind === "tenant") await tx.$queryRaw`SELECT id FROM tenants WHERE id = ${id} FOR NO KEY UPDATE`;
      else await tx.$queryRaw`SELECT id FROM projects WHERE id = ${id} AND "tenantId" = ${tenantId} FOR NO KEY UPDATE`;
      const [row] = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`;
      assert.ok(row);
      ready.resolve(row.pid);
      await released.promise;
      await mutation(tx);
    }, { timeout: 30_000, maxWait: 10_000 });
    void holding.catch(() => ready.resolve(-1));
    try { await concurrent(await ready.promise, () => released.resolve()); }
    finally { released.resolve(); await holding; }
  }

  before(async () => {
    await assertAuditDatabaseIdentity(prisma);
    verified = true;
    clearProjectAccessModeCache();
    await prisma.$transaction(async (tx) => {
      await tx.tenant.create({ data: { id: tenantId, name: "Synthetic AG04 budget audit", slug: `audit-budget-${tenantId}` } });
      await tx.company.createMany({ data: [companyId, otherCompanyId].map((id) => ({ id, tenantId, name: "Synthetic budget company" })) });
      await tx.user.create({ data: { id: actorId, email: `audit-budget-${actorId}@example.test`, status: "ACTIVE" } });
      await tx.userMembership.create({ data: { tenantId, companyId, userId: actorId, roles: ["OWNER"] } });
      await tx.contact.create({ data: { id: clientId, tenantId, legalName: "Synthetic audit client" } });
      await tx.contactRole.create({ data: { tenantId, contactId: clientId, role: "CLIENT" } });
    });
  });

  after(async () => {
    clearProjectAccessModeCache();
    if (!verified) return;
    await prisma.$transaction(async (tx) => {
      await tx.auditLog.deleteMany({ where: { tenantId } });
      await tx.costAnalysisLine.deleteMany({ where: { budget: { tenantId } } });
      await tx.costItem.deleteMany({ where: { budget: { tenantId } } });
      await tx.wbsNode.deleteMany({ where: { budget: { tenantId } } });
      await tx.budgetSettings.deleteMany({ where: { budget: { tenantId } } });
      await tx.budget.deleteMany({ where: { tenantId } });
      await tx.projectMembership.deleteMany({ where: { tenantId } });
      await tx.project.deleteMany({ where: { tenantId } });
      await tx.contactRole.deleteMany({ where: { tenantId } });
      await tx.contact.deleteMany({ where: { tenantId } });
      await tx.userMembership.deleteMany({ where: { tenantId } });
      await tx.tenantModuleSetting.deleteMany({ where: { tenantId } });
      await tx.company.deleteMany({ where: { tenantId } });
      await tx.tenant.deleteMany({ where: { id: tenantId } });
      await tx.user.deleteMany({ where: { id: actorId } });
    }, { timeout: 30_000 });
    await prisma.$disconnect();
  });

  it("preserves D-121 cancellation origins and rejects approved or closed budgets", async () => {
    const p = await project();
    const statuses = ["DRAFT", "IN_REVIEW", "RETURNED_FOR_CHANGES", "APPROVED", "CLOSED"] as const;
    const rows = statuses.map((status, index) => ({ id: randomUUID(), tenantId, companyId, projectId: p.id, name: `Synthetic cancellation ${status}`, versionNumber: index + 1, status }));
    await prisma.budget.createMany({ data: rows });
    for (const row of rows.slice(0, 3)) {
      assert.equal((await cancelBudget(row.id, ctx)).status, "CANCELLED");
      assert.equal(await prisma.auditLog.count({ where: { tenantId, entityId: row.id, action: "budget.cancelled" } }), 1);
    }
    for (const row of rows.slice(3)) {
      await assert.rejects(() => cancelBudget(row.id, ctx), conflict);
      assert.equal((await prisma.budget.findUniqueOrThrow({ where: { id: row.id } })).status, row.status);
    }
  });

  it("assigns unique monotonic versions under concurrent creation", async () => {
    const p = await project();
    const rows = await Promise.all([draft(p.id), draft(p.id)]);
    assert.deepEqual(rows.map((b) => b.versionNumber).sort(), [1, 2]);
    assert.equal(await prisma.auditLog.count({ where: { tenantId, projectId: p.id, action: "budget.created" } }), 2);
  });

  it("inherits the parent's currency/settings and approves an addendum beside its principal D-116", async () => {
    const p = await project();
    const base = await createBudget({ projectId: p.id, name: "Synthetic USD principal", currency: "USD", overheadPct: 12.3456, financialCostPct: 40, financialDaysAvg: 180, profitPct: 15, taxPct: 21 }, ctx);
    await submitBudgetForReview(base.id, ctx);
    await approveBudget(base.id, ctx);
    const child = await createBudget({ projectId: p.id, name: "Synthetic addendum", parentBudgetId: base.id }, ctx);
    assert.equal(child.currency, "USD");
    assert.equal(child.settings?.overheadPct.toString(), "12.3456");
    assert.equal(child.settings?.financialDaysAvg, 180);
    await submitBudgetForReview(child.id, ctx);
    assert.equal((await approveBudget(child.id, ctx)).status, "APPROVED");
    assert.equal((await getBudgetById(base.id, ctx)).status, "APPROVED");
    const competitor = await draft(p.id);
    await submitBudgetForReview(competitor.id, ctx);
    await assert.rejects(() => approveBudget(competitor.id, ctx), conflict);
  });

  it("prevents approval of imported quantity/unit placeholders even after an APU is present", async () => {
    const b = await draft((await project()).id);
    const leaf = await item(b.id, "0", "");
    await submitBudgetForReview(b.id, ctx);
    await assert.rejects(() => approveBudget(b.id, ctx), conflict);
    await prisma.costItem.update({ where: { id: leaf.id }, data: { quantity: "1", unit: " " } });
    await assert.rejects(() => approveBudget(b.id, ctx), conflict);
    await prisma.costItem.update({ where: { id: leaf.id }, data: { unit: "un" } });
    assert.equal((await approveBudget(b.id, ctx)).status, "APPROVED");
  });

  it("keeps the approval snapshots while recalculating live totals under D-088", async () => {
    const { b } = await approvedBudget();
    await updateBudgetSettings(b.id, { profitPct: 20 }, ctx);
    const current = await getBudgetById(b.id, ctx);
    assert.equal(current.totalCost.toString(), "100");
    assert.equal(current.totalSalePrice.toString(), "120");
    assert.equal(current.approvedSnapshotTotalCost?.toString(), "100");
    assert.equal(current.approvedSnapshotTotalSalePrice?.toString(), "110");
    const event = await prisma.auditLog.findFirstOrThrow({ where: { tenantId, action: "budget_settings.updated", entityId: current.settings!.id, after: { path: ["approvedEditOverride"], equals: true } } });
    assert.equal(event.projectId, current.projectId);
    assert.equal(event.companyId, companyId);
    await closeBudget(b.id, ctx);
    await assert.rejects(() => updateBudgetSettings(b.id, { profitPct: 30 }, ctx), conflict);
    await assert.rejects(() => updateBudget(b.id, { name: "Cannot rename contractual scope" }, ctx), conflict);
    await updateBudget(b.id, { internalNotes: "Allowed closed metadata" }, ctx);
    assert.equal((await getBudgetById(b.id, ctx)).internalNotes, "Allowed closed metadata");
  });

  it("rolls back settings, totals, actor and audit together when audit fails", async () => {
    const b = await draft((await project()).id);
    await item(b.id);
    await assert.rejects(() => updateBudgetSettings(b.id, { profitPct: 30 }, missingActor));
    const current = await getBudgetById(b.id, ctx);
    assert.equal(current.settings?.profitPct.toString(), "0");
    assert.equal(current.totalSalePrice.toString(), "0");
    assert.equal(await prisma.auditLog.count({ where: { tenantId, action: "budget_settings.updated", entityId: current.settings!.id } }), 0);
  });

  it("rolls back settings and totals after a derived Decimal overflow without persisting a partial change", async () => {
    const b = await draft((await project()).id);
    const leaf = await item(b.id);
    await prisma.costAnalysisLine.updateMany({ where: { costItemId: leaf.id }, data: { unitCost: "50000000000000", totalCost: "50000000000000" } });
    await updateBudgetSettings(b.id, { profitPct: 0 }, ctx);
    const auditCount = await prisma.auditLog.count({ where: { tenantId, action: "budget_settings.updated", entityId: b.settings!.id } });
    await assert.rejects(() => updateBudgetSettings(b.id, { profitPct: 100 }, ctx), (error: unknown) => error instanceof ServiceError && error.code === "VALIDATION");
    const current = await getBudgetById(b.id, ctx);
    assert.equal(current.settings?.profitPct.toString(), "0");
    assert.equal(current.totalSalePrice.toString(), "50000000000000");
    assert.equal(await prisma.auditLog.count({ where: { tenantId, action: "budget_settings.updated", entityId: b.settings!.id } }), auditCount);
  });

  it("rolls back each D-088 flag when its audit cannot be persisted", async () => {
    const { p } = await approvedBudget();
    await assert.rejects(() => updateTenantApprovedBudgetEditsPolicy({ allow: false }, missingActor));
    assert.equal((await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } })).allowApprovedBudgetEconomicEdits, true);
    await assert.rejects(() => updateProjectApprovedBudgetEditsPolicy({ projectId: p.id, allow: false }, missingActor));
    assert.equal((await prisma.project.findUniqueOrThrow({ where: { id: p.id } })).allowApprovedBudgetEconomicEdits, true);
  });

  it("isolates company-owned budgets under a shared project, while retaining shared budgets", async () => {
    const p = await project(true);
    const privateBudget = await draft(p.id);
    const shared = await prisma.budget.create({ data: { projectId: p.id, tenantId, companyId: null, versionNumber: 2, name: "Synthetic shared budget" } });
    const rows = await listBudgetsByProject(p.id, otherCompany);
    assert.deepEqual(rows.map((b) => b.id), [shared.id]);
    await assert.rejects(() => getBudgetById(privateBudget.id, otherCompany), forbidden);
    await assert.rejects(() => getBudgetLifecycleLog(privateBudget.id, otherCompany), forbidden);
    await assert.rejects(() => updateBudget(privateBudget.id, { internalNotes: "Denied" }, otherCompany), forbidden);
    await assert.rejects(() => updateBudgetSettings(privateBudget.id, { profitPct: 30 }, otherCompany), forbidden);
    await assert.rejects(() => createBudget({ projectId: p.id, name: "Denied child", parentBudgetId: privateBudget.id }, otherCompany), (e: unknown) => e instanceof ServiceError && e.code === "NOT_FOUND");
    assert.equal((await getBudgetById(shared.id, otherCompany)).id, shared.id);
  });

  it("applies the disabled BUDGETS gate to direct reads, settings and lifecycle actions", async (t) => {
    const p = await project();
    const b = await draft(p.id);
    await prisma.tenantModuleSetting.create({ data: { tenantId, moduleKey: "BUDGETS", isEnabled: false } });
    t.after(async () => { await prisma.tenantModuleSetting.deleteMany({ where: { tenantId, moduleKey: "BUDGETS" } }); });
    for (const action of [
      () => getBudgetById(b.id, ctx), () => listBudgetsByProject(p.id, ctx), () => getBudgetLifecycleLog(b.id, ctx),
      () => createBudget({ projectId: p.id, name: "Denied" }, ctx), () => updateBudget(b.id, { name: "Denied" }, ctx),
      () => updateBudgetSettings(b.id, { taxPct: 21 }, ctx), () => submitBudgetForReview(b.id, ctx),
    ]) await assert.rejects(action, forbidden);
    assert.equal((await prisma.budget.findUniqueOrThrow({ where: { id: b.id } })).status, "DRAFT");
  });

  it("protects budget details and lifecycle history with project ACL and absolute tenant scope", async (t) => {
    const p = await project();
    const b = await draft(p.id);
    await prisma.tenant.update({ where: { id: tenantId }, data: { projectAccessMode: "MEMBERSHIP_SCOPED" } });
    clearProjectAccessModeCache();
    t.after(async () => {
      await prisma.tenant.update({ where: { id: tenantId }, data: { projectAccessMode: "TENANT_WIDE" } });
      clearProjectAccessModeCache();
    });
    const unassigned: ServiceContext = { ...ctx, roles: ["PROJECT_MANAGER"] };
    await assert.rejects(() => getBudgetById(b.id, unassigned), forbidden);
    await assert.rejects(() => getBudgetLifecycleLog(b.id, unassigned), forbidden);
    await assert.rejects(() => updateBudgetSettings(b.id, { profitPct: 40 }, unassigned), forbidden);
    const otherTenant: ServiceContext = { ...ctx, tenantId: randomUUID() };
    await assert.rejects(() => getBudgetById(b.id, otherTenant), forbidden);
    await assert.rejects(() => getBudgetLifecycleLog(b.id, otherTenant), forbidden);
  });

  it("does not grant economic edits or policy toggles through a read-only role", async () => {
    const p = await project();
    const b = await draft(p.id);
    const finance: ServiceContext = { ...ctx, roles: ["FINANCE"] };
    const pm: ServiceContext = { ...ctx, roles: ["PROJECT_MANAGER"] };
    await assert.rejects(() => updateBudgetSettings(b.id, { taxPct: 21 }, finance), forbidden);
    await assert.rejects(() => approveBudget(b.id, pm), forbidden);
    await assert.rejects(() => updateTenantApprovedBudgetEditsPolicy({ allow: true }, pm), forbidden);
    await assert.rejects(() => updateProjectApprovedBudgetEditsPolicy({ projectId: p.id, allow: true }, pm), forbidden);
  });

  it("rechecks Project state after waiting for a concurrent pause", async () => {
    const p = await project();
    const b = await draft(p.id);
    await whileLocked("project", p.id, (tx) => tx.project.update({ where: { id: p.id }, data: { status: "ON_HOLD" } }), async (pid, release) => {
      const pending = updateBudgetSettings(b.id, { profitPct: 20 }, ctx).then(() => null, (error: unknown) => error);
      await waitForBlockedWriter(pid);
      release();
      assert.ok(conflict(await pending));
    });
    assert.equal((await prisma.budgetSettings.findUniqueOrThrow({ where: { budgetId: b.id } })).profitPct.toString(), "0");
  });

  it("rechecks the budget lifecycle after a concurrent submit", async () => {
    const p = await project();
    const b = await draft(p.id);
    await whileLocked("project", p.id, (tx) => tx.budget.update({ where: { id: b.id }, data: { status: "IN_REVIEW" } }), async (pid, release) => {
      const pending = updateBudgetSettings(b.id, { taxPct: 21 }, ctx).then(() => null, (error: unknown) => error);
      await waitForBlockedWriter(pid);
      release();
      assert.ok(conflict(await pending));
    });
    assert.equal((await prisma.budgetSettings.findUniqueOrThrow({ where: { budgetId: b.id } })).taxPct.toString(), "0");
  });

  it("waits for tenant policy revocation and rejects the stale approved edit", async () => {
    const { b } = await approvedBudget();
    await whileLocked("tenant", tenantId, (tx) => tx.tenant.update({ where: { id: tenantId }, data: { allowApprovedBudgetEconomicEdits: false } }), async (pid, release) => {
      const pending = updateBudgetSettings(b.id, { profitPct: 40 }, ctx).then(() => null, (error: unknown) => error);
      await waitForBlockedWriter(pid);
      release();
      assert.ok(conflict(await pending));
    });
    assert.equal((await prisma.budgetSettings.findUniqueOrThrow({ where: { budgetId: b.id } })).profitPct.toString(), "10");
  });

  it("holds the policy lock until an approved economic edit and its audit commit", async (t) => {
    const { b } = await approvedBudget();
    const acquired = deferred<number>();
    const released = deferred<void>();
    let paused = false;
    observeTransactionQueries(t, async (sql, tx) => {
      if (!paused && sql.includes("FROM tenants") && sql.includes("FOR SHARE")) {
        paused = true;
        const [row] = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`;
        acquired.resolve(row!.pid);
        await released.promise;
      }
    });
    const edit = updateBudgetSettings(b.id, { profitPct: 20 }, ctx);
    void edit.catch(() => acquired.resolve(-1));
    const pid = await acquired.promise;
    const revoke = updateTenantApprovedBudgetEditsPolicy({ allow: false }, ctx);
    try { await waitForBlockedWriter(pid); }
    finally { released.resolve(); }
    await Promise.all([edit, revoke]);
    assert.equal((await prisma.budgetSettings.findUniqueOrThrow({ where: { budgetId: b.id } })).profitPct.toString(), "20");
    assert.equal((await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } })).allowApprovedBudgetEconomicEdits, false);
    const view = await getApprovedBudgetEditsPolicy(ctx);
    assert.equal(view.tenantAllow, false);
  });

  it("the internal economic lock itself enforces company scope before dependent writes", async () => {
    const p = await project(true);
    const b = await draft(p.id);
    await assert.rejects(() => prisma.$transaction((tx) => lockBudgetForEconomicEdit(tx, b.id, otherCompany)), forbidden);
  });
});
