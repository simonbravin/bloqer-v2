import { getMembershipByUserId } from "@bloqer/services";
import { prisma } from "@bloqer/database";
import type { UserRole } from "@bloqer/domain";

export interface TenantContext {
  tenantId: string;
  tenantName: string;
  companyId: string | null;
  roles: UserRole[];
}

export async function resolveTenantContext(userId: string): Promise<TenantContext | null> {
  const membership = await getMembershipByUserId(userId);
  if (!membership) return null;

  const tenant = await prisma.tenant.findUnique({ where: { id: membership.tenantId } });
  if (!tenant) return null;

  return {
    tenantId: membership.tenantId,
    tenantName: tenant.name,
    companyId: membership.companyId,
    roles: membership.roles as UserRole[],
  };
}
