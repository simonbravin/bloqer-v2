import { prisma } from "@bloqer/database";
import type { UserMembership, UserRole } from "@bloqer/database";
import { can, type UserRole as DomainUserRole } from "@bloqer/domain";
import { isUuid } from "@bloqer/utils";
import { updateTenantMemberRolesInputSchema } from "@bloqer/validators";
import { log } from "../audit/audit.service";
import {
  findActiveCompanyInTenant,
  getSoleActiveCompanyIdForTenant,
  resolveDefaultCompanyIdForTenant,
} from "../company/company.service";
import { ServiceContext, ServiceError } from "../types";
import { assertTenantModuleEnabled } from "../tenant-modules/tenant-module.service";

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
    if (preferredMembership?.status === "ACTIVE" && preferredMembership.roles.length > 0) {
      const preferredTenant = await prisma.tenant.findUnique({
        where: { id: preferredMembership.tenantId },
        select: { name: true, status: true },
      });
      if (preferredTenant?.status === "ACTIVE") {
        const company = await sessionCompanyScope(preferredMembership.tenantId, preferredMembership.companyId);
        if (company) {
          return {
            tenantId: preferredMembership.tenantId,
            tenantName: preferredTenant.name,
            companyId: company.companyId,
            roles: preferredMembership.roles as DomainUserRole[],
          };
        }
      }
      // Suspended preferred tenant: fall through (do not lock out other workspaces).
    }
  }

  // An invalid explicit company must never turn an anchored membership into a global one.
  const memberships = await prisma.userMembership.findMany({
    where: { userId, status: "ACTIVE", tenant: { status: "ACTIVE" } },
    orderBy: { createdAt: "asc" },
    include: { tenant: { select: { name: true, status: true } } },
  });
  for (const membership of memberships) {
    if (membership.roles.length === 0) continue;
    const company = await sessionCompanyScope(membership.tenantId, membership.companyId);
    if (!company) continue;
    return {
      tenantId: membership.tenantId,
      tenantName: membership.tenant.name,
      companyId: company.companyId,
      roles: membership.roles as DomainUserRole[],
    };
  }
  return null;
}

/** null means the explicit binding is invalid; { companyId: null } is a valid global scope. */
async function sessionCompanyScope(
  tenantId: string,
  membershipCompanyId: string | null,
): Promise<{ companyId: string | null } | null> {
  const membership = membershipCompanyId?.trim() || null;
  if (membership) {
    const companyId = await findActiveCompanyInTenant(membership, tenantId);
    return companyId ? { companyId } : null;
  }
  return { companyId: await getSoleActiveCompanyIdForTenant(tenantId) };
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
  await assertTenantModuleEnabled(ctx, "USERS_PERMISSIONS");
  if (!can(ctx.roles, "APPROVE", "USERS_PERMISSIONS")) {
    throw new ServiceError("FORBIDDEN", "Insufficient permissions to manage memberships");
  }
  if (input.tenantId !== ctx.tenantId) {
    throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  }
  const roleInput = updateTenantMemberRolesInputSchema.shape.roles.safeParse(input.roles);
  if (!roleInput.success) throw new ServiceError("VALIDATION", "Asigná al menos un rol válido al miembro.");

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM tenants WHERE id = ${ctx.tenantId} FOR UPDATE`;
    const companyId =
      (await resolveDefaultCompanyIdForTenant(ctx.tenantId, input.companyId, tx)) ?? undefined;

    const existing = await tx.userMembership.findUnique({ where: { userId_tenantId: { userId: input.userId, tenantId: input.tenantId } } });
    if (existing) throw new ServiceError("CONFLICT", "User already has a membership in this tenant");

    const membership = await tx.userMembership.create({
      data: { ...input, roles: [...new Set(roleInput.data)], companyId },
    });

    await log({
      tenantId: ctx.tenantId,
      actorUserId: ctx.actorUserId,
      action: "MEMBERSHIP_CREATED",
      entityType: "UserMembership",
      entityId: membership.id,
      companyId: membership.companyId,
      after: { userId: input.userId, roles: input.roles, companyId: membership.companyId },
      ipAddress: ctx.ipAddress,
    }, tx);

    return membership;
  });
}

export async function getUserRoles(
  userId: string,
  tenantId: string,
): Promise<UserRole[]> {
  const membership = await getMembership(userId, tenantId);
  return membership?.status === "ACTIVE" ? membership.roles : [];
}
