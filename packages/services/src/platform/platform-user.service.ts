import type { UserRole } from "@bloqer/domain";
import { prisma } from "@bloqer/database";
import { ServiceError } from "../types";
import { assertPlatformAccess, type PlatformServiceContext } from "./platform-auth.service";

export type PlatformTenantUserRow = {
  membershipId: string;
  userId: string;
  email: string;
  name: string | null;
  roles: UserRole[];
  membershipStatus: string;
};

export async function listPlatformTenantUsers(
  tenantId: string,
  ctx: PlatformServiceContext,
): Promise<PlatformTenantUserRow[]> {
  await assertPlatformAccess(ctx);
  const tenant = await prisma.tenant.findFirst({ where: { id: tenantId }, select: { id: true } });
  if (!tenant) {
    throw new ServiceError("NOT_FOUND", "Tenant no encontrado");
  }
  const rows = await prisma.userMembership.findMany({
    where: { tenantId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      status: true,
      roles: true,
      user: { select: { id: true, email: true, name: true } },
    },
  });
  return rows.map((m) => ({
    membershipId: m.id,
    userId:       m.user.id,
    email:        m.user.email,
    name:         m.user.name,
    roles:        m.roles as UserRole[],
    membershipStatus: m.status,
  }));
}
