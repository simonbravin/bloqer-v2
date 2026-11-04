import assert from "node:assert/strict";
import { test } from "node:test";
import { prisma } from "@bloqer/database";
import type { PlatformTenantListItem } from "./platform-tenant.service";
import { getPlatformDashboardSummary } from "./platform-tenant.service";
import {
  getPlatformDashboardSummaryExtended,
  listPlatformExpirationAttention,
  listPlatformTenantsEnriched,
} from "./platform-operations.service";

const platformCtx = { actorUserId: "platform-test-operator" };

type MembershipFixture = {
  tenantId: string;
  roles: string[];
  userStatus: "ACTIVE" | "SUSPENDED" | "INACTIVE";
};

async function withTenants(
  rows: PlatformTenantListItem[],
  run: () => Promise<void>,
  memberships: MembershipFixture[] = rows.map((row) => ({ tenantId: row.id, roles: ["OWNER"], userStatus: "ACTIVE" })),
) {
  const original = {
    user: prisma.user.findUnique,
    admin: prisma.platformAdmin.findFirst,
    tenants: prisma.tenant.findMany,
    members: prisma.userMembership.findMany,
  };
  prisma.user.findUnique = (async () => ({ email: "platform-test@example.invalid" })) as unknown as typeof original.user;
  prisma.platformAdmin.findFirst = (async () => ({ id: "platform-admin" })) as unknown as typeof original.admin;
  prisma.tenant.findMany = (async ({ take }: { take?: number }) => rows.slice(0, take ?? rows.length)) as unknown as typeof original.tenants;
  prisma.userMembership.findMany = (async ({ where }: { where: { user?: { status: string } } }) =>
    memberships.filter((m) => !where.user || m.userStatus === where.user.status)
      .map(({ tenantId, roles }) => ({ tenantId, roles }))) as unknown as typeof original.members;
  try {
    await run();
  } finally {
    prisma.user.findUnique = original.user;
    prisma.platformAdmin.findFirst = original.admin;
    prisma.tenant.findMany = original.tenants;
    prisma.userMembership.findMany = original.members;
  }
}

function tenant(id: string, patch: Partial<PlatformTenantListItem> = {}): PlatformTenantListItem {
  return {
    id,
    name: id,
    slug: id,
    status: "ACTIVE",
    saasPlan: "trial",
    subscriptionStatus: "TRIAL",
    trialEndsAt: null,
    createdAt: new Date(),
    ...patch,
  };
}

test("attention includes overdue organizations beyond the former 300-row cutoff", async () => {
  const rows = Array.from({ length: 305 }, (_, n) => tenant(`organization-${n}`, { subscriptionStatus: "PAST_DUE" }));
  await withTenants(rows, async () => {
    const attention = await listPlatformExpirationAttention(platformCtx);
    assert.equal(attention.length, 305);
    assert.ok(attention.some((t) => t.id === "organization-304" && t.categories.includes("past_due")));
  });
});

test("a trial expired within the last day is not also shown as upcoming", async () => {
  const row = tenant("expired", { trialEndsAt: new Date(Date.now() - 60 * 60 * 1000) });
  await withTenants([row], async () => {
    const [result] = await listPlatformTenantsEnriched({}, platformCtx);
    assert.equal(result?.trialExpired, true);
    assert.equal(result?.trialEndingWithinDays, null);
    const [attention] = await listPlatformExpirationAttention(platformCtx);
    assert.deepEqual(attention?.categories, ["trial_expired"]);
  });
});

test("trial KPI ignores a date left on an organization whose subscription is ACTIVE", async () => {
  const trialEndsAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await withTenants([
    tenant("trial", { trialEndsAt }),
    tenant("paid", { subscriptionStatus: "ACTIVE", trialEndsAt }),
  ], async () => {
    const summary = await getPlatformDashboardSummary(platformCtx);
    assert.equal(summary.trialsEndingWithin7Days, 1);
  });
});

test("suspended or inactive owner accounts cannot satisfy platform availability flags", async () => {
  await withTenants([tenant("healthy"), tenant("unavailable")], async () => {
    const rows = await listPlatformTenantsEnriched({}, platformCtx);
    const healthy = rows.find((row) => row.id === "healthy");
    const unavailable = rows.find((row) => row.id === "unavailable");
    assert.equal(healthy?.hasActiveOwner, true);
    assert.equal(healthy?.hasActiveUsers, true);
    assert.equal(unavailable?.hasActiveOwner, false);
    assert.equal(unavailable?.hasActiveUsers, false);
    const summary = await getPlatformDashboardSummaryExtended(platformCtx);
    assert.equal(summary.tenantsWithoutActiveOwner, 1);
    const attention = await listPlatformExpirationAttention(platformCtx);
    assert.deepEqual(attention.find((row) => row.id === "unavailable")?.categories, ["no_active_owner", "no_active_users"]);
  }, [
    { tenantId: "healthy", roles: ["OWNER"], userStatus: "ACTIVE" },
    { tenantId: "unavailable", roles: ["OWNER"], userStatus: "SUSPENDED" },
    { tenantId: "unavailable", roles: ["OWNER"], userStatus: "INACTIVE" },
  ]);
});
