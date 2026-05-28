import { prisma } from "@bloqer/database";
import { listPlatformAuditLogFiltersSchema } from "@bloqer/validators";
import { ServiceError } from "../types";
import { assertPlatformAccess, type PlatformServiceContext } from "./platform-auth.service";

export type PlatformAuditLogRow = {
  id: string;
  action: string;
  actorUserId: string;
  actorEmail: string;
  actorName: string | null;
  targetTenantId: string | null;
  targetTenantName: string | null;
  targetTenantSlug: string | null;
  createdAt: Date;
  metadata: unknown;
};

export type ListPlatformAuditLogFilters = {
  targetTenantId?: string;
  action?: string;
  limit?: number;
};

function parseAuditFilters(raw: ListPlatformAuditLogFilters) {
  const parsed = listPlatformAuditLogFiltersSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ") || "validación";
    throw new ServiceError("VALIDATION", msg);
  }
  return parsed.data;
}

function mapAuditRow(r: {
  id: string;
  action: string;
  actorUserId: string;
  targetTenantId: string | null;
  createdAt: Date;
  metadata: unknown;
  actor: { email: string; name: string | null };
  targetTenant: { name: string; slug: string } | null;
}): PlatformAuditLogRow {
  return {
    id: r.id,
    action: r.action,
    actorUserId: r.actorUserId,
    actorEmail: r.actor.email,
    actorName: r.actor.name,
    targetTenantId: r.targetTenantId,
    targetTenantName: r.targetTenant?.name ?? null,
    targetTenantSlug: r.targetTenant?.slug ?? null,
    createdAt: r.createdAt,
    metadata: r.metadata,
  };
}

const auditSelect = {
  id: true,
  action: true,
  actorUserId: true,
  targetTenantId: true,
  createdAt: true,
  metadata: true,
  actor: { select: { email: true, name: true } },
  targetTenant: { select: { name: true, slug: true } },
} as const;

export async function listPlatformAuditLog(
  filters: ListPlatformAuditLogFilters,
  ctx: PlatformServiceContext,
): Promise<PlatformAuditLogRow[]> {
  await assertPlatformAccess(ctx);
  const input = parseAuditFilters(filters);
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);

  const where: { targetTenantId?: string; action?: string } = {};
  if (input.targetTenantId) where.targetTenantId = input.targetTenantId;
  if (input.action) where.action = input.action;

  const rows = await prisma.platformAuditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
    select: auditSelect,
  });

  return rows.map(mapAuditRow);
}

export async function listPlatformAuditLogForTenant(
  tenantId: string,
  ctx: PlatformServiceContext,
  options?: { limit?: number },
): Promise<PlatformAuditLogRow[]> {
  await assertPlatformAccess(ctx);
  const tenant = await prisma.tenant.findFirst({ where: { id: tenantId }, select: { id: true } });
  if (!tenant) throw new ServiceError("NOT_FOUND", "Tenant no encontrado");

  const limit = Math.min(Math.max(options?.limit ?? 30, 1), 100);
  const rows = await prisma.platformAuditLog.findMany({
    where: { targetTenantId: tenantId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: auditSelect,
  });

  return rows.map(mapAuditRow);
}
