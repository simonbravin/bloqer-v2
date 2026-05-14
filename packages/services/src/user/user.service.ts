import { prisma } from "@bloqer/database";
import type { User, UserStatus } from "@bloqer/database";
import { can } from "@bloqer/domain";
import { updateMyUserProfileSchema } from "@bloqer/validators";
import { log } from "../audit/audit.service";
import { ServiceContext, ServiceError } from "../types";

export interface SyncUserFromOAuthInput {
  email: string;
  name?: string | null;
  image?: string | null;
}

export async function getUserById(id: string): Promise<User | null> {
  return prisma.user.findUnique({ where: { id } });
}

export async function getUserByEmail(email: string): Promise<User | null> {
  return prisma.user.findUnique({ where: { email } });
}

export async function syncUserFromOAuth(input: SyncUserFromOAuthInput): Promise<User> {
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
  });
}

/** Updates the signed-in user's display name. Scoped to `ctx.tenantId` for audit only. */
export async function updateMyUserProfile(
  input: unknown,
  ctx: ServiceContext,
): Promise<User> {
  const parsed = updateMyUserProfileSchema.safeParse(input);
  if (!parsed.success) {
    throw new ServiceError("VALIDATION", parsed.error.flatten().formErrors[0] ?? "Datos inválidos");
  }

  const membership = await prisma.userMembership.findFirst({
    where: { userId: ctx.actorUserId, tenantId: ctx.tenantId },
  });
  if (!membership) {
    throw new ServiceError("FORBIDDEN", "No tenés acceso a este espacio de trabajo");
  }

  const before = await prisma.user.findUnique({
    where: { id: ctx.actorUserId },
    select: { name: true },
  });

  const user = await prisma.user.update({
    where: { id: ctx.actorUserId },
    data: { name: parsed.data.name },
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
  });

  return user;
}

export async function updateUserStatus(
  userId: string,
  status: UserStatus,
  ctx: ServiceContext,
): Promise<User> {
  if (!can(ctx.roles, "APPROVE", "USERS_PERMISSIONS")) {
    throw new ServiceError("FORBIDDEN", "Insufficient permissions to update user status");
  }

  const membership = await prisma.userMembership.findFirst({
    where: { userId, tenantId: ctx.tenantId },
  });
  if (!membership) throw new ServiceError("NOT_FOUND", "User not found in this tenant");

  const before = await prisma.user.findUnique({ where: { id: userId }, select: { status: true } });
  const user = await prisma.user.update({ where: { id: userId }, data: { status } });

  await log({
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action: "USER_STATUS_UPDATED",
    entityType: "User",
    entityId: userId,
    before: { status: before?.status },
    after: { status },
    ipAddress: ctx.ipAddress,
  });

  return user;
}
