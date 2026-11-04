import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { prisma } from "@bloqer/database";
import { OVERVIEW_MODULES } from "@bloqer/domain";
import { completeTrialOnboardingInputSchema } from "@bloqer/validators";
import { assertAuditDatabaseIdentity } from "../testing/audit-fixture";
import { ServiceError } from "../types";

describe("AG-01 first workspace SQL lifecycle", { skip: process.env.BLOQER_AUDIT_LIVE !== "1" }, () => {
  let completeTrialOnboarding: typeof import("./onboarding.service")["completeTrialOnboarding"];
  let provisionPlatformTenant: typeof import("../platform/platform-tenant-provision.service")["provisionPlatformTenant"];
  before(async () => {
    await assertAuditDatabaseIdentity(prisma);
    ({ completeTrialOnboarding } = await import("./onboarding.service"));
    ({ provisionPlatformTenant } = await import("../platform/platform-tenant-provision.service"));
  });
  after(async () => { await prisma.$disconnect(); });
  const input = (name = `Audit onboarding ${randomUUID()}`) => completeTrialOnboardingInputSchema.parse({
    displayName: name, legalName: "Synthetic audit organization", taxId: "SYNTHETIC-AUDIT", country: "AR",
    city: "Synthetic city", address: "Synthetic address", phone: "0000000000",
  });
  const user = () => prisma.user.create({ data: { email: `audit-onboarding-${randomUUID()}@example.invalid`, status: "ACTIVE" } });

  it("parallel submissions by one actor create one complete workspace and return the same id", async () => {
    const actor = await user();
    const data = input();
    const results = await Promise.all([completeTrialOnboarding(actor.id, data), completeTrialOnboarding(actor.id, data)]);
    assert.equal(results.filter((r) => r.status === "created").length, 1);
    assert.equal(results[0]!.tenantId, results[1]!.tenantId);
    const tenantId = results[0]!.tenantId;
    assert.equal(await prisma.userMembership.count({ where: { userId: actor.id } }), 1);
    assert.equal(await prisma.company.count({ where: { tenantId } }), 1);
    assert.equal(await prisma.tenantModuleSetting.count({ where: { tenantId, isEnabled: true } }), OVERVIEW_MODULES.length);
    assert.equal(await prisma.auditLog.count({ where: { tenantId } }), 3);
  });

  it("two actors choosing the same display name get separate unique slugs", async () => {
    const actors = await Promise.all([user(), user()]);
    const data = input();
    const results = await Promise.all(actors.map((actor) => completeTrialOnboarding(actor.id, data)));
    assert.ok(results.every((r) => r.status === "created"));
    assert.notEqual(results[0]!.tenantId, results[1]!.tenantId);
    const tenants = await prisma.tenant.findMany({ where: { id: { in: results.map((r) => r.tenantId) } } });
    assert.equal(new Set(tenants.map((r) => r.slug)).size, 2);
  });

  it("a disabled account cannot create an organization directly", async () => {
    const actor = await user();
    await prisma.user.update({ where: { id: actor.id }, data: { status: "SUSPENDED" } });
    await assert.rejects(() => completeTrialOnboarding(actor.id, input()), (e: unknown) => e instanceof ServiceError && e.code === "FORBIDDEN");
    assert.equal(await prisma.userMembership.count({ where: { userId: actor.id } }), 0);
  });

  it("platform provisioning shares the slug lock with self-service onboarding", async () => {
    const operator = await user();
    const actor = await user();
    await prisma.platformAdmin.create({ data: { userId: operator.id, active: true } });
    const data = input();
    const [self, platform] = await Promise.all([
      completeTrialOnboarding(actor.id, data),
      provisionPlatformTenant({ ...data, ownerEmail: `audit-invited-${randomUUID()}@example.invalid` }, { actorUserId: operator.id }),
    ]);
    assert.notEqual(self.tenantId, platform.tenantId);
    assert.equal(await prisma.tenantInvitation.count({ where: { tenantId: platform.tenantId, status: "PENDING" } }), 1);
    assert.equal(await prisma.platformAuditLog.count({ where: { targetTenantId: platform.tenantId } }), 2);
  });

  it("a pending invitation prevents an accidental second trial workspace", async () => {
    const actor = await user();
    const tenant = await prisma.tenant.create({ data: { name: "Synthetic inviting organization", slug: `audit-invite-${randomUUID()}` } });
    await prisma.tenantInvitation.create({ data: {
      tenantId: tenant.id, email: actor.email, roles: ["VIEWER"], tokenHash: randomUUID(),
      invitedByUserId: actor.id, expiresAt: new Date(Date.now() + 60_000),
    } });
    await assert.rejects(() => completeTrialOnboarding(actor.id, input()), (e: unknown) => e instanceof ServiceError && e.code === "CONFLICT");
    assert.equal(await prisma.userMembership.count({ where: { userId: actor.id } }), 0);
  });
});
