import { prisma } from "@bloqer/database";
import type { UserMembership, UserRole } from "@bloqer/database";
import { can } from "@bloqer/domain";
import { log } from "../audit/audit.service";
import { ServiceContext, ServiceError } from "../types";

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
