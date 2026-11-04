import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, beforeEach, describe, it } from "node:test";

import { prisma } from "@bloqer/database";
import { listSupportedTenantModules } from "@bloqer/domain";
import { productCalendarDateUtc } from "@bloqer/utils";

import { assertPreferredProjectAccess, getFieldHome, listFieldProjects } from "../field/field-home.service";
import { getMyFieldPendingItems } from "../field/field-pending.service";
import {
  getNotificationBellSnapshot, getUnreadNotificationCount, listMyNotifications, markNotificationAsRead,
} from "../notifications/notification.service";
import {
  addProjectMembership, getTenantProjectAccessModeForAdmin, getUserProjectAccessEditor,
  importMembershipsFromProjectTeam, previewImportMembershipsFromProjectTeam,
  previewMembershipScopedActivation, removeProjectMembership, setTenantProjectAccessMode,
  setUserProjectMemberships,
} from "../project/project-membership.service";
import {
  getProjectById, getProjectClientContactId, getProjectShellInfo, listProjects, updateProject,
} from "../project/project.service";
import { assertAuditDatabaseIdentity } from "../testing/audit-fixture";
import { ServiceError, type ServiceContext } from "../types";
import {
  clearProjectAccessModeCache, filterUserIdsByProjectAccess, requireProjectAccess,
  resolveAccessibleProjectScope,
} from "./access";

const live = process.env.BLOQER_AUDIT_LIVE === "1";

describe("AG-01 project/company/notification SQL isolation", { skip: !live, concurrency: false }, () => {
  const tenantId = randomUUID();
  const otherTenantId = randomUUID();
  const companyId = randomUUID();
  const otherCompanyId = randomUUID();
  const foreignCompanyId = randomUUID();
  const clientId = randomUUID();
  const foreignClientId = randomUUID();
  const actorId = randomUUID();
  const ownerId = randomUUID();
  const globalOwnerId = randomUUID();
  const otherCompanyUserId = randomUUID();
  const globalTargetId = randomUUID();
  const assignedId = randomUUID();
  const unassignedId = randomUUID();
  const sharedId = randomUUID();
  const otherCompanyProjectId = randomUUID();
  const foreignProjectId = randomUUID();
  const assignedNotificationId = randomUUID();
  const unassignedNotificationId = randomUUID();
  const foreignCompanyNotificationId = randomUUID();
  const sharedNotificationId = randomUUID();
  const sharedProjectNotificationId = randomUUID();
  const tenantIds = [tenantId, otherTenantId];
  const userIds = [actorId, ownerId, globalOwnerId, otherCompanyUserId, globalTargetId];
  let databaseVerified = false;

  function pm(): ServiceContext {
    return { tenantId, companyId, actorUserId: actorId, roles: ["PROJECT_MANAGER"] };
  }
  function owner(): ServiceContext {
    return { tenantId, companyId, actorUserId: ownerId, roles: ["OWNER"] };
  }
  function globalOwner(): ServiceContext {
    return { tenantId, companyId: null, actorUserId: globalOwnerId, roles: ["OWNER"] };
  }
  const forbidden = (error: unknown) => error instanceof ServiceError && error.code === "FORBIDDEN";

  before(async () => {
    await assertAuditDatabaseIdentity(prisma);
    databaseVerified = true;
    await prisma.$transaction(async (tx) => {
      await tx.tenant.createMany({ data: [
        { id: tenantId, name: "Synthetic AG01 access A", slug: `audit-access-${tenantId}`, projectAccessMode: "MEMBERSHIP_SCOPED" },
        { id: otherTenantId, name: "Synthetic AG01 access B", slug: `audit-access-${otherTenantId}` },
      ] });
      await tx.company.createMany({ data: [
        { id: companyId, tenantId, name: "Synthetic A1" },
        { id: otherCompanyId, tenantId, name: "Synthetic A2" },
        { id: foreignCompanyId, tenantId: otherTenantId, name: "Synthetic B1" },
      ] });
      await tx.user.createMany({ data: userIds.map((id) => ({ id, email: `audit-access-${id}@example.test`, status: "ACTIVE" })) });
      await tx.userMembership.createMany({ data: [
        { tenantId, companyId, userId: actorId, roles: ["PROJECT_MANAGER"] },
        { tenantId, companyId, userId: ownerId, roles: ["OWNER"] },
        { tenantId, companyId: null, userId: globalOwnerId, roles: ["OWNER"] },
        { tenantId, companyId: otherCompanyId, userId: otherCompanyUserId, roles: ["OWNER"] },
        { tenantId, companyId: null, userId: globalTargetId, roles: ["PROJECT_MANAGER"] },
      ] });
      await tx.contact.createMany({ data: [
        { id: clientId, tenantId, legalName: "Synthetic client A" },
        { id: foreignClientId, tenantId: otherTenantId, legalName: "Synthetic client B" },
      ] });
      await tx.project.createMany({ data: [
        { id: assignedId, tenantId, companyId, clientContactId: clientId, code: "A-ASSIGNED", name: "Assigned", status: "ACTIVE" },
        { id: unassignedId, tenantId, companyId, clientContactId: clientId, code: "A-UNASSIGNED", name: "Unassigned", status: "ACTIVE" },
        { id: sharedId, tenantId, companyId: null, clientContactId: clientId, code: "A-SHARED", name: "Shared", status: "ACTIVE" },
        { id: otherCompanyProjectId, tenantId, companyId: otherCompanyId, clientContactId: clientId, code: "A-OTHER-COMPANY", name: "Other company", status: "ACTIVE" },
        { id: foreignProjectId, tenantId: otherTenantId, companyId: foreignCompanyId, clientContactId: foreignClientId, code: "B-FOREIGN", name: "Foreign tenant", status: "ACTIVE" },
      ] });
      // The third adversarial row proves an ACL membership never overrides company scope.
      await tx.projectMembership.createMany({ data: [assignedId, sharedId, otherCompanyProjectId]
        .map((projectId) => ({ tenantId, projectId, userId: actorId })) });
      await tx.notification.createMany({ data: [
        { id: assignedNotificationId, tenantId, companyId, recipientUserId: actorId, projectId: assignedId },
        { id: unassignedNotificationId, tenantId, companyId, recipientUserId: actorId, projectId: unassignedId },
        { id: foreignCompanyNotificationId, tenantId, companyId: otherCompanyId, recipientUserId: actorId, projectId: otherCompanyProjectId },
        { id: sharedNotificationId, tenantId, companyId: null, recipientUserId: actorId, projectId: null },
        { id: sharedProjectNotificationId, tenantId, companyId: null, recipientUserId: actorId, projectId: sharedId },
        { id: randomUUID(), tenantId: otherTenantId, companyId: foreignCompanyId, recipientUserId: actorId, projectId: foreignProjectId },
        { id: randomUUID(), tenantId, companyId, recipientUserId: ownerId, projectId: assignedId },
      ].map((row) => ({ ...row, type: "DOCUMENT_UPLOAD_CONFIRMED" as const, title: "Synthetic access audit", body: "Synthetic content" })) });

      for (const [index, projectId] of [assignedId, unassignedId, sharedId, otherCompanyProjectId].entries()) {
        await tx.purchaseRequest.create({ data: {
          tenantId, projectId, companyId: projectId === otherCompanyProjectId ? otherCompanyId : companyId,
          number: index + 1, status: "SUBMITTED", submittedAt: new Date(),
          lines: { create: { description: "Synthetic material", quantity: "1", unit: "un" } },
        } });
      }
      const today = productCalendarDateUtc();
      for (const projectId of [assignedId, unassignedId]) {
        await tx.schedule.create({ data: {
          tenantId, projectId,
          items: { create: { tenantId, name: "Synthetic today task", startDate: today, endDate: today } },
        } });
      }
    }, { timeout: 30_000 });
    clearProjectAccessModeCache();
  });

  beforeEach(async () => {
    if (!databaseVerified) return;
    await prisma.tenant.update({ where: { id: tenantId }, data: { projectAccessMode: "MEMBERSHIP_SCOPED" } });
    await prisma.tenantModuleSetting.deleteMany({ where: { tenantId } });
    clearProjectAccessModeCache();
  });

  after(async () => {
    clearProjectAccessModeCache();
    if (!databaseVerified) return;
    // Only this suite's random fixture IDs are removed, in FK dependency order.
    await prisma.$transaction(async (tx) => {
      await tx.notification.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await tx.auditLog.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await tx.purchaseRequest.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await tx.scheduleItem.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await tx.schedule.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await tx.projectMembership.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await tx.projectTeamMember.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await tx.project.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await tx.contact.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await tx.userMembership.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await tx.company.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await tx.tenant.deleteMany({ where: { id: { in: tenantIds } } });
      await tx.user.deleteMany({ where: { id: { in: userIds } } });
    }, { timeout: 30_000 });
    await prisma.$disconnect();
  });

  it("rejects foreign-tenant project IDs in shared guards and shell", async () => {
    await assert.rejects(() => requireProjectAccess(foreignProjectId, owner()), forbidden);
    await assert.rejects(() => getProjectShellInfo(foreignProjectId, owner()), forbidden);
  });

  it("membership and OWNER bypass never cross a company boundary", async () => {
    for (const ctx of [pm(), owner()]) {
      await assert.rejects(() => requireProjectAccess(otherCompanyProjectId, ctx), forbidden);
      await assert.rejects(() => getProjectShellInfo(otherCompanyProjectId, ctx), forbidden);
    }
  });

  it("shell, client, full record and mutations reject an unassigned project", async () => {
    for (const load of [getProjectShellInfo, getProjectClientContactId, getProjectById]) {
      await assert.rejects(() => load(unassignedId, pm()), forbidden);
    }
    await assert.rejects(() => updateProject(unassignedId, { name: "Must not change" }, pm()), forbidden);
    assert.equal((await prisma.project.findUniqueOrThrow({ where: { id: unassignedId } })).name, "Unassigned");
  });

  it("shared project with explicit membership stays accessible", async () => {
    assert.equal((await requireProjectAccess(sharedId, pm())).companyId, null);
    assert.equal((await getProjectShellInfo(sharedId, pm())).id, sharedId);
    assert.equal(await getProjectClientContactId(sharedId, pm()), clientId);
  });

  it("SCOPED project list and total intersect company and membership", async () => {
    const listed = await listProjects({ pageSize: 100 }, pm());
    assert.equal(listed.total, 2);
    assert.deepEqual(new Set(listed.data.map((row) => row.id)), new Set([assignedId, sharedId]));
  });

  it("TENANT_WIDE keeps company scope and allows an unassigned own-company project", async () => {
    await prisma.tenant.update({ where: { id: tenantId }, data: { projectAccessMode: "TENANT_WIDE" } });
    clearProjectAccessModeCache();
    const listed = await listProjects({ pageSize: 100 }, pm());
    assert.deepEqual(new Set(listed.data.map((row) => row.id)), new Set([assignedId, sharedId, unassignedId]));
    assert.equal((await requireProjectAccess(unassignedId, pm())).id, unassignedId);
    await assert.rejects(() => requireProjectAccess(otherCompanyProjectId, pm()), forbidden);
  });

  it("global OWNER sees all tenant projects without leaking the other tenant", async () => {
    assert.equal(await resolveAccessibleProjectScope(globalOwner()), "ALL");
    const listed = await listProjects({ pageSize: 100 }, globalOwner());
    assert.equal(listed.total, 4);
    assert.ok(!listed.data.some((row) => row.id === foreignProjectId));
  });

  it("saving a Field preference rejects unassigned and foreign-company projects", async () => {
    await assert.rejects(() => assertPreferredProjectAccess(unassignedId, pm()), forbidden);
    await assert.rejects(() => assertPreferredProjectAccess(otherCompanyProjectId, owner()), forbidden);
  });

  it("Field home ignores a stale preferred project and its schedule", async () => {
    const home = await getFieldHome(pm(), { preferredProjectId: unassignedId });
    assert.equal(home.featuredProject, null);
    assert.ok(home.todayItems.some((item) => item.projectId === assignedId));
    assert.ok(!home.todayItems.some((item) => item.projectId === unassignedId));
  });

  it("Field picker lists only assigned projects within company scope", async () => {
    assert.deepEqual(new Set((await listFieldProjects(pm())).map((row) => row.id)), new Set([assignedId, sharedId]));
  });

  it("pending list and counts exclude unassigned and foreign-company requests", async () => {
    const pending = await getMyFieldPendingItems(pm());
    assert.equal(pending.counts.purchaseRequests, 2);
    assert.deepEqual(new Set(pending.items.map((row) => row.projectId)), new Set([assignedId, sharedId]));
  });

  it("bell and inbox enforce current company and project access", async () => {
    const bell = await getNotificationBellSnapshot(pm());
    const visible = new Set([assignedNotificationId, sharedNotificationId, sharedProjectNotificationId]);
    assert.equal(bell.unreadCount, 3);
    assert.deepEqual(new Set(bell.items.map((row) => row.id)), visible);
    const inbox = await listMyNotifications("all", pm());
    assert.equal(inbox.total, 3);
    assert.deepEqual(new Set(inbox.items.map((row) => row.id)), visible);
  });

  it("revoking project membership also removes previously delivered notification content", async () => {
    await prisma.projectMembership.deleteMany({ where: { tenantId, projectId: assignedId, userId: actorId } });
    try {
      const bell = await getNotificationBellSnapshot(pm());
      assert.equal(bell.unreadCount, 2);
      assert.ok(!bell.items.some((row) => row.id === assignedNotificationId));
    } finally {
      await prisma.projectMembership.create({ data: { tenantId, projectId: assignedId, userId: actorId } });
    }
  });

  it("notification state mutations cannot address hidden project/company content", async () => {
    for (const id of [unassignedNotificationId, foreignCompanyNotificationId]) {
      await assert.rejects(() => markNotificationAsRead(id, pm()),
        (error: unknown) => error instanceof ServiceError && error.code === "NOT_FOUND");
      assert.equal((await prisma.notification.findUniqueOrThrow({ where: { id } })).status, "UNREAD");
    }
  });

  it("project fan-out excludes another company's OWNER under either access mode", async () => {
    for (const mode of ["MEMBERSHIP_SCOPED", "TENANT_WIDE"] as const) {
      await prisma.tenant.update({ where: { id: tenantId }, data: { projectAccessMode: mode } });
      clearProjectAccessModeCache();
      const recipients = await filterUserIdsByProjectAccess(tenantId, assignedId,
        [actorId, ownerId, globalOwnerId, otherCompanyUserId]);
      assert.deepEqual(new Set(recipients), new Set([actorId, ownerId, globalOwnerId]));
    }
  });

  it("disabled modules block direct project entry, Field picker and pending sources", async () => {
    await prisma.tenantModuleSetting.createMany({ data: listSupportedTenantModules()
      .map(({ moduleKey }) => ({ tenantId, moduleKey, isEnabled: false })) });
    await assert.rejects(() => getProjectShellInfo(assignedId, owner()), forbidden);
    await assert.rejects(() => getProjectById(assignedId, owner()), forbidden);
    await assert.rejects(() => listProjects({}, owner()), forbidden);
    assert.deepEqual(await listFieldProjects(owner()), []);
    assert.equal((await getMyFieldPendingItems(owner())).counts.total, 0);
  });

  it("AP enabled keeps its project shell usable when PROJECTS is disabled", async () => {
    await prisma.tenantModuleSetting.createMany({ data: listSupportedTenantModules()
      .map(({ moduleKey }) => ({ tenantId, moduleKey, isEnabled: moduleKey === "AP" })) });
    assert.equal((await getProjectShellInfo(assignedId, pm())).id, assignedId);
    await assert.rejects(() => getProjectById(assignedId, pm()), forbidden);
  });

  it("NOTIFICATIONS disabled composes empty reads and rejects direct state changes", async () => {
    await prisma.tenantModuleSetting.create({ data: { tenantId, moduleKey: "NOTIFICATIONS", isEnabled: false } });
    assert.deepEqual(await getNotificationBellSnapshot(pm()), { unreadCount: 0, items: [] });
    assert.equal(await getUnreadNotificationCount(pm()), 0);
    const inbox = await listMyNotifications("all", pm());
    assert.equal(inbox.total, 0);
    assert.deepEqual(inbox.items, []);
    await assert.rejects(() => markNotificationAsRead(assignedNotificationId, pm()), forbidden);
    assert.equal((await prisma.notification.findUniqueOrThrow({ where: { id: assignedNotificationId } })).status, "UNREAD");
  });

  it("membership editor intersects administrator and target company scope", async () => {
    const editor = await getUserProjectAccessEditor(globalTargetId, owner());
    assert.deepEqual(new Set(editor.projects.map((row) => row.projectId)), new Set([assignedId, unassignedId, sharedId]));
    const targetScoped = await getUserProjectAccessEditor(actorId, globalOwner());
    assert.ok(!targetScoped.projects.some((row) => row.projectId === otherCompanyProjectId));
    await assert.rejects(() => getUserProjectAccessEditor(otherCompanyUserId, owner()), forbidden);
    await assert.rejects(() => addProjectMembership(otherCompanyProjectId, actorId, globalOwner()),
      (error: unknown) => error instanceof ServiceError && error.code === "VALIDATION");
  });

  it("company-scoped batch replacement preserves grants hidden from its editor", async () => {
    await prisma.projectMembership.createMany({ data: [assignedId, otherCompanyProjectId]
      .map((projectId) => ({ tenantId, projectId, userId: globalTargetId })) });
    try {
      await setUserProjectMemberships(globalTargetId, [sharedId], owner());
      const grants = await prisma.projectMembership.findMany({ where: { tenantId, userId: globalTargetId } });
      assert.deepEqual(new Set(grants.map((row) => row.projectId)), new Set([sharedId, otherCompanyProjectId]));
    } finally {
      await prisma.projectMembership.deleteMany({ where: { tenantId, userId: globalTargetId } });
    }
  });

  it("concurrent full replacements have one complete final set, never their union", async () => {
    try {
      await Promise.all([
        setUserProjectMemberships(globalTargetId, [assignedId], globalOwner()),
        setUserProjectMemberships(globalTargetId, [unassignedId], globalOwner()),
      ]);
      const grants = await prisma.projectMembership.findMany({ where: { tenantId, userId: globalTargetId } });
      assert.equal(grants.length, 1);
      assert.ok(grants[0]!.projectId === assignedId || grants[0]!.projectId === unassignedId);
      const audits = await prisma.auditLog.count({ where: { tenantId, action: "project_membership.user_set", entityId: globalTargetId } });
      assert.ok(audits >= 2);
    } finally {
      await prisma.projectMembership.deleteMany({ where: { tenantId, userId: globalTargetId } });
    }
  });

  it("all membership mutations roll back when audit insertion fails", async () => {
    const badActor = { ...globalOwner(), actorUserId: randomUUID() };
    const auditFailure = (error: unknown) => typeof error === "object" && error !== null && "code" in error && error.code === "P2003";
    await assert.rejects(() => setUserProjectMemberships(globalTargetId, [assignedId], badActor), auditFailure);
    assert.equal(await prisma.projectMembership.count({ where: { tenantId, userId: globalTargetId } }), 0);
    await assert.rejects(() => addProjectMembership(assignedId, globalTargetId, badActor), auditFailure);
    assert.equal(await prisma.projectMembership.count({ where: { tenantId, userId: globalTargetId } }), 0);
    const grant = await prisma.projectMembership.create({ data: { tenantId, projectId: assignedId, userId: globalTargetId } });
    try {
      await assert.rejects(() => removeProjectMembership(assignedId, grant.id, badActor), auditFailure);
      assert.ok(await prisma.projectMembership.findUnique({ where: { id: grant.id } }));
    } finally {
      await prisma.projectMembership.deleteMany({ where: { id: grant.id } });
    }
    await assert.rejects(() => setTenantProjectAccessMode({ mode: "TENANT_WIDE" }, badActor), auditFailure);
    assert.equal((await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } })).projectAccessMode, "MEMBERSHIP_SCOPED");
    const team = await prisma.projectTeamMember.create({ data: { tenantId, projectId: assignedId, userId: globalTargetId } });
    try {
      await assert.rejects(() => importMembershipsFromProjectTeam(assignedId, badActor), auditFailure);
      assert.equal(await prisma.projectMembership.count({ where: { tenantId, userId: globalTargetId } }), 0);
    } finally {
      await prisma.projectTeamMember.delete({ where: { id: team.id } });
    }
  });

  it("team import preview matches eligible active members within the project company", async () => {
    await prisma.projectTeamMember.createMany({ data: [actorId, globalTargetId, otherCompanyUserId]
      .map((userId) => ({ tenantId, projectId: assignedId, userId })) });
    try {
      const preview = await previewImportMembershipsFromProjectTeam(assignedId, owner());
      assert.deepEqual(preview, { projectId: assignedId, teamSize: 3, alreadyExists: 1, wouldCreate: 1 });
      const imported = await importMembershipsFromProjectTeam(assignedId, owner());
      assert.equal(imported.created, 1);
      assert.equal(await prisma.projectMembership.count({ where: { tenantId, projectId: assignedId, userId: otherCompanyUserId } }), 0);
    } finally {
      await prisma.projectTeamMember.deleteMany({ where: { tenantId, projectId: assignedId } });
      await prisma.projectMembership.deleteMany({ where: { tenantId, userId: globalTargetId } });
    }
  });

  it("membership management and mode gates follow their own enabled branches", async () => {
    await prisma.tenantModuleSetting.create({ data: { tenantId, moduleKey: "USERS_PERMISSIONS", isEnabled: false } });
    await assert.rejects(() => getUserProjectAccessEditor(actorId, owner()), forbidden);
    await assert.rejects(() => setUserProjectMemberships(actorId, [], owner()), forbidden);
    assert.equal(await getTenantProjectAccessModeForAdmin(owner()), "MEMBERSHIP_SCOPED");
    const preview = await previewMembershipScopedActivation(owner());
    assert.equal(preview.projectCount, 4, "mode preview remains tenant-wide for an anchored administrator");
    await setTenantProjectAccessMode({ mode: "TENANT_WIDE" }, owner());
    await prisma.tenantModuleSetting.updateMany({ where: { tenantId }, data: { isEnabled: true } });
    await prisma.tenantModuleSetting.create({ data: { tenantId, moduleKey: "TENANT_SETTINGS", isEnabled: false } });
    await assert.rejects(() => setTenantProjectAccessMode({ mode: "MEMBERSHIP_SCOPED", confirmLockouts: true }, owner()), forbidden);
    assert.ok(await getUserProjectAccessEditor(actorId, owner()));
    assert.equal(await getTenantProjectAccessModeForAdmin(owner()), "TENANT_WIDE");
  });

  it("fan-out uses the sole ACTIVE company for null membership companies", async () => {
    await prisma.company.update({ where: { id: otherCompanyId }, data: { status: "INACTIVE" } });
    try {
      assert.deepEqual(await filterUserIdsByProjectAccess(tenantId, otherCompanyProjectId, [globalOwnerId]), []);
    } finally {
      await prisma.company.update({ where: { id: otherCompanyId }, data: { status: "ACTIVE" } });
    }
  });
});
