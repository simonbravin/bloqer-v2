import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { prisma } from "@bloqer/database";
import type { ServiceContext } from "../types";
import { ServiceError } from "../types";
import { assertAuditDatabaseIdentity } from "../testing/audit-fixture";
import {
  getTenantMemberById,
  listTenantMembers,
  updateTenantMemberRoles,
  updateTenantMemberStatus,
} from "./team-management.service";

/** Opt-in only; imports with server-only markers require --conditions=react-server. */
describe("AG-01 tenant administration (isolated audit database)", {
  skip: process.env.BLOQER_AUDIT_LIVE !== "1",
  concurrency: false,
}, () => {
  let invitations: typeof import("./tenant-invitations.service");
  let platformInvitations: typeof import("../platform/platform-tenant-invitations.service");
  let platform: typeof import("../platform/platform-tenant.service");
  let operations: typeof import("../platform/platform-operations.service");
  let platformUsers: typeof import("../platform/platform-user.service");
  let operatorId: string;

  before(async () => {
    await assertAuditDatabaseIdentity(prisma);
    const { isEmailConfigured } = await import("@bloqer/config");
    assert.equal(isEmailConfigured(), false, "Email sending must be disabled for audit tests");
    invitations = await import("./tenant-invitations.service");
    platformInvitations = await import("../platform/platform-tenant-invitations.service");
    platform = await import("../platform/platform-tenant.service");
    operations = await import("../platform/platform-operations.service");
    platformUsers = await import("../platform/platform-user.service");
    const operator = await prisma.user.create({
      data: { email: `audit-platform-${randomUUID()}@example.invalid`, status: "ACTIVE" },
    });
    operatorId = operator.id;
    await prisma.platformAdmin.create({ data: { userId: operatorId, active: true } });
  });

  after(async () => { await prisma.$disconnect(); });

  async function fixture() {
    const suffix = randomUUID();
    const tenant = await prisma.tenant.create({
      data: {
        name: "AG-01 tenant administration fixture",
        slug: `audit-tenant-admin-${suffix}`,
        status: "ACTIVE",
        subscriptionStatus: "TRIAL",
        trialEndsAt: new Date("2040-01-01T12:00:00.000Z"),
        companies: { create: { name: "Audit company", status: "ACTIVE" } },
        memberships: { create: [
          { user: { connect: { id: operatorId } }, roles: ["ADMIN"], status: "ACTIVE" },
          { user: { create: { email: `audit-owner-a-${suffix}@example.invalid`, status: "ACTIVE" } }, roles: ["OWNER"], status: "ACTIVE" },
          { user: { create: { email: `audit-owner-b-${suffix}@example.invalid`, status: "ACTIVE" } }, roles: ["OWNER"], status: "ACTIVE" },
        ] },
      },
      include: { companies: true, memberships: true },
    });
    const ctx: ServiceContext = {
      actorUserId: operatorId,
      tenantId: tenant.id,
      companyId: tenant.companies[0]!.id,
      roles: ["ADMIN"],
    };
    return { tenant, ctx, owners: tenant.memberships.filter((m) => m.roles.includes("OWNER")) };
  }

  function assertOneConflict(results: PromiseSettledResult<unknown>[]) {
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    const failed = results.find((r) => r.status === "rejected");
    assert.ok(failed?.status === "rejected");
    assert.ok(failed.reason instanceof ServiceError && failed.reason.code === "CONFLICT");
  }

  const demote = (id: string, ctx: ServiceContext) => updateTenantMemberRoles(id, ["VIEWER"], ctx);
  const deactivate = (id: string, ctx: ServiceContext) => updateTenantMemberStatus(id, "INACTIVE", ctx);
  for (const [label, first, second] of [
    ["role changes", demote, demote],
    ["deactivations", deactivate, deactivate],
    ["role change and deactivation", demote, deactivate],
  ] as const) {
    it(`SQL locks preserve an active OWNER during concurrent ${label}`, async () => {
      const fx = await fixture();
      const result = await Promise.allSettled([
        first(fx.owners[0]!.id, fx.ctx),
        second(fx.owners[1]!.id, fx.ctx),
      ]);
      assertOneConflict(result);
      assert.equal(await prisma.userMembership.count({
        where: { tenantId: fx.tenant.id, status: "ACTIVE", roles: { has: "OWNER" } },
      }), 1);
      assert.equal(await prisma.auditLog.count({ where: {
        tenantId: fx.tenant.id,
        action: { in: ["MEMBERSHIP_ROLES_UPDATED", "MEMBERSHIP_STATUS_UPDATED"] },
      } }), 1);
    });
  }

  it("SQL rollback preserves membership roles when audit insertion fails", async () => {
    const fx = await fixture();
    await assert.rejects(() => demote(fx.owners[0]!.id, { ...fx.ctx, actorUserId: randomUUID() }));
    const member = await prisma.userMembership.findUniqueOrThrow({ where: { id: fx.owners[0]!.id } });
    assert.deepEqual(member.roles, ["OWNER"]);
    assert.equal(await prisma.auditLog.count({ where: { tenantId: fx.tenant.id } }), 0);
  });

  for (const [label, mutate] of [["demotion", demote], ["deactivation", deactivate]] as const) {
    it(`blocks the last eligible OWNER ${label} when another owner's account is suspended`, async () => {
      const fx = await fixture();
      await prisma.user.update({ where: { id: fx.owners[1]!.userId }, data: { status: "SUSPENDED" } });
      await assert.rejects(() => mutate(fx.owners[0]!.id, fx.ctx),
        (e: unknown) => e instanceof ServiceError && e.code === "CONFLICT");
      const saved = await prisma.userMembership.findUniqueOrThrow({ where: { id: fx.owners[0]!.id } });
      assert.equal(saved.status, "ACTIVE");
      assert.deepEqual(saved.roles, ["OWNER"]);
      assert.equal(await prisma.auditLog.count({ where: { tenantId: fx.tenant.id } }), 0);
    });
  }

  for (const creator of ["tenant", "platform", "mixed"] as const) {
    it(`concurrent ${creator} invitations leave exactly one pending token`, async () => {
      const fx = await fixture();
      const raw = { email: `audit-invite-${randomUUID()}@example.invalid`, roles: ["VIEWER"], expiresInDays: 7 };
      const tenantCreate = () => invitations.createTenantInvitation(raw, fx.ctx);
      const platformCreate = () => platformInvitations.createPlatformTenantInvitation(
        { ...raw, tenantId: fx.tenant.id }, { actorUserId: operatorId },
      );
      assertOneConflict(await Promise.allSettled([
        creator === "platform" ? platformCreate() : tenantCreate(),
        creator === "tenant" ? tenantCreate() : platformCreate(),
      ]));
      const pending = await prisma.tenantInvitation.findMany({
        where: { tenantId: fx.tenant.id, email: raw.email, status: "PENDING" },
      });
      assert.equal(pending.length, 1);
      assert.equal(pending[0]?.companyId, fx.ctx.companyId);
      assert.equal(await prisma.auditLog.count({ where: { tenantId: fx.tenant.id, action: "TENANT_INVITATION_CREATED" } })
        + await prisma.platformAuditLog.count({ where: { targetTenantId: fx.tenant.id, action: "platform.tenant.invitation_created" } }), 1);
    });
  }

  async function invitedUser(fx: Awaited<ReturnType<typeof fixture>>) {
    const user = await prisma.user.create({
      data: { email: `audit-invited-${randomUUID()}@example.invalid`, status: "ACTIVE" },
    });
    const inv = await invitations.createTenantInvitation({ email: user.email, roles: ["VIEWER"] }, fx.ctx);
    assert.equal(inv.emailDispatched, false);
    const token = new URL(inv.invitationLink, "https://example.invalid").searchParams.get("token");
    assert.ok(token);
    return { user, inv, token };
  }

  it("concurrent accept and cancel produce one terminal state and matching membership", async () => {
    const fx = await fixture();
    const target = await invitedUser(fx);
    const results = await Promise.allSettled([
      invitations.acceptTenantInvitation(target.token, { actorUserId: target.user.id }),
      platformInvitations.cancelPlatformTenantInvitation(fx.tenant.id, target.inv.invitationId, { actorUserId: operatorId }),
    ]);
    assertOneConflict(results);
    const saved = await prisma.tenantInvitation.findUniqueOrThrow({ where: { id: target.inv.invitationId } });
    assert.ok(saved.status === "ACCEPTED" || saved.status === "CANCELLED");
    const member = await prisma.userMembership.findUnique({
      where: { userId_tenantId: { userId: target.user.id, tenantId: fx.tenant.id } },
    });
    assert.equal(member?.status === "ACTIVE", saved.status === "ACCEPTED");
    if (member) {
      assert.deepEqual(member.roles, ["VIEWER"]);
      assert.equal(member.companyId, fx.ctx.companyId);
    }
  });

  it("cannot accept with a different email or reuse an accepted token", async () => {
    const fx = await fixture();
    const target = await invitedUser(fx);
    await assert.rejects(() => invitations.acceptTenantInvitation(target.token, { actorUserId: operatorId }),
      (e: unknown) => e instanceof ServiceError && e.code === "FORBIDDEN");
    assert.equal((await prisma.tenantInvitation.findUniqueOrThrow({ where: { id: target.inv.invitationId } })).status, "PENDING");
    await invitations.acceptTenantInvitation(target.token, { actorUserId: target.user.id });
    await assert.rejects(() => invitations.acceptTenantInvitation(target.token, { actorUserId: target.user.id }),
      (e: unknown) => e instanceof ServiceError && e.code === "CONFLICT");
  });

  it("expired acceptance persists EXPIRED without creating membership", async () => {
    const fx = await fixture();
    const target = await invitedUser(fx);
    await prisma.tenantInvitation.update({
      where: { id: target.inv.invitationId }, data: { expiresAt: new Date("2000-01-01T00:00:00.000Z") },
    });
    await assert.rejects(() => invitations.acceptTenantInvitation(target.token, { actorUserId: target.user.id }),
      (e: unknown) => e instanceof ServiceError && e.code === "CONFLICT");
    assert.equal((await prisma.tenantInvitation.findUniqueOrThrow({ where: { id: target.inv.invitationId } })).status, "EXPIRED");
    assert.equal(await prisma.userMembership.count({ where: { userId: target.user.id, tenantId: fx.tenant.id } }), 0);
  });

  for (const actor of ["tenant", "platform"] as const) {
    it(`${actor} cancellation keeps the automatic EXPIRED transition when rejecting a stale invitation`, async () => {
      const fx = await fixture();
      const target = await invitedUser(fx);
      await prisma.tenantInvitation.update({
        where: { id: target.inv.invitationId }, data: { expiresAt: new Date("2000-01-01T00:00:00.000Z") },
      });
      await assert.rejects(() => actor === "tenant"
        ? invitations.cancelTenantInvitation(target.inv.invitationId, fx.ctx)
        : platformInvitations.cancelPlatformTenantInvitation(fx.tenant.id, target.inv.invitationId, { actorUserId: operatorId }),
      (e: unknown) => e instanceof ServiceError && e.code === "CONFLICT");
      assert.equal((await prisma.tenantInvitation.findUniqueOrThrow({ where: { id: target.inv.invitationId } })).status, "EXPIRED");
      assert.equal(await prisma.auditLog.count({ where: { tenantId: fx.tenant.id, action: "TENANT_INVITATION_CANCELLED" } }), 0);
      assert.equal(await prisma.platformAuditLog.count({ where: { targetTenantId: fx.tenant.id, action: "platform.tenant.invitation_cancelled" } }), 0);
    });
  }

  it("suspension blocks acceptance and foreign companies cannot be invited", async () => {
    const fx = await fixture();
    const other = await fixture();
    await assert.rejects(() => invitations.createTenantInvitation({
      email: `audit-foreign-${randomUUID()}@example.invalid`, roles: ["VIEWER"], companyId: other.ctx.companyId,
    }, fx.ctx), (e: unknown) => e instanceof ServiceError && e.code === "NOT_FOUND");
    const target = await invitedUser(fx);
    await platform.updatePlatformTenantStatus({ tenantId: fx.tenant.id, status: "SUSPENDED" }, { actorUserId: operatorId });
    await assert.rejects(() => invitations.acceptTenantInvitation(target.token, { actorUserId: target.user.id }),
      (e: unknown) => e instanceof ServiceError && e.code === "CONFLICT");
    assert.equal(await prisma.userMembership.count({ where: { userId: target.user.id, tenantId: fx.tenant.id } }), 0);
  });

  it("tenant OWNER alone never grants platform access", async () => {
    const fx = await fixture();
    await assert.rejects(() => platform.extendPlatformTenantTrial(
      { tenantId: fx.tenant.id, additionalDays: 7 }, { actorUserId: fx.owners[0]!.userId },
    ), (e: unknown) => e instanceof ServiceError && e.code === "FORBIDDEN");
  });

  it("disabled configuration branches block tenant reads/mutations while platform and bearer acceptance remain available", async () => {
    const fx = await fixture();
    const target = await invitedUser(fx);
    await prisma.tenantModuleSetting.createMany({ data: [
      { tenantId: fx.tenant.id, moduleKey: "USERS_PERMISSIONS", isEnabled: false },
      { tenantId: fx.tenant.id, moduleKey: "TENANT_SETTINGS", isEnabled: false },
    ] });
    for (const operation of [
      () => listTenantMembers(fx.ctx),
      () => getTenantMemberById(fx.owners[0]!.id, fx.ctx),
      () => demote(fx.owners[0]!.id, fx.ctx),
      () => deactivate(fx.owners[0]!.id, fx.ctx),
      () => invitations.listTenantInvitations(fx.ctx),
      () => invitations.getTenantInvitationById(target.inv.invitationId, fx.ctx),
      () => invitations.createTenantInvitation({ email: `audit-disabled-${randomUUID()}@example.invalid`, roles: ["VIEWER"] }, fx.ctx),
      () => invitations.cancelTenantInvitation(target.inv.invitationId, fx.ctx),
    ]) {
      await assert.rejects(operation, (e: unknown) => e instanceof ServiceError && e.code === "FORBIDDEN");
    }
    await platformInvitations.createPlatformTenantInvitation({
      tenantId: fx.tenant.id, email: `audit-platform-disabled-${randomUUID()}@example.invalid`, roles: ["VIEWER"],
    }, { actorUserId: operatorId });
    await invitations.acceptTenantInvitation(target.token, { actorUserId: target.user.id });
    assert.equal(await prisma.userMembership.count({ where: { userId: target.user.id, tenantId: fx.tenant.id, status: "ACTIVE" } }), 1);
  });

  it("concurrent trial extensions add both increments", async () => {
    const fx = await fixture();
    await Promise.all([
      platform.extendPlatformTenantTrial({ tenantId: fx.tenant.id, additionalDays: 7 }, { actorUserId: operatorId }),
      platform.extendPlatformTenantTrial({ tenantId: fx.tenant.id, additionalDays: 7 }, { actorUserId: operatorId }),
    ]);
    const saved = await prisma.tenant.findUniqueOrThrow({ where: { id: fx.tenant.id } });
    assert.equal(saved.trialEndsAt?.getTime(), fx.tenant.trialEndsAt!.getTime() + 14 * 24 * 60 * 60 * 1000);
    assert.equal(await prisma.platformAuditLog.count({ where: { targetTenantId: fx.tenant.id, action: "platform.tenant.trial_extended" } }), 2);
  });

  it("SQL attention query keeps all overdue organizations beyond 300 rows and excludes a healthy trial", async () => {
    const healthy = await fixture();
    const ids: string[] = Array.from({ length: 305 }, () => randomUUID());
    await prisma.tenant.createMany({ data: ids.map((id) => ({
      id,
      name: "AG-01 overdue attention fixture",
      slug: `audit-attention-${id}`,
      status: "ACTIVE" as const,
      subscriptionStatus: "PAST_DUE" as const,
    })) });
    const attention = await operations.listPlatformExpirationAttention({ actorUserId: operatorId });
    const visibleIds = new Set(attention.map((row) => row.id));
    assert.ok(ids.every((id) => visibleIds.has(id)));
    assert.equal(visibleIds.has(healthy.tenant.id), false);
    assert.ok(attention.filter((row) => ids.includes(row.id)).every((row) => row.categories.includes("past_due")));
  });

  it("SQL attention flags suspended owner accounts as unavailable", async () => {
    const fx = await fixture();
    await prisma.userMembership.updateMany({
      where: { tenantId: fx.tenant.id, userId: operatorId }, data: { status: "INACTIVE" },
    });
    await prisma.user.updateMany({
      where: { id: { in: fx.owners.map((owner) => owner.userId) } }, data: { status: "SUSPENDED" },
    });
    const rows = await operations.listPlatformTenantsEnriched({ search: fx.tenant.slug }, { actorUserId: operatorId });
    const row = rows.find((entry) => entry.id === fx.tenant.id);
    assert.equal(row?.hasActiveOwner, false);
    assert.equal(row?.hasActiveUsers, false);
    const users = await platformUsers.listPlatformTenantUsers(fx.tenant.id, { actorUserId: operatorId });
    const ownerRows = users.filter((member) => member.roles.includes("OWNER"));
    assert.equal(ownerRows.length, 2);
    assert.ok(ownerRows.every((member) => member.membershipStatus === "ACTIVE" && member.userStatus === "SUSPENDED"));
    assert.equal(users.some((member) => member.membershipStatus === "ACTIVE" && member.userStatus === "ACTIVE" && member.roles.includes("OWNER")), false);
    const attention = await operations.listPlatformExpirationAttention({ actorUserId: operatorId });
    assert.deepEqual(attention.find((entry) => entry.id === fx.tenant.id)?.categories, ["no_active_owner", "no_active_users"]);
  });
});
