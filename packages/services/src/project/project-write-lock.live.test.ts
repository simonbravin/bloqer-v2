/** SQL lock compatibility regressions; restricted to the verified disposable audit database. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, beforeEach, describe, it, type TestContext } from "node:test";
import { setTimeout as delay } from "node:timers/promises";

import { prisma, type Prisma } from "@bloqer/database";
import { clearProjectAccessModeCache } from "../security/access";
import { assertAuditDatabaseIdentity } from "../testing/audit-fixture";
import { ServiceError, type ServiceContext } from "../types";
import { addProjectMembership } from "./project-membership.service";
import { pauseProject, updateProject } from "./project.service";

const live = process.env.BLOQER_AUDIT_LIVE === "1";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

/** Observe real service transactions without replacing any database operation. */
function afterTransactionQuery(
  t: TestContext,
  afterQuery: (sql: string, tx: Prisma.TransactionClient) => Promise<void>,
  afterProjectWrite?: (tx: Prisma.TransactionClient) => Promise<void>,
): void {
  type Operation = (tx: Prisma.TransactionClient) => Promise<unknown>;
  type Options = { timeout?: number; maxWait?: number };
  const original = prisma.$transaction;
  const transact = original.bind(prisma) as (operation: Operation, options?: Options) => Promise<unknown>;
  (prisma as unknown as Record<string, unknown>)["$transaction"] = (operation: Operation, options?: Options) => transact(async (tx) => {
    const query = tx.$queryRaw.bind(tx) as (query: unknown, ...values: unknown[]) => Promise<unknown>;
    const wrapped = new Proxy(tx, {
      get(target, property) {
        if (property === "$queryRaw") {
          return async (parts: unknown, ...values: unknown[]) => {
            const result = await query(parts, ...values);
            const sql = Array.isArray(parts) ? parts.join("") : String(parts);
            await afterQuery(sql, tx);
            return result;
          };
        }
        if (property === "project" && afterProjectWrite) {
          return new Proxy(target.project, {
            get(delegate, method) {
              if (method === "updateMany") {
                const write = delegate.updateMany.bind(delegate) as (args: unknown) => Promise<unknown>;
                return async (args: unknown) => {
                  const result = await write(args);
                  await afterProjectWrite(tx);
                  return result;
                };
              }
              const value: unknown = Reflect.get(delegate, method);
              return typeof value === "function" ? value.bind(delegate) : value;
            },
          });
        }
        const value: unknown = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    return operation(wrapped);
  }, { timeout: 20_000, maxWait: 10_000, ...options });
  t.after(() => { (prisma as unknown as Record<string, unknown>)["$transaction"] = original; });
}

describe("AG-03 project row locks, FK checks and ACL administration", { skip: !live, concurrency: false }, () => {
  const tenantId = randomUUID();
  const companyId = randomUUID();
  const clientId = randomUUID();
  const projectId = randomUUID();
  const actorId = randomUUID();
  const targetId = randomUUID();
  const ctx: ServiceContext = { tenantId, companyId, actorUserId: actorId, roles: ["OWNER"] };
  let verified = false;

  before(async () => {
    await assertAuditDatabaseIdentity(prisma);
    verified = true;
    await prisma.$transaction(async (tx) => {
      await tx.tenant.create({ data: { id: tenantId, name: "Synthetic AG03 locks", slug: `audit-project-lock-${tenantId}` } });
      await tx.company.create({ data: { id: companyId, tenantId, name: "Synthetic lock company" } });
      await tx.contact.create({ data: { id: clientId, tenantId, legalName: "Synthetic lock client" } });
      await tx.contactRole.create({ data: { tenantId, contactId: clientId, role: "CLIENT" } });
      await tx.user.createMany({ data: [actorId, targetId].map((id) => ({ id, email: `audit-project-lock-${id}@example.test`, status: "ACTIVE" })) });
      await tx.userMembership.createMany({ data: [
        { tenantId, companyId, userId: actorId, roles: ["OWNER"] },
        { tenantId, companyId, userId: targetId, roles: ["PROJECT_MANAGER"] },
      ] });
      await tx.project.create({ data: { id: projectId, tenantId, companyId, clientContactId: clientId, code: "LOCK-AUDIT", name: "Synthetic lock project", status: "ACTIVE" } });
    });
  });

  beforeEach(async () => {
    clearProjectAccessModeCache();
    await prisma.project.update({ where: { id: projectId }, data: { status: "ACTIVE", name: "Synthetic lock project" } });
    await prisma.auditLog.deleteMany({ where: { tenantId } });
    await prisma.projectMembership.deleteMany({ where: { tenantId } });
  });

  after(async () => {
    clearProjectAccessModeCache();
    if (!verified) return;
    await prisma.$transaction(async (tx) => {
      await tx.auditLog.deleteMany({ where: { tenantId } });
      await tx.projectMembership.deleteMany({ where: { tenantId } });
      await tx.project.deleteMany({ where: { tenantId } });
      await tx.contactRole.deleteMany({ where: { tenantId } });
      await tx.contact.deleteMany({ where: { tenantId } });
      await tx.userMembership.deleteMany({ where: { tenantId } });
      await tx.company.deleteMany({ where: { tenantId } });
      await tx.tenant.deleteMany({ where: { id: tenantId } });
      await tx.user.deleteMany({ where: { id: { in: [actorId, targetId] } } });
    }, { timeout: 30_000 });
    await prisma.$disconnect();
  });

  it("lets ACL administration insert project FKs while a lifecycle writer waits to audit its tenant", { timeout: 30_000 }, async (t) => {
    const projectLocked = deferred<void>();
    const tenantLocked = deferred<void>();
    afterTransactionQuery(t, async (sql) => {
      if (sql.includes("FROM projects")) {
        projectLocked.resolve();
        await tenantLocked.promise;
      } else if (sql.includes("FROM tenants")) {
        tenantLocked.resolve();
      }
    });
    const lifecycle = pauseProject(projectId, ctx);
    void lifecycle.catch(() => tenantLocked.resolve());
    await projectLocked.promise;
    const admin = addProjectMembership(projectId, targetId, ctx);
    void admin.catch(() => tenantLocked.resolve());
    const results = await Promise.allSettled([lifecycle, admin]);
    assert.deepEqual(results.map((result) => result.status), ["fulfilled", "fulfilled"],
      "Both real services must finish; an FK lock cycle must not abort either transaction");
    assert.equal((await prisma.project.findUniqueOrThrow({ where: { id: projectId } })).status, "ON_HOLD");
    assert.equal(await prisma.projectMembership.count({ where: { tenantId, projectId, userId: targetId } }), 1);
    assert.equal(await prisma.auditLog.count({ where: { tenantId, projectId, action: { in: ["project.paused", "project_membership.added"] } } }), 2);
  });

  it("keeps two project writers exclusive and rejects the stale second edit", { timeout: 30_000 }, async (t) => {
    const locked = deferred<number>();
    const release = deferred<void>();
    let held = false;
    afterTransactionQuery(t, async (sql, tx) => {
      if (sql.includes("FROM projects") && !held) {
        held = true;
        const [row] = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`;
        assert.ok(row);
        locked.resolve(row.pid);
        await release.promise;
      }
    });
    const first = updateProject(projectId, { name: "First writer" }, ctx);
    void first.catch(() => release.resolve());
    const pid = await locked.promise;
    const second = updateProject(projectId, { name: "Stale writer" }, ctx).then(() => null, (error: unknown) => error);
    try {
      const deadline = Date.now() + 5_000;
      let waiting = false;
      do {
        const rows = await prisma.$queryRaw<Array<{ waiting: boolean }>>`SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE ${pid} = ANY(pg_blocking_pids(pid))) AS waiting`;
        waiting = rows[0]?.waiting ?? false;
        if (!waiting) await delay(25);
      } while (!waiting && Date.now() < deadline);
      assert.ok(waiting, "The second writer must wait on the first project's row lock");
    } finally {
      release.resolve();
    }
    await first;
    const error = await second;
    assert.ok(error instanceof ServiceError && error.code === "CONFLICT");
    assert.equal((await prisma.project.findUniqueOrThrow({ where: { id: projectId } })).name, "First writer");
    assert.equal(await prisma.auditLog.count({ where: { tenantId, projectId, action: "project.updated" } }), 1);
  });

  it("commits a code key edit and concurrent ACL administration without an FK lock cycle", { timeout: 30_000 }, async (t) => {
    const updated = deferred<number>();
    const release = deferred<void>();
    afterTransactionQuery(t, async () => undefined, async (tx) => {
      // The real UPDATE has already run: PostgreSQL may have escalated its row lock.
      const [row] = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`;
      assert.ok(row);
      updated.resolve(row.pid);
      await release.promise;
    });
    const writer = updateProject(projectId, { code: "LOCK-AUDIT-CHANGED" }, ctx);
    void writer.catch(() => release.resolve());
    const pid = await updated.promise;
    const admin = addProjectMembership(projectId, targetId, ctx);
    void admin.catch(() => release.resolve());
    try {
      const deadline = Date.now() + 5_000;
      let waiting = false;
      do {
        const rows = await prisma.$queryRaw<Array<{ waiting: boolean }>>`SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE ${pid} = ANY(pg_blocking_pids(pid))) AS waiting`;
        waiting = rows[0]?.waiting ?? false;
        if (!waiting) await delay(25);
      } while (!waiting && Date.now() < deadline);
      assert.ok(waiting, "The concurrent ACL transaction must wait on the paused code writer");
    } finally {
      release.resolve();
    }
    const results = await Promise.allSettled([writer, admin]);
    for (const result of results) {
      if (result.status === "rejected") t.diagnostic(result.reason instanceof Error ? result.reason.message : String(result.reason));
    }
    assert.deepEqual(results.map((result) => result.status), ["fulfilled", "fulfilled"],
      "A code key update must not invert Tenant/admin and Project/audit FK locks");
    assert.equal((await prisma.project.findUniqueOrThrow({ where: { id: projectId } })).code, "LOCK-AUDIT-CHANGED");
    assert.equal(await prisma.projectMembership.count({ where: { tenantId, projectId, userId: targetId } }), 1);
    assert.equal(await prisma.auditLog.count({ where: { tenantId, projectId, action: { in: ["project.updated", "project_membership.added"] } } }), 2);
  });
});
