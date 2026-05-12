import { prisma } from "@bloqer/database";
import type { User, UserStatus } from "@bloqer/database";
import { can } from "@bloqer/domain";
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
