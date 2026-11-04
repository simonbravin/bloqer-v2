import { prisma } from "@bloqer/database";
import type { UserStatus } from "@bloqer/database";
import { can } from "@bloqer/domain";
import { updateMyUserProfileSchema } from "@bloqer/validators";
import { log } from "../audit/audit.service";
import { ServiceContext, ServiceError } from "../types";
import { assertStillHasActiveOwnerAfterDeactivate } from "../tenant-settings/tenant-owner-invariant";
import { assertTenantModuleEnabled } from "../tenant-modules/tenant-module.service";

export interface SyncUserFromOAuthInput {
  email: string;
  name?: string | null;
  image?: string | null;
}

/** Public profile fields only — never expose passwordHash to callers. */
export type UserPublicProfile = {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  status: UserStatus;
};

const publicProfileSelect = {
  id: true, email: true, name: true, image: true, status: true,
} as const;

export async function getUserById(id: string): Promise<UserPublicProfile | null> {
  return prisma.user.findUnique({
    where: { id },
    select: publicProfileSelect,
  });
}

export async function getUserByEmail(email: string): Promise<UserPublicProfile | null> {
  return prisma.user.findUnique({ where: { email }, select: publicProfileSelect });
}

export async function syncUserFromOAuth(input: SyncUserFromOAuthInput): Promise<UserPublicProfile> {
  return prisma.user.upsert({
    where: { email: input.email },
    update: {
      name: input.name ?? undefined,
      image: input.image ?? undefined,
    },
    create: {
      email: input.email,
      name: input.name,
      image: input.image,
      status: "ACTIVE",
    },
    select: publicProfileSelect,
  });
}

/** Updates the signed-in user's display name. Scoped to `ctx.tenantId` for audit only. */
export async function updateMyUserProfile(
  input: unknown,
  ctx: ServiceContext,
): Promise<UserPublicProfile> {
  const parsed = updateMyUserProfileSchema.safeParse(input);
  if (!parsed.success) {
    throw new ServiceError("VALIDATION", parsed.error.flatten().formErrors[0] ?? "Datos inválidos");
  }

  return prisma.$transaction(async (tx) => {
    // Share team-management's tenant lock so removal cannot race this guard.
    await tx.$queryRaw`SELECT id FROM tenants WHERE id = ${ctx.tenantId} FOR UPDATE`;
    const membership = await tx.userMembership.findFirst({
      where: {
        userId: ctx.actorUserId, tenantId: ctx.tenantId, status: "ACTIVE",
        user: { status: "ACTIVE" }, tenant: { status: "ACTIVE" },
      },
      select: { id: true },
    });
    if (!membership) {
      throw new ServiceError("FORBIDDEN", "No tenés acceso a este espacio de trabajo");
    }

    const before = await tx.user.findUnique({
      where: { id: ctx.actorUserId }, select: { name: true },
    });
    const user = await tx.user.update({
      where: { id: ctx.actorUserId }, data: { name: parsed.data.name }, select: publicProfileSelect,
    });
    await log({
      tenantId: ctx.tenantId,
      actorUserId: ctx.actorUserId,
      action: "USER_PROFILE_UPDATED",
      entityType: "User",
      entityId: ctx.actorUserId,
      before: { name: before?.name ?? null },
      after: { name: user.name },
      ipAddress: ctx.ipAddress,
    }, tx);
    return user;
  });
}

/**
 * Global User.status affects login across all tenants. Prefer membership INACTIVE
 * via team management. Only allowed when the user has no memberships outside this tenant.
 */
export async function updateUserStatus(
  userId: string,
  status: UserStatus,
  ctx: ServiceContext,
): Promise<UserPublicProfile> {
  if (!can(ctx.roles, "APPROVE", "USERS_PERMISSIONS")) {
    throw new ServiceError("FORBIDDEN", "Insufficient permissions to update user status");
  }
  await assertTenantModuleEnabled(ctx, "USERS_PERMISSIONS");

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM tenants WHERE id = ${ctx.tenantId} FOR UPDATE`;
    const membership = await tx.userMembership.findFirst({
      where: { userId, tenantId: ctx.tenantId },
      select: { id: true, status: true, roles: true },
    });
    if (!membership) throw new ServiceError("NOT_FOUND", "User not found in this tenant");

    const otherMemberships = await tx.userMembership.count({
      where: { userId, tenantId: { not: ctx.tenantId } },
    });
    if (otherMemberships > 0) {
      throw new ServiceError(
        "CONFLICT",
        "No se puede cambiar el estado global del usuario: pertenece a otros espacios. Desactivá la membresía en este tenant.",
      );
    }

    const before = await tx.user.findUnique({ where: { id: userId }, select: { status: true } });
    if (before?.status === "ACTIVE" && status !== "ACTIVE" && membership.status === "ACTIVE") {
      const activeRows = await tx.userMembership.findMany({
        where: { tenantId: ctx.tenantId, status: "ACTIVE", user: { status: "ACTIVE" } },
        select: { id: true, roles: true },
      });
      assertStillHasActiveOwnerAfterDeactivate(activeRows, membership.id);
    }
    const user = await tx.user.update({
      where: { id: userId }, data: { status }, select: publicProfileSelect,
    });

    await log({
      tenantId: ctx.tenantId,
      actorUserId: ctx.actorUserId,
      action: "USER_STATUS_UPDATED",
      entityType: "User",
      entityId: userId,
      before: { status: before?.status },
      after: { status },
      ipAddress: ctx.ipAddress,
    }, tx);
    return user;
  });
}
