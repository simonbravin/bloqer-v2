import type { SubscriptionStatus, TenantStatus } from "@bloqer/database";
import { prisma } from "@bloqer/database";
import { ServiceError } from "../types";
import { assertPlatformAccess, type PlatformServiceContext } from "./platform-auth.service";
import type { PlatformTenantListItem } from "./platform-tenant.service";

export type PlatformTenantOperationalFlags = {
  hasActiveOwner: boolean;
  hasActiveUsers: boolean;
  trialExpired: boolean;
  trialEndingWithinDays: number | null;
};

export type PlatformTenantListItemEnriched = PlatformTenantListItem & PlatformTenantOperationalFlags;

export type PlatformExpirationCategory =
  | "trial_ending_7"
  | "trial_ending_14"
  | "trial_ending_30"
  | "trial_expired"
  | "past_due"
  | "suspended"
  | "no_active_owner"
  | "no_active_users";

export type PlatformExpirationRow = PlatformTenantListItemEnriched & {
  categories: PlatformExpirationCategory[];
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function daysUntil(date: Date, now: Date): number {
  return Math.ceil((date.getTime() - now.getTime()) / MS_PER_DAY);
}

function computeTrialEndingWithinDays(
  trialEndsAt: Date | null,
  subscriptionStatus: SubscriptionStatus,
  now: Date,
): number | null {
  if (!trialEndsAt || subscriptionStatus !== "TRIAL") return null;
  const days = daysUntil(trialEndsAt, now);
  if (days < 0) return null;
  if (days <= 7) return 7;
  if (days <= 14) return 14;
  if (days <= 30) return 30;
  return null;
}

function isTrialExpired(
  trialEndsAt: Date | null,
  subscriptionStatus: SubscriptionStatus,
  now: Date,
): boolean {
  return subscriptionStatus === "TRIAL" && trialEndsAt !== null && trialEndsAt < now;
}

async function loadMembershipFlagsByTenant(
  tenantIds: string[],
): Promise<Map<string, { hasActiveOwner: boolean; hasActiveUsers: boolean }>> {
  const map = new Map<string, { hasActiveOwner: boolean; hasActiveUsers: boolean }>();
  for (const id of tenantIds) {
    map.set(id, { hasActiveOwner: false, hasActiveUsers: false });
  }
  if (tenantIds.length === 0) return map;

  const memberships = await prisma.userMembership.findMany({
    where: { tenantId: { in: tenantIds }, status: "ACTIVE" },
    select: { tenantId: true, roles: true },
  });

  for (const m of memberships) {
    const entry = map.get(m.tenantId)!;
    entry.hasActiveUsers = true;
    if (m.roles.includes("OWNER")) entry.hasActiveOwner = true;
  }
  return map;
}

function enrichTenant(
  row: PlatformTenantListItem,
  flags: { hasActiveOwner: boolean; hasActiveUsers: boolean },
  now: Date,
): PlatformTenantListItemEnriched {
  return {
    ...row,
    hasActiveOwner: flags.hasActiveOwner,
    hasActiveUsers: flags.hasActiveUsers,
    trialExpired: isTrialExpired(row.trialEndsAt, row.subscriptionStatus, now),
    trialEndingWithinDays: computeTrialEndingWithinDays(row.trialEndsAt, row.subscriptionStatus, now),
  };
}

function expirationCategories(
  row: PlatformTenantListItemEnriched,
  now: Date,
): PlatformExpirationCategory[] {
  const cats: PlatformExpirationCategory[] = [];
  if (row.trialExpired) cats.push("trial_expired");
  if (row.subscriptionStatus === "PAST_DUE") cats.push("past_due");
  if (row.status === "SUSPENDED") cats.push("suspended");
  if (!row.hasActiveOwner) cats.push("no_active_owner");
  if (!row.hasActiveUsers) cats.push("no_active_users");
  if (row.trialEndsAt && row.subscriptionStatus === "TRIAL" && row.trialEndsAt >= now) {
    const days = daysUntil(row.trialEndsAt, now);
    if (days <= 7) cats.push("trial_ending_7");
    else if (days <= 14) cats.push("trial_ending_14");
    else if (days <= 30) cats.push("trial_ending_30");
  }
  return cats;
}

export async function listPlatformTenantsEnriched(
  filters: { search?: string; limit?: number },
  ctx: PlatformServiceContext,
): Promise<PlatformTenantListItemEnriched[]> {
  await assertPlatformAccess(ctx);
  const limit = Math.min(Math.max(filters.limit ?? 80, 1), 200);
  const where =
    filters.search?.trim()
      ? {
          OR: [
            { name: { contains: filters.search.trim(), mode: "insensitive" as const } },
            { slug: { contains: filters.search.trim(), mode: "insensitive" as const } },
          ],
        }
      : {};

  const rows = await prisma.tenant.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      saasPlan: true,
      subscriptionStatus: true,
      trialEndsAt: true,
      createdAt: true,
    },
  });

  const now = new Date();
  const flagMap = await loadMembershipFlagsByTenant(rows.map((r) => r.id));
  return rows.map((r) =>
    enrichTenant(r, flagMap.get(r.id) ?? { hasActiveOwner: false, hasActiveUsers: false }, now),
  );
}

export async function listPlatformExpirationAttention(
  ctx: PlatformServiceContext,
): Promise<PlatformExpirationRow[]> {
  await assertPlatformAccess(ctx);
  const now = new Date();

  const rows = await prisma.tenant.findMany({
    orderBy: [{ trialEndsAt: "asc" }, { name: "asc" }],
    take: 300,
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      saasPlan: true,
      subscriptionStatus: true,
      trialEndsAt: true,
      createdAt: true,
    },
  });

  const flagMap = await loadMembershipFlagsByTenant(rows.map((r) => r.id));
  return rows
    .map((r) => {
      const enriched = enrichTenant(
        r,
        flagMap.get(r.id) ?? { hasActiveOwner: false, hasActiveUsers: false },
        now,
      );
      return { ...enriched, categories: expirationCategories(enriched, now) };
    })
    .filter((row) => row.categories.length > 0)
    .sort((a, b) => {
      const aTrial = a.trialEndsAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const bTrial = b.trialEndsAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
      if (aTrial !== bTrial) return aTrial - bTrial;
      return a.name.localeCompare(b.name, "es");
    });
}

export type PlatformDashboardSummaryExtended = {
  totalTenants: number;
  byTenantStatus: Record<TenantStatus, number>;
  bySubscriptionStatus: Record<SubscriptionStatus, number>;
  trialsEndingWithin7Days: number;
  trialsExpired: number;
  pastDueCount: number;
  tenantsWithoutActiveOwner: number;
};

export async function getPlatformDashboardSummaryExtended(
  ctx: PlatformServiceContext,
): Promise<PlatformDashboardSummaryExtended> {
  await assertPlatformAccess(ctx);
  const tenants = await prisma.tenant.findMany({
    select: {
      id: true,
      status: true,
      subscriptionStatus: true,
      trialEndsAt: true,
    },
  });

  const tenantIds = tenants.map((t) => t.id);
  const flagMap = await loadMembershipFlagsByTenant(tenantIds);

  const byTenantStatus: Record<TenantStatus, number> = {
    ACTIVE: 0,
    SUSPENDED: 0,
    INACTIVE: 0,
  };
  const bySubscriptionStatus: Record<SubscriptionStatus, number> = {
    NONE: 0,
    TRIAL: 0,
    ACTIVE: 0,
    PAST_DUE: 0,
    CANCELLED: 0,
  };

  const now = new Date();
  const in7 = new Date(now.getTime() + 7 * MS_PER_DAY);
  let trialsEndingWithin7Days = 0;
  let trialsExpired = 0;
  let pastDueCount = 0;
  let tenantsWithoutActiveOwner = 0;

  for (const t of tenants) {
    byTenantStatus[t.status] += 1;
    bySubscriptionStatus[t.subscriptionStatus] += 1;
    if (t.subscriptionStatus === "PAST_DUE") pastDueCount += 1;
    if (isTrialExpired(t.trialEndsAt, t.subscriptionStatus, now)) trialsExpired += 1;
    if (t.trialEndsAt && t.trialEndsAt >= now && t.trialEndsAt <= in7 && t.subscriptionStatus === "TRIAL") {
      trialsEndingWithin7Days += 1;
    }
    const flags = flagMap.get(t.id);
    if (!flags?.hasActiveOwner) tenantsWithoutActiveOwner += 1;
  }

  return {
    totalTenants: tenants.length,
    byTenantStatus,
    bySubscriptionStatus,
    trialsEndingWithin7Days,
    trialsExpired,
    pastDueCount,
    tenantsWithoutActiveOwner,
  };
}
