import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { setTimeout as delay } from "node:timers/promises";

import { prisma, type Prisma } from "@bloqer/database";
import { activateProject, completeProject, createProject, getProjectById } from "../project/project.service";
import { clearProjectAccessModeCache } from "../security/access";
import { assertAuditDatabaseIdentity } from "../testing/audit-fixture";
import { ServiceError, type ServiceContext } from "../types";
import { assignContactRole, createContact, getContactById, removeContactRole, updateClientProfile } from "./contact.service";

type TransactionRunner = (
  operation: (tx: Prisma.TransactionClient) => Promise<unknown>,
  options?: { maxWait?: number; timeout?: number },
) => Promise<unknown>;

describe("AG-03 CLIENT/project concurrency on isolated SQL", {
  skip: process.env.BLOQER_AUDIT_LIVE !== "1", concurrency: false,
}, () => {
  const tenantId = randomUUID();
  const companyId = randomUUID();
  const actorUserId = randomUUID();
  const ctx: ServiceContext = { tenantId, companyId, actorUserId, roles: ["OWNER"] };
  let verified = false;
  const conflict = (error: unknown) => error instanceof ServiceError && error.code === "CONFLICT";
  const client = () => createContact({ legalName: `Synthetic CLIENT ${randomUUID()}`, initialRole: "CLIENT" }, ctx);
  const project = (clientContactId: string) => createProject({ code: randomUUID(), name: "Synthetic client concurrency", type: "PRIVATE", clientContactId }, ctx);

  before(async () => {
    await assertAuditDatabaseIdentity(prisma);
    verified = true;
    clearProjectAccessModeCache();
    await prisma.tenant.create({ data: { id: tenantId, name: "Synthetic CLIENT concurrency", slug: `audit-client-${tenantId}` } });
    await prisma.company.create({ data: { id: companyId, tenantId, name: "Synthetic CLIENT concurrency" } });
    await prisma.user.create({ data: { id: actorUserId, email: `audit-client-${actorUserId}@example.invalid`, status: "ACTIVE" } });
    await prisma.userMembership.create({ data: { tenantId, companyId, userId: actorUserId, roles: ["OWNER"] } });
  });

  after(async () => {
    try {
      if (!verified) return;
      await prisma.$transaction(async (tx) => {
        await tx.auditLog.deleteMany({ where: { tenantId } });
        await tx.projectMembership.deleteMany({ where: { tenantId } });
        await tx.projectTeamMember.deleteMany({ where: { tenantId } });
        await tx.project.deleteMany({ where: { tenantId } });
        await tx.clientProfile.deleteMany({ where: { contact: { tenantId } } });
        await tx.contactRole.deleteMany({ where: { tenantId } });
        await tx.contact.deleteMany({ where: { tenantId } });
        await tx.userMembership.deleteMany({ where: { tenantId } });
        await tx.company.deleteMany({ where: { tenantId } });
        await tx.tenant.deleteMany({ where: { id: tenantId } });
        await tx.user.deleteMany({ where: { id: actorUserId } });
      }, { timeout: 30_000 });
    } finally {
      clearProjectAccessModeCache();
      await prisma.$disconnect();
    }
  });

  async function waitForBlockedWriter(pid: number): Promise<void> {
    const deadline = Date.now() + 5_000;
    do {
      const rows = await prisma.$queryRaw<Array<{ waiting: boolean }>>`
        SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE ${pid} = ANY(pg_blocking_pids(pid))) AS waiting`;
      if (rows[0]?.waiting) return;
      await delay(25);
    } while (Date.now() < deadline);
    assert.fail("Expected the second service to wait on the Contact row lock");
  }

  /** Pause the actual first service after its real SQL lock, without replacing DB writes. */
  async function interleave(first: () => Promise<unknown>, second: () => Promise<unknown>) {
    const saved = prisma.$transaction;
    const run = saved.bind(prisma) as TransactionRunner;
    let pauseNext = true;
    let locked!: (pid: number) => void;
    let rejectReady!: (error: unknown) => void;
    let release!: () => void;
    const ready = new Promise<number>((resolve, reject) => { locked = resolve; rejectReady = reject; });
    const released = new Promise<void>((resolve) => { release = resolve; });
    prisma.$transaction = (async (
      operation: (tx: Prisma.TransactionClient) => Promise<unknown>,
      options?: { maxWait?: number; timeout?: number },
    ) => {
      const pause = pauseNext;
      pauseNext = false;
      return run(async (tx) => {
        if (!pause) return operation(tx);
        const query = tx.$queryRaw.bind(tx) as (...args: unknown[]) => Promise<unknown>;
        const proxy = new Proxy(tx, {
          get(target, key) {
            if (key !== "$queryRaw") return Reflect.get(target, key);
            return async (...args: unknown[]) => {
              const result = await query(...args);
              const sql = Array.isArray(args[0]) ? args[0].join("?") : "";
              if (/FROM contacts.*FOR NO KEY UPDATE/.test(sql)) {
                const [backend] = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`;
                assert.ok(backend);
                locked(backend.pid);
                await released;
              }
              return result;
            };
          },
        });
        return operation(proxy);
      }, { ...options, maxWait: 10_000, timeout: 20_000 });
    }) as typeof prisma.$transaction;
    let firstResult: Promise<PromiseSettledResult<unknown>> | undefined;
    let secondResult: Promise<PromiseSettledResult<unknown>> | undefined;
    try {
      firstResult = first().then(
        (value) => ({ status: "fulfilled", value } as const),
        (reason: unknown) => { rejectReady(reason); return { status: "rejected", reason } as const; },
      );
      const pid = await ready;
      secondResult = second().then(
        (value) => ({ status: "fulfilled", value } as const),
        (reason: unknown) => ({ status: "rejected", reason } as const),
      );
      await waitForBlockedWriter(pid);
      release();
      return [await firstResult, await secondResult] as const;
    } finally {
      release();
      await firstResult;
      await secondResult;
      prisma.$transaction = saved;
    }
  }

  it("a CLIENT removal that commits first makes project creation reject its stale role preflight", async () => {
    const contact = await client();
    const [removed, created] = await interleave(
      () => removeContactRole(contact.id, "CLIENT", ctx), () => project(contact.id),
    );
    assert.equal(removed.status, "fulfilled");
    assert.ok(created.status === "rejected" && conflict(created.reason));
    assert.equal(await prisma.project.count({ where: { tenantId, clientContactId: contact.id } }), 0);
    assert.equal((await prisma.contactRole.findUniqueOrThrow({ where: { contactId_role: { contactId: contact.id, role: "CLIENT" } } })).status, "INACTIVE");
  });

  it("project creation that commits first blocks a CLIENT removal whose project preflight was empty", async () => {
    const contact = await client();
    const [created, removed] = await interleave(
      () => project(contact.id), () => removeContactRole(contact.id, "CLIENT", ctx),
    );
    assert.equal(created.status, "fulfilled");
    assert.ok(removed.status === "rejected" && conflict(removed.reason));
    assert.equal(await prisma.project.count({ where: { tenantId, clientContactId: contact.id } }), 1);
    assert.equal((await prisma.contactRole.findUniqueOrThrow({ where: { contactId_role: { contactId: contact.id, role: "CLIENT" } } })).status, "ACTIVE");
  });

  it("a completed project's historical client reference and profile survive removing and reactivating CLIENT", async () => {
    const contact = await client();
    await updateClientProfile(contact.id, { creditLimit: "123.45", notes: "Historical commercial profile" }, ctx);
    const created = await project(contact.id);
    await activateProject(created.id, ctx);
    await completeProject(created.id, ctx);
    await removeContactRole(contact.id, "CLIENT", ctx);
    assert.equal((await getProjectById(created.id, ctx)).clientContactId, contact.id);
    const inactive = await getContactById(contact.id, ctx);
    assert.equal(inactive.roles.find((role) => role.role === "CLIENT")?.status, "INACTIVE");
    assert.equal(inactive.clientProfile?.creditLimit?.toFixed(2), "123.45");
    await assignContactRole(contact.id, { role: "CLIENT", creditLimit: "999" }, ctx);
    const reactivated = await getContactById(contact.id, ctx);
    assert.equal(reactivated.roles.find((role) => role.role === "CLIENT")?.status, "ACTIVE");
    assert.equal(reactivated.clientProfile?.notes, "Historical commercial profile");
    assert.equal(reactivated.clientProfile?.creditLimit?.toFixed(2), "123.45");
  });
});
