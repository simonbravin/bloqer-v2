import { prisma } from "@bloqer/database";
import type { MembershipStatus, UserRole as PrismaUserRole } from "@bloqer/database";
import { updateTenantMemberRolesInputSchema, updateTenantMemberStatusInputSchema } from "@bloqer/validators";
import type { UserRole } from "@bloqer/domain";
import { log } from "../audit/audit.service";
import { ServiceContext, ServiceError } from "../types";
import {
  canEditTeamMembership,
  canReadTenantConfigArea,
} from "./tenant-settings-guards";
import {
  assertStillHasActiveOwnerAfterDeactivate,
  assertStillHasActiveOwnerAfterRoleChange,
} from "./tenant-owner-invariant";

/**
 * Team mutations enforce “≥1 ACTIVE OWNER” when the tenant already had one, using a read-then-write pattern.
 * Two concurrent writers can still race; full serialisation would need DB-level locking (out of 10B scope).
 */

export type TenantMemberListRow = {
  membershipId: string;
  userId:       string;
  email:        string;
  name:         string | null;
  status:       MembershipStatus;
  roles:        UserRole[];
  createdAt:    Date;
};

export type TenantMemberDetail = TenantMemberListRow & {
  updatedAt: Date;
};

function dedupeRoles(roles: UserRole[]): PrismaUserRole[] {
  return [...new Set(roles)] as PrismaUserRole[];
}

export async function listTenantMembers(ctx: ServiceContext): Promise<TenantMemberListRow[]> {
  if (!canReadTenantConfigArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver el equipo");
  }
  const rows = await prisma.userMembership.findMany({
    where: { tenantId: ctx.tenantId },
    orderBy: { createdAt: "asc" },
    select: {
      id:        true,
      status:    true,
      roles:     true,
      createdAt: true,
      user:      { select: { id: true, email: true, name: true } },
    },
  });
  return rows.map((m) => ({
    membershipId: m.id,
    userId:       m.user.id,
    email:        m.user.email,
    name:         m.user.name,
    status:       m.status,
    roles:        m.roles as UserRole[],
    createdAt:    m.createdAt,
  }));
}

export async function getTenantMemberById(
  membershipId: string,
  ctx: ServiceContext,
): Promise<TenantMemberDetail> {
  if (!canReadTenantConfigArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver el equipo");
  }
  const m = await prisma.userMembership.findFirst({
    where: { id: membershipId, tenantId: ctx.tenantId },
    select: {
      id:        true,
      status:    true,
      roles:     true,
      createdAt: true,
      updatedAt: true,
      user:      { select: { id: true, email: true, name: true } },
    },
  });
  if (!m) throw new ServiceError("NOT_FOUND", "Membresía no encontrada");
  return {
    membershipId: m.id,
    userId:       m.user.id,
    email:        m.user.email,
    name:         m.user.name,
    status:       m.status,
    roles:        m.roles as UserRole[],
    createdAt:    m.createdAt,
    updatedAt:    m.updatedAt,
  };
}

export async function updateTenantMemberRoles(
  membershipId: string,
  roles: UserRole[],
  ctx: ServiceContext,
): Promise<void> {
  if (!canEditTeamMembership(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para editar roles");
  }
  const parsed = updateTenantMemberRolesInputSchema.safeParse({ membershipId, roles });
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ") || "validación";
    throw new ServiceError("VALIDATION", msg);
  }
  const unique = dedupeRoles(parsed.data.roles);
  if (unique.length === 0) {
    throw new ServiceError("VALIDATION", "Al menos un rol es obligatorio");
  }

  const existing = await prisma.userMembership.findFirst({
    where: { id: parsed.data.membershipId, tenantId: ctx.tenantId },
    select: { id: true, userId: true, status: true, roles: true },
  });
  if (!existing) throw new ServiceError("NOT_FOUND", "Membresía no encontrada");

  if (existing.status === "ACTIVE") {
    const activeRows = await prisma.userMembership.findMany({
      where: { tenantId: ctx.tenantId, status: "ACTIVE" },
      select: { id: true, roles: true },
    });
    assertStillHasActiveOwnerAfterRoleChange(existing.id, unique, activeRows);
  }

  const beforeRoles = [...existing.roles] as UserRole[];

  await prisma.userMembership.update({
    where: { id: existing.id },
    data: { roles: unique },
  });

  await log({
    tenantId:    ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action:      "MEMBERSHIP_ROLES_UPDATED",
    entityType:  "UserMembership",
    entityId:    existing.id,
    before:      { userId: existing.userId, roles: beforeRoles },
    after:       { userId: existing.userId, roles: unique },
    ipAddress:   ctx.ipAddress,
  });
}

export async function updateTenantMemberStatus(
  membershipId: string,
  status: MembershipStatus,
  ctx: ServiceContext,
): Promise<void> {
  if (!canEditTeamMembership(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para cambiar el estado de la membresía");
  }
  const parsed = updateTenantMemberStatusInputSchema.safeParse({ membershipId, status });
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ") || "validación";
    throw new ServiceError("VALIDATION", msg);
  }

  const existing = await prisma.userMembership.findFirst({
    where: { id: parsed.data.membershipId, tenantId: ctx.tenantId },
    select: { id: true, userId: true, status: true, roles: true },
  });
  if (!existing) throw new ServiceError("NOT_FOUND", "Membresía no encontrada");

  if (parsed.data.status === "INACTIVE" && existing.status === "ACTIVE") {
    const activeRows = await prisma.userMembership.findMany({
      where: { tenantId: ctx.tenantId, status: "ACTIVE" },
      select: { id: true, roles: true },
    });
    assertStillHasActiveOwnerAfterDeactivate(activeRows, existing.id);
  }

  const beforeStatus = existing.status;

  await prisma.userMembership.update({
    where: { id: existing.id },
    data: { status: parsed.data.status },
  });

  await log({
    tenantId:    ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action:      "MEMBERSHIP_STATUS_UPDATED",
    entityType:  "UserMembership",
    entityId:    existing.id,
    before:      { userId: existing.userId, status: beforeStatus },
    after:       { userId: existing.userId, status: parsed.data.status },
    ipAddress:   ctx.ipAddress,
  });
}
