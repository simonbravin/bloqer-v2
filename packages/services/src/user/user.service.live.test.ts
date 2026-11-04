import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { afterEach, before, beforeEach, describe, it } from "node:test";
import { prisma } from "@bloqer/database";
import { assertAuditDatabaseIdentity } from "../testing/audit-fixture";
import { ServiceError, type ServiceContext } from "../types";
import { updateMyUserProfile, updateUserStatus } from "./user.service";

describe("user service PostgreSQL profile and owner safeguards", {
  skip: process.env.BLOQER_AUDIT_LIVE !== "1", concurrency: false,
}, () => {
  let ctx: ServiceContext;
  let membershipId: string;

  before(async () => { await assertAuditDatabaseIdentity(prisma); });

  beforeEach(async () => {
    const suffix = randomUUID();
    const tenant = await prisma.tenant.create({
      data: { name: "AG-01 profile fixture", slug: `audit-profile-${suffix}` },
    });
    const user = await prisma.user.create({ data: {
      email: `audit-profile-${suffix}@example.test`, name: "Previous", status: "ACTIVE",
      passwordHash: "private-audit-hash", emailVerified: new Date(),
    } });
    const membership = await prisma.userMembership.create({ data: {
      tenantId: tenant.id, userId: user.id, status: "ACTIVE", roles: ["OWNER"],
    } });
    membershipId = membership.id;
    ctx = { actorUserId: user.id, tenantId: tenant.id, companyId: null, roles: ["OWNER"] };
  });

  afterEach(async () => {
    if (!ctx) return;
    await prisma.auditLog.deleteMany({ where: { tenantId: ctx.tenantId } });
    await prisma.userMembership.deleteMany({ where: { tenantId: ctx.tenantId } });
    await prisma.tenant.deleteMany({ where: { id: ctx.tenantId } });
    await prisma.user.deleteMany({ where: { id: ctx.actorUserId } });
  });

  it("returns public profile fields and records the committed change", async () => {
    const result = await updateMyUserProfile({ name: "Updated" }, ctx);
    assert.deepEqual(Object.keys(result).sort(), ["email", "id", "image", "name", "status"]);
    assert.equal(result.name, "Updated");
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: ctx.actorUserId } })).passwordHash, "private-audit-hash");
    assert.equal(await prisma.auditLog.count({ where: {
      tenantId: ctx.tenantId, action: "USER_PROFILE_UPDATED", entityId: ctx.actorUserId,
    } }), 1);
  });

  it("rejects profile changes for an inactive membership", async () => {
    await prisma.userMembership.update({ where: { id: membershipId }, data: { status: "INACTIVE" } });
    await assert.rejects(() => updateMyUserProfile({ name: "Updated" }, ctx),
      (error: unknown) => error instanceof ServiceError && error.code === "FORBIDDEN");
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: ctx.actorUserId } })).name, "Previous");
    assert.equal(await prisma.auditLog.count({ where: { tenantId: ctx.tenantId } }), 0);
  });

  it("rejects profile changes while the tenant is suspended", async () => {
    await prisma.tenant.update({ where: { id: ctx.tenantId }, data: { status: "SUSPENDED" } });
    await assert.rejects(() => updateMyUserProfile({ name: "Updated" }, ctx),
      (error: unknown) => error instanceof ServiceError && error.code === "FORBIDDEN");
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: ctx.actorUserId } })).name, "Previous");
  });

  it("preserves the only active owner when global account suspension is requested", async () => {
    await assert.rejects(() => updateUserStatus(ctx.actorUserId, "SUSPENDED", ctx),
      (error: unknown) => error instanceof ServiceError && error.code === "CONFLICT");
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: ctx.actorUserId } })).status, "ACTIVE");
    assert.equal(await prisma.auditLog.count({ where: { tenantId: ctx.tenantId } }), 0);
  });
});
