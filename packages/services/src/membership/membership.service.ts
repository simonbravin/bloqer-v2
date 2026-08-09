import { prisma } from "@bloqer/database";
import type { UserMembership, UserRole } from "@bloqer/database";
import { can, type UserRole as DomainUserRole } from "@bloqer/domain";
import { isUuid } from "@bloqer/utils";
import { log } from "../audit/audit.service";
import { ServiceContext, ServiceError } from "../types";

/** Tenant + roles for session shell (`resolveTenantContext`); built only from DB — no Prisma in `apps/web`. */
export type SessionTenantContext = {
  tenantId: string;
  tenantName: string;
  companyId: string | null;
  roles: DomainUserRole[];
};

export async function getSessionTenantContext(
  userId: string,
  options?: { preferredTenantId?: string | null },
): Promise<SessionTenantContext | null> {
  const preferred = options?.preferredTenantId?.trim();
  if (preferred && isUuid(preferred)) {
    const preferredMembership = await prisma.userMembership.findUnique({
      where: { userId_tenantId: { userId, tenantId: preferred } },
    });
    if (preferredMembership?.status === "ACTIVE") {
      const preferredTenant = await prisma.tenant.findUnique({
        where: { id: preferredMembership.tenantId },
        select: { name: true, status: true },
      });
      if (preferredTenant?.status === "ACTIVE") {
        return {
          tenantId: preferredMembership.tenantId,
          tenantName: preferredTenant.name,
          companyId: preferredMembership.companyId,
          roles: preferredMembership.roles as DomainUserRole[],
        };
      }
      // Suspended preferred tenant: fall through (do not lock out other workspaces).
    }
  }

  // First ACTIVE membership whose tenant is still ACTIVE.
  const membership = await prisma.userMembership.findFirst({
    where: { userId, status: "ACTIVE", tenant: { status: "ACTIVE" } },
    orderBy: { createdAt: "asc" },
    include: { tenant: { select: { name: true, status: true } } },
  });
  if (!membership) return null;
  return {
    tenantId: membership.tenantId,
    tenantName: membership.tenant.name,
    companyId: membership.companyId,
    roles: membership.roles as DomainUserRole[],
  };
}

export interface CreateMembershipInput {
  userId: string;
  tenantId: string;
  companyId?: string;
  roles: UserRole[];
}

export async function getMembership(
  userId: string,
  tenantId: string,
): Promise<UserMembership | null> {
  return prisma.userMembership.findUnique({
    where: { userId_tenantId: { userId, tenantId } },
  });
}

/**
 * First ACTIVE membership for this user (ordered by `createdAt`).
 * **Contract (D-036 / ADR-Phase1-06):** at most one `UserMembership` row per `(userId, tenantId)` in Prisma.
 * If one user can belong to multiple tenants, prefer {@link getMembership} when `tenantId` is known.
 */
export async function getMembershipByUserId(userId: string): Promise<UserMembership | null> {
  return prisma.userMembership.findFirst({
    where: { userId, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
  });
}

export async function createMembership(
  input: CreateMembershipInput,
  ctx: ServiceContext,
): Promise<UserMembership> {
  if (!can(ctx.roles, "APPROVE", "USERS_PERMISSIONS")) {
    throw new ServiceError("FORBIDDEN", "Insufficient permissions to manage memberships");
  }
  if (input.tenantId !== ctx.tenantId) {
    throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  }

  if (input.companyId) {
    const company = await prisma.company.findFirst({
      where: { id: input.companyId, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!company) {
      throw new ServiceError("VALIDATION", "La empresa no pertenece a este espacio de trabajo");
    }
  }

  const existing = await getMembership(input.userId, input.tenantId);
  if (existing) throw new ServiceError("CONFLICT", "User already has a membership in this tenant");

  const membership = await prisma.userMembership.create({ data: input });

  await log({
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action: "MEMBERSHIP_CREATED",
    entityType: "UserMembership",
    entityId: membership.id,
    after: { userId: input.userId, roles: input.roles },
    ipAddress: ctx.ipAddress,
  });

  return membership;
}

export async function getUserRoles(
  userId: string,
  tenantId: string,
): Promise<UserRole[]> {
  const membership = await getMembership(userId, tenantId);
  return membership?.status === "ACTIVE" ? membership.roles : [];
}
