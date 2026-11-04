/** AG-03 functional SQL regressions. Requires an explicitly verified disposable audit database. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { setTimeout as delay } from "node:timers/promises";

import { prisma, type Prisma } from "@bloqer/database";
import { approveBudget, createBudget, submitBudgetForReview, updateBudget } from "../budget/budget.service";
import { createCertification } from "../certification/certification.service";
import { clearProjectAccessModeCache, filterUserIdsByProjectAccess } from "../security/access";
import { assertAuditDatabaseIdentity } from "../testing/audit-fixture";
import { ServiceError, type ServiceContext } from "../types";
import { getProjectCancellationImpact } from "./project-cancellation-impact.service";
import { addProjectTeamMember, listActiveMembersForProjectTeamPicker, listProjectTeam, removeProjectTeamMember } from "./project-team.service";
import { lockProjectForMutation } from "./project-write-lock";
import {
  activateProject, cancelProject, completeProject, createProject, pauseProject,
  getProjectById, listProjects, reactivateProject, resumeProject, updateProject,
} from "./project.service";

const live = process.env.BLOQER_AUDIT_LIVE === "1";

describe("AG-03 Projects functional SQL audit", { skip: !live, concurrency: false }, () => {
  const tenantId = randomUUID();
  const companyId = randomUUID();
  const clientId = randomUUID();
  const inactiveClientId = randomUUID();
  const actorId = randomUUID();
  const targetId = randomUUID();
  let verified = false;
  const ctx: ServiceContext = { tenantId, companyId, actorUserId: actorId, roles: ["OWNER"] };
  const missingActor: ServiceContext = { ...ctx, actorUserId: randomUUID() };

  const conflict = (error: unknown) => error instanceof ServiceError && error.code === "CONFLICT";
  const validation = (error: unknown) => error instanceof ServiceError && error.code === "VALIDATION";
  function input(code = randomUUID()) {
    return { code, name: "Obra sintética AG03", clientContactId: clientId, type: "PRIVATE" as const };
  }
  async function activeProject() {
    const created = await createProject(input(), ctx);
    return activateProject(created.id, ctx);
  }
  async function budget(projectId: string, status: "APPROVED" | "CLOSED" = "APPROVED") {
    return prisma.budget.create({ data: {
      tenantId, companyId, projectId, versionNumber: 1, name: "Presupuesto sintético", status,
    } });
  }

  async function waitForBlockedWriter(pid: number): Promise<void> {
    const deadline = Date.now() + 5_000;
    do {
      const rows = await prisma.$queryRaw<Array<{ waiting: boolean }>>`
        SELECT EXISTS (
          SELECT 1 FROM pg_stat_activity
          WHERE ${pid} = ANY(pg_blocking_pids(pid))
        ) AS waiting`;
      if (rows[0]?.waiting) return;
      await delay(25);
    } while (Date.now() < deadline);
    assert.fail("Expected the service transaction to wait on the held project row lock");
  }

  async function whileProjectLocked(
    projectId: string,
    write: (tx: Prisma.TransactionClient) => Promise<unknown>,
    concurrent: (pid: number, release: () => void) => Promise<void>,
  ): Promise<void> {
    let release!: () => void;
    let locked!: (pid: number) => void;
    let rejectReady!: (error: unknown) => void;
    const released = new Promise<void>((resolve) => { release = resolve; });
    const ready = new Promise<number>((resolve, reject) => { locked = resolve; rejectReady = reject; });
    const holding = prisma.$transaction(async (tx) => {
      await lockProjectForMutation(tx, projectId, tenantId);
      const [row] = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`;
      assert.ok(row);
      locked(row.pid);
      await released;
      await write(tx);
    }, { timeout: 20_000, maxWait: 10_000 });
    void holding.catch(rejectReady);
    try {
      await concurrent(await ready, release);
    } finally {
      release();
      await holding;
    }
  }

  before(async () => {
    await assertAuditDatabaseIdentity(prisma);
    verified = true;
    clearProjectAccessModeCache();
    await prisma.$transaction(async (tx) => {
      await tx.tenant.create({ data: { id: tenantId, name: "Synthetic AG03", slug: `audit-projects-${tenantId}` } });
      await tx.company.create({ data: { id: companyId, tenantId, name: "Synthetic AG03 company" } });
      await tx.user.createMany({ data: [actorId, targetId].map((id) => ({ id, email: `audit-projects-${id}@example.test`, status: "ACTIVE" })) });
      await tx.userMembership.createMany({ data: [
        { tenantId, companyId, userId: actorId, roles: ["OWNER"] },
        { tenantId, companyId, userId: targetId, roles: ["PROJECT_MANAGER"] },
      ] });
      await tx.contact.createMany({ data: [
        { id: clientId, tenantId, legalName: "Synthetic active client" },
        { id: inactiveClientId, tenantId, legalName: "Synthetic archived client", status: "ARCHIVED" },
      ] });
      await tx.contactRole.createMany({ data: [clientId, inactiveClientId].map((contactId) => ({ tenantId, contactId, role: "CLIENT" })) });
    });
  });

  after(async () => {
    clearProjectAccessModeCache();
    if (!verified) return;
    await prisma.$transaction(async (tx) => {
      await tx.auditLog.deleteMany({ where: { tenantId } });
      await tx.projectTeamMember.deleteMany({ where: { tenantId } });
      await tx.projectMembership.deleteMany({ where: { tenantId } });
      await tx.jobsiteLog.deleteMany({ where: { tenantId } });
      await tx.certification.deleteMany({ where: { tenantId } });
      await tx.budgetSettings.deleteMany({ where: { budget: { tenantId } } });
      await tx.budget.deleteMany({ where: { tenantId } });
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

  it("creates and updates nullable dates with a project-scoped audit snapshot", async () => {
    const created = await createProject({ ...input(), startDate: new Date("2026-02-01"), expectedEndDate: new Date("2026-02-28") }, ctx);
    assert.equal(created.status, "DRAFT");
    assert.equal(created.companyId, companyId);
    await assert.rejects(() => updateProject(created.id, { expectedEndDate: new Date("2026-01-01") }, ctx), validation);
    await assert.rejects(() => updateProject(created.id, { startDate: new Date("2026-03-01") }, ctx), validation);
    const cleared = await updateProject(created.id, { startDate: null, expectedEndDate: null }, ctx);
    assert.equal(cleared.startDate, null);
    assert.equal(cleared.expectedEndDate, null);
    const event = await prisma.auditLog.findFirstOrThrow({ where: { tenantId, projectId: created.id, action: "project.updated" } });
    assert.equal((event.after as Record<string, unknown>).startDate, null);
    assert.equal((event.before as Record<string, unknown>).clientContactId, clientId);
  });

  it("rejects an inactive client while preserving edits to an existing historical client", async () => {
    await assert.rejects(() => createProject({ ...input(), clientContactId: inactiveClientId }, ctx), conflict);
    const created = await createProject(input(), ctx);
    await prisma.project.update({ where: { id: created.id }, data: { clientContactId: inactiveClientId } });
    const updated = await updateProject(created.id, { name: "Histórico actualizado", clientContactId: inactiveClientId }, ctx);
    assert.equal(updated.name, "Histórico actualizado");
    assert.equal(updated.clientContactId, inactiveClientId);
  });

  it("keeps tenant project codes unique under concurrent creation", async () => {
    const data = input();
    const results = await Promise.allSettled([createProject(data, ctx), createProject(data, ctx)]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    const rejected = results.find((result) => result.status === "rejected");
    assert.ok(rejected?.status === "rejected" && conflict(rejected.reason));
    assert.equal(await prisma.project.count({ where: { tenantId, code: data.code } }), 1);
  });

  for (const status of ["APPROVED", "CLOSED"] as const) {
    it(`preserves project type after a ${status} budget while permitting metadata edits`, async () => {
      const created = await activeProject();
      await budget(created.id, status);
      await assert.rejects(() => updateProject(created.id, { type: "PUBLIC" }, ctx), conflict);
      const updated = await updateProject(created.id, { name: "Nombre actualizado" }, ctx);
      assert.equal(updated.type, "PRIVATE");
      assert.equal(updated.name, "Nombre actualizado");
    });
  }

  it("pauses, resumes, cancels and restores the previous project state", async () => {
    const created = await activeProject();
    assert.equal((await pauseProject(created.id, ctx)).status, "ON_HOLD");
    assert.equal((await resumeProject(created.id, ctx)).status, "ACTIVE");
    await assert.rejects(() => cancelProject(created.id, ctx), conflict);
    const cancelled = await cancelProject(created.id, ctx, { reason: "Cancelación sintética" });
    assert.equal(cancelled.statusBeforeCancellation, "ACTIVE");
    assert.ok(cancelled.cancelledAt);
    await assert.rejects(() => updateProject(created.id, { name: "No modificar" }, ctx), conflict);
    const restored = await reactivateProject(created.id, ctx, { reason: "Reactivación sintética" });
    assert.equal(restored.status, "ACTIVE");
    assert.equal(restored.statusBeforeCancellation, null);
    assert.equal(restored.cancellationReason, null);
    const completed = await completeProject(created.id, ctx);
    assert.equal(completed.status, "COMPLETED");
    assert.ok(completed.actualEndDate);
    await assert.rejects(() => updateProject(created.id, { name: "No modificar" }, ctx), conflict);
  });

  it("rejects completion when the actual end would precede the planned start", async () => {
    const created = await createProject({ ...input(), startDate: new Date("2999-01-01") }, ctx);
    await activateProject(created.id, ctx);
    await assert.rejects(() => completeProject(created.id, ctx), validation);
    assert.equal((await prisma.project.findUniqueOrThrow({ where: { id: created.id } })).status, "ACTIVE");
  });

  it("blocks cancellation while an operational certification is open", async () => {
    const created = await activeProject();
    const approved = await budget(created.id);
    const cert = await prisma.certification.create({ data: {
      tenantId, companyId, projectId: created.id, budgetId: approved.id, number: 1,
      periodStart: new Date("2026-02-01"), periodEnd: new Date("2026-02-28"),
    } });
    const impact = await getProjectCancellationImpact(created.id, ctx);
    assert.ok(impact.blockers.some((blocker) => blocker.key === "certifications" && blocker.count === 1));
    await assert.rejects(() => cancelProject(created.id, ctx, { reason: "Prueba" }), conflict);
    await prisma.certification.update({ where: { id: cert.id }, data: { status: "CANCELLED" } });
    assert.equal((await cancelProject(created.id, ctx, { reason: "Sin documentos abiertos" })).status, "CANCELLED");
  });

  it("uses historical jobsite activity to reactivate legacy cancellations to ON_HOLD", async () => {
    const created = await activeProject();
    await prisma.jobsiteLog.create({ data: { tenantId, companyId, projectId: created.id, logDate: new Date("2026-02-01") } });
    await prisma.project.update({ where: { id: created.id }, data: { status: "CANCELLED", statusBeforeCancellation: null, startDate: null } });
    const impact = await getProjectCancellationImpact(created.id, ctx);
    assert.equal(impact.reactivationTargetStatus, "ON_HOLD");
    assert.equal((await reactivateProject(created.id, ctx, { reason: "Restaurar obra antigua" })).status, "ON_HOLD");
  });

  it("atomically rolls back creation, metadata and lifecycle when the audit insert fails", async () => {
    const data = input();
    await assert.rejects(() => createProject(data, missingActor));
    assert.equal(await prisma.project.count({ where: { tenantId, code: data.code } }), 0);
    const created = await createProject(input(), ctx);
    await assert.rejects(() => updateProject(created.id, { name: "Debe revertir" }, missingActor));
    await assert.rejects(() => activateProject(created.id, missingActor));
    const persisted = await prisma.project.findUniqueOrThrow({ where: { id: created.id } });
    assert.equal(persisted.name, created.name);
    assert.equal(persisted.status, "DRAFT");
    assert.equal(await prisma.auditLog.count({ where: { tenantId, projectId: created.id } }), 1);
  });

  it("adds and removes roster members with atomic auditing", async () => {
    const created = await activeProject();
    await assert.rejects(() => addProjectTeamMember(created.id, { userId: targetId, kind: "PROJECT_MANAGER" }, missingActor));
    assert.equal(await prisma.projectTeamMember.count({ where: { tenantId, projectId: created.id } }), 0);
    const member = await addProjectTeamMember(created.id, { userId: targetId, kind: "PROJECT_MANAGER" }, ctx);
    assert.equal((await listProjectTeam(created.id, ctx))[0]?.membershipActive, true);
    await assert.rejects(() => removeProjectTeamMember(created.id, member.id, missingActor));
    assert.equal(await prisma.projectTeamMember.count({ where: { id: member.id } }), 1);
    await removeProjectTeamMember(created.id, member.id, ctx);
    assert.equal(await prisma.projectTeamMember.count({ where: { tenantId, projectId: created.id } }), 0);
    assert.equal(await prisma.auditLog.count({ where: { tenantId, projectId: created.id, entityType: "ProjectTeamMember" } }), 2);
  });

  it("rechecks ACTIVE after waiting on a real lifecycle row lock before creating certification", { timeout: 30_000 }, async () => {
    const created = await activeProject();
    const approved = await budget(created.id);
    await whileProjectLocked(created.id,
      (tx) => tx.project.update({ where: { id: created.id }, data: { status: "CANCELLED", statusBeforeCancellation: "ACTIVE" } }),
      async (pid, release) => {
        const pending = createCertification({ projectId: created.id, budgetId: approved.id, periodStart: "2026-02-01", periodEnd: "2026-02-28" }, ctx)
          .then(() => null, (error: unknown) => error);
        await waitForBlockedWriter(pid);
        release();
        assert.ok(conflict(await pending));
      });
    assert.equal(await prisma.certification.count({ where: { tenantId, projectId: created.id } }), 0);
  });

  it("counts newly committed blockers after waiting on a real operational row lock", { timeout: 30_000 }, async () => {
    const created = await activeProject();
    const approved = await budget(created.id);
    await whileProjectLocked(created.id,
      (tx) => tx.certification.create({ data: { tenantId, companyId, projectId: created.id, budgetId: approved.id, number: 1, periodStart: new Date("2026-02-01"), periodEnd: new Date("2026-02-28") } }),
      async (pid, release) => {
        const pending = cancelProject(created.id, ctx, { reason: "Concurrent cancellation" }).then(() => null, (error: unknown) => error);
        await waitForBlockedWriter(pid);
        release();
        assert.ok(conflict(await pending));
      });
    assert.equal((await prisma.project.findUniqueOrThrow({ where: { id: created.id } })).status, "ACTIVE");
  });

  it("rechecks the classification freeze after a budget approval holds the project row", { timeout: 30_000 }, async () => {
    const created = await activeProject();
    const draft = await prisma.budget.create({ data: { tenantId, companyId, projectId: created.id, versionNumber: 1, name: "Synthetic pending approval", status: "IN_REVIEW" } });
    await whileProjectLocked(created.id,
      (tx) => tx.budget.update({ where: { id: draft.id }, data: { status: "APPROVED" } }),
      async (pid, release) => {
        const pending = updateProject(created.id, { type: "PUBLIC" }, ctx).then(() => null, (error: unknown) => error);
        await waitForBlockedWriter(pid);
        release();
        assert.ok(conflict(await pending));
      });
    assert.equal((await prisma.project.findUniqueOrThrow({ where: { id: created.id } })).type, "PRIVATE");
  });

  it("budget approval rechecks project state after a concurrent cancellation", { timeout: 30_000 }, async () => {
    const created = await activeProject();
    const draft = await prisma.budget.create({ data: { tenantId, companyId, projectId: created.id, versionNumber: 1, name: "Synthetic pending approval", status: "IN_REVIEW" } });
    await whileProjectLocked(created.id,
      (tx) => tx.project.update({ where: { id: created.id }, data: { status: "CANCELLED", statusBeforeCancellation: "ACTIVE" } }),
      async (pid, release) => {
        const pending = approveBudget(draft.id, ctx).then(() => null, (error: unknown) => error);
        await waitForBlockedWriter(pid);
        release();
        assert.ok(conflict(await pending));
      });
    assert.equal((await prisma.budget.findUniqueOrThrow({ where: { id: draft.id } })).status, "IN_REVIEW");
  });

  it("allows classification to commit before approval while serializing both writes", { timeout: 30_000 }, async () => {
    const created = await activeProject();
    const draft = await prisma.budget.create({ data: { tenantId, companyId, projectId: created.id, versionNumber: 1, name: "Synthetic pending approval", status: "IN_REVIEW" } });
    await whileProjectLocked(created.id,
      (tx) => tx.project.update({ where: { id: created.id }, data: { type: "PUBLIC" } }),
      async (pid, release) => {
        const pending = approveBudget(draft.id, ctx);
        await waitForBlockedWriter(pid);
        release();
        assert.equal((await pending).status, "APPROVED");
      });
    assert.equal((await prisma.project.findUniqueOrThrow({ where: { id: created.id } })).type, "PUBLIC");
  });

  it("keeps budget creation, editing, submission and approval atomic with audit", async () => {
    const created = await activeProject();
    await assert.rejects(() => createBudget({ projectId: created.id, name: "Must roll back" }, missingActor));
    assert.equal(await prisma.budget.count({ where: { tenantId, projectId: created.id } }), 0);
    const draft = await createBudget({ projectId: created.id, name: "Synthetic budget" }, ctx);
    await assert.rejects(() => updateBudget(draft.id, { name: "Must roll back" }, missingActor));
    await assert.rejects(() => submitBudgetForReview(draft.id, missingActor));
    assert.equal((await prisma.budget.findUniqueOrThrow({ where: { id: draft.id } })).status, "DRAFT");
    assert.equal((await prisma.budget.findUniqueOrThrow({ where: { id: draft.id } })).name, "Synthetic budget");
    await submitBudgetForReview(draft.id, ctx);
    await assert.rejects(() => approveBudget(draft.id, missingActor));
    assert.equal((await prisma.budget.findUniqueOrThrow({ where: { id: draft.id } })).status, "IN_REVIEW");
    assert.equal((await approveBudget(draft.id, ctx)).status, "APPROVED");
    await assert.rejects(() => createCertification({ projectId: created.id, budgetId: draft.id, periodStart: "2026-02-01", periodEnd: "2026-02-28" }, missingActor));
    assert.equal(await prisma.certification.count({ where: { tenantId, projectId: created.id } }), 0);
  });

  it("gives a scoped PM immediate access only to the new project and rolls back its assignment on audit failure", async () => {
    await prisma.tenant.update({ where: { id: tenantId }, data: { projectAccessMode: "MEMBERSHIP_SCOPED" } });
    clearProjectAccessModeCache();
    const pm: ServiceContext = { ...ctx, actorUserId: targetId, roles: ["PROJECT_MANAGER"] };
    try {
      const unrelated = await createProject(input(), ctx);
      assert.equal(await prisma.projectMembership.count({ where: { tenantId, projectId: unrelated.id } }), 0);
      assert.equal((await listProjects({}, pm)).total, 0);
      const created = await createProject(input(), pm);
      assert.equal((await getProjectById(created.id, pm)).id, created.id);
      assert.equal((await listProjects({}, pm)).total, 1);
      const assignments = await prisma.projectMembership.findMany({ where: { tenantId, userId: targetId } });
      assert.equal(assignments.length, 1);
      assert.equal(assignments[0]?.projectId, created.id);
      assert.equal(assignments[0]?.createdBy, targetId);
      await assert.rejects(() => getProjectById(unrelated.id, pm), (error: unknown) => error instanceof ServiceError && error.code === "FORBIDDEN");
      const failed = input();
      // PostgreSQL text rejects NUL: fail only the audit insert, after valid project+ACL writes.
      await assert.rejects(() => createProject(failed, { ...pm, ipAddress: "\u0000" }));
      assert.equal(await prisma.project.count({ where: { tenantId, code: failed.code } }), 0);
      assert.equal(await prisma.projectMembership.count({ where: { tenantId, userId: targetId } }), 1);
      assert.equal(await prisma.projectMembership.count({ where: { tenantId, projectId: unrelated.id } }), 0);
    } finally {
      await prisma.tenant.update({ where: { id: tenantId }, data: { projectAccessMode: "TENANT_WIDE" } });
      clearProjectAccessModeCache();
    }
  });

  it("excludes inactive and suspended users from project notices and roster selection despite active tenant membership", async () => {
    const created = await activeProject();
    assert.deepEqual(await filterUserIdsByProjectAccess(tenantId, created.id, [targetId]), [targetId]);
    assert.ok((await listActiveMembersForProjectTeamPicker(created.id, ctx)).some((member) => member.userId === targetId));
    try {
      for (const status of ["INACTIVE", "SUSPENDED"] as const) {
        await prisma.user.update({ where: { id: targetId }, data: { status } });
        assert.equal((await prisma.userMembership.findUniqueOrThrow({ where: { userId_tenantId: { tenantId, userId: targetId } } })).status, "ACTIVE");
        assert.deepEqual(await filterUserIdsByProjectAccess(tenantId, created.id, [targetId]), []);
        assert.equal((await listActiveMembersForProjectTeamPicker(created.id, ctx)).some((member) => member.userId === targetId), false);
      }
    } finally {
      await prisma.user.update({ where: { id: targetId }, data: { status: "ACTIVE" } });
    }
  });
});
