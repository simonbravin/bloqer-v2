import { prisma } from "@bloqer/database";
import type { Tenant } from "@bloqer/database";
import { can } from "@bloqer/domain";
import { log } from "../audit/audit.service";
import { ServiceContext, ServiceError } from "../types";

export interface CreateTenantInput {
  name: string;
  slug: string;
  fiscalId?: string;
  timezone?: string;
  baseCurrency?: string;
}

// Called during onboarding — no ctx required (user has no tenant yet).
export async function createTenant(input: CreateTenantInput, actorUserId: string): Promise<Tenant> {
  const existing = await prisma.tenant.findUnique({ where: { slug: input.slug } });
  if (existing) throw new ServiceError("CONFLICT", `Slug '${input.slug}' is already taken`);

  const tenant = await prisma.tenant.create({ data: input });

  await log({
    tenantId: tenant.id,
    actorUserId,
    action: "TENANT_CREATED",
    entityType: "Tenant",
    entityId: tenant.id,
    after: { name: tenant.name, slug: tenant.slug },
  });

  return tenant;
}

export async function getTenantById(id: string, ctx: ServiceContext): Promise<Tenant> {
  if (id !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  const tenant = await prisma.tenant.findUnique({ where: { id } });
  if (!tenant) throw new ServiceError("NOT_FOUND", "Tenant not found");
  return tenant;
}

export async function getTenantBySlug(slug: string): Promise<Tenant | null> {
  return prisma.tenant.findUnique({ where: { slug } });
}

export async function updateTenantStatus(
  tenantId: string,
  status: "ACTIVE" | "SUSPENDED" | "INACTIVE",
  ctx: ServiceContext,
): Promise<Tenant> {
  if (!can(ctx.roles, "APPROVE", "TENANT_SETTINGS")) {
    throw new ServiceError("FORBIDDEN", "Insufficient permissions to update tenant");
  }
  if (tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");

  const tenant = await prisma.tenant.update({ where: { id: tenantId }, data: { status } });

  await log({
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action: "TENANT_STATUS_UPDATED",
    entityType: "Tenant",
    entityId: tenantId,
    after: { status },
    ipAddress: ctx.ipAddress,
  });

  return tenant;
}
