import type { SubscriptionStatus, TenantStatus } from "@bloqer/database";
import { prisma } from "@bloqer/database";
import {
  extendPlatformTenantTrialInputSchema,
  updatePlatformTenantPlanMetadataInputSchema,
  updatePlatformTenantStatusInputSchema,
} from "@bloqer/validators";
import { ServiceError } from "../types";
import { createPlatformAuditLog } from "./platform-audit.service";
import { assertPlatformAccess, type PlatformServiceContext } from "./platform-auth.service";

export type PlatformTenantListItem = {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  saasPlan: string;
  subscriptionStatus: SubscriptionStatus;
  trialEndsAt: Date | null;
  createdAt: Date;
};

export type PlatformTenantDetail = PlatformTenantListItem & {
  fiscalId: string | null;
  billingCustomerId: string | null;
  suspendedReason: string | null;
  platformInternalNotes: string | null;
  updatedAt: Date;
};

export type PlatformDashboardSummary = {
  totalTenants: number;
  byTenantStatus: Record<TenantStatus, number>;
  bySubscriptionStatus: Record<SubscriptionStatus, number>;
  trialsEndingWithin7Days: number;
};

function parsePlanMetadata(raw: unknown) {
  const parsed = updatePlatformTenantPlanMetadataInputSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ") || "validación";
    throw new ServiceError("VALIDATION", msg);
  }
  return parsed.data;
}

function parseStatusUpdate(raw: unknown) {
  const parsed = updatePlatformTenantStatusInputSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ") || "validación";
    throw new ServiceError("VALIDATION", msg);
  }
  return parsed.data;
}

function parseExtendTrial(raw: unknown) {
  const parsed = extendPlatformTenantTrialInputSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ") || "validación";
    throw new ServiceError("VALIDATION", msg);
  }
  return parsed.data;
}

export async function getPlatformDashboardSummary(ctx: PlatformServiceContext): Promise<PlatformDashboardSummary> {
  await assertPlatformAccess(ctx);
  const tenants = await prisma.tenant.findMany({
    select: {
      status: true,
      subscriptionStatus: true,
      trialEndsAt: true,
    },
  });
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
  const in7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  let trialsEndingWithin7Days = 0;
  for (const t of tenants) {
    byTenantStatus[t.status] += 1;
    bySubscriptionStatus[t.subscriptionStatus] += 1;
    if (t.trialEndsAt && t.trialEndsAt >= now && t.trialEndsAt <= in7) {
      trialsEndingWithin7Days += 1;
    }
  }
  return {
    totalTenants: tenants.length,
    byTenantStatus,
    bySubscriptionStatus,
    trialsEndingWithin7Days,
  };
}

export type ListPlatformTenantsFilters = {
  search?: string;
  limit?: number;
};

export async function listPlatformTenants(
  filters: ListPlatformTenantsFilters,
  ctx: PlatformServiceContext,
): Promise<PlatformTenantListItem[]> {
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
  return prisma.tenant.findMany({
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
}

export async function getPlatformTenantById(
  tenantId: string,
  ctx: PlatformServiceContext,
): Promise<PlatformTenantDetail> {
  await assertPlatformAccess(ctx);
  const row = await prisma.tenant.findFirst({
    where: { id: tenantId },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      saasPlan: true,
      subscriptionStatus: true,
      trialEndsAt: true,
      createdAt: true,
      fiscalId: true,
      billingCustomerId: true,
      suspendedReason: true,
      platformInternalNotes: true,
      updatedAt: true,
    },
  });
  if (!row) {
    throw new ServiceError("NOT_FOUND", "Tenant no encontrado");
  }
  return row;
}

export async function updatePlatformTenantStatus(raw: unknown, ctx: PlatformServiceContext): Promise<void> {
  await assertPlatformAccess(ctx);
  const input = parseStatusUpdate(raw);
  const existing = await prisma.tenant.findFirst({
    where: { id: input.tenantId },
    select: { id: true, status: true },
  });
  if (!existing) {
    throw new ServiceError("NOT_FOUND", "Tenant no encontrado");
  }
  const data: { status: typeof input.status; suspendedReason?: string | null } = { status: input.status };
  if (input.suspendedReason !== undefined) {
    data.suspendedReason = input.suspendedReason;
  }

  await prisma.$transaction(async (tx) => {
    await tx.tenant.update({
      where: { id: input.tenantId },
      data,
    });
    await createPlatformAuditLog(
      {
        actorUserId: ctx.actorUserId,
        action: "platform.tenant.status_updated",
        targetTenantId: input.tenantId,
        metadata: {
          beforeStatus: existing.status,
          afterStatus: input.status,
        },
      },
      tx,
    );
  });
}

export async function updatePlatformTenantPlanMetadata(raw: unknown, ctx: PlatformServiceContext): Promise<void> {
  await assertPlatformAccess(ctx);
  const input = parsePlanMetadata(raw);
  const existing = await prisma.tenant.findFirst({
    where: { id: input.tenantId },
    select: {
      id: true,
      saasPlan: true,
      subscriptionStatus: true,
      trialEndsAt: true,
      billingCustomerId: true,
      platformInternalNotes: true,
    },
  });
  if (!existing) {
    throw new ServiceError("NOT_FOUND", "Tenant no encontrado");
  }
  const data: {
    saasPlan?: string;
    subscriptionStatus?: SubscriptionStatus;
    trialEndsAt?: Date | null;
    billingCustomerId?: string | null;
    platformInternalNotes?: string | null;
  } = {};
  if (input.saasPlan !== undefined) data.saasPlan = input.saasPlan;
  if (input.subscriptionStatus !== undefined) data.subscriptionStatus = input.subscriptionStatus;
  if (input.trialEndsAt !== undefined) data.trialEndsAt = input.trialEndsAt;
  if (input.billingCustomerId !== undefined) data.billingCustomerId = input.billingCustomerId;
  if (input.platformInternalNotes !== undefined) data.platformInternalNotes = input.platformInternalNotes;

  if (Object.keys(data).length === 0) {
    throw new ServiceError("VALIDATION", "Nada para actualizar");
  }

  await prisma.$transaction(async (tx) => {
    await tx.tenant.update({
      where: { id: input.tenantId },
      data,
    });
    await createPlatformAuditLog(
      {
        actorUserId: ctx.actorUserId,
        action: "platform.tenant.plan_metadata_updated",
        targetTenantId: input.tenantId,
        metadata: {
          before: {
            saasPlan: existing.saasPlan,
            subscriptionStatus: existing.subscriptionStatus,
            trialEndsAt: existing.trialEndsAt?.toISOString() ?? null,
            billingCustomerId: existing.billingCustomerId,
          },
          after: {
            saasPlan: data.saasPlan ?? existing.saasPlan,
            subscriptionStatus: data.subscriptionStatus ?? existing.subscriptionStatus,
            trialEndsAt:
              data.trialEndsAt === undefined
                ? existing.trialEndsAt?.toISOString() ?? null
                : data.trialEndsAt === null
                  ? null
                  : data.trialEndsAt.toISOString(),
            billingCustomerId:
              data.billingCustomerId === undefined ? existing.billingCustomerId : data.billingCustomerId,
          },
        },
      },
      tx,
    );
  });
}

export async function extendPlatformTenantTrial(raw: unknown, ctx: PlatformServiceContext): Promise<void> {
  await assertPlatformAccess(ctx);
  const input = parseExtendTrial(raw);
  const existing = await prisma.tenant.findFirst({
    where: { id: input.tenantId },
    select: { id: true, trialEndsAt: true, subscriptionStatus: true },
  });
  if (!existing) {
    throw new ServiceError("NOT_FOUND", "Tenant no encontrado");
  }

  const now = new Date();
  const base =
    existing.trialEndsAt && existing.trialEndsAt.getTime() > now.getTime()
      ? existing.trialEndsAt
      : now;
  const newTrialEndsAt = new Date(base.getTime() + input.additionalDays * 24 * 60 * 60 * 1000);

  await prisma.$transaction(async (tx) => {
    await tx.tenant.update({
      where: { id: input.tenantId },
      data: {
        trialEndsAt: newTrialEndsAt,
        subscriptionStatus: existing.subscriptionStatus === "NONE" ? "TRIAL" : existing.subscriptionStatus,
      },
    });
    await createPlatformAuditLog(
      {
        actorUserId: ctx.actorUserId,
        action: "platform.tenant.trial_extended",
        targetTenantId: input.tenantId,
        metadata: {
          additionalDays: input.additionalDays,
          beforeTrialEndsAt: existing.trialEndsAt?.toISOString() ?? null,
          afterTrialEndsAt: newTrialEndsAt.toISOString(),
        },
      },
      tx,
    );
  });
}
