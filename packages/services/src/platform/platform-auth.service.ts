import { isEmailPlatformSuperadminAllowlisted } from "@bloqer/config";
import { prisma } from "@bloqer/database";
import { ServiceError } from "../types";

/** Context for platform-only operations (no tenant RBAC). */
export type PlatformServiceContext = {
  actorUserId: string;
  ipAddress?: string | null;
};

/**
 * Platform superadmin: OR of (1) email in PLATFORM_SUPERADMIN_EMAILS env, (2) active PlatformAdmin row.
 * Never uses tenant membership roles.
 */
export async function isPlatformSuperadmin(actorUserId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: actorUserId },
    select: { email: true },
  });
  if (!user?.email?.trim()) return false;
  if (isEmailPlatformSuperadminAllowlisted(user.email)) return true;
  const row = await prisma.platformAdmin.findFirst({
    where: { userId: actorUserId, active: true },
    select: { id: true },
  });
  return Boolean(row);
}

export async function assertPlatformAccess(ctx: PlatformServiceContext): Promise<void> {
  const ok = await isPlatformSuperadmin(ctx.actorUserId);
  if (!ok) {
    throw new ServiceError("FORBIDDEN", "Sin acceso a la consola de plataforma");
  }
}
