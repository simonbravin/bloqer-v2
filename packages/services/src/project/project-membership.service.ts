/**
 * ProjectMembership CRUD — access ACL (D-111), not notification roster.
 * Permission = what (roles). Membership = where (when MEMBERSHIP_SCOPED).
 */

import { prisma } from "@bloqer/database";
import { can } from "@bloqer/domain";
import type { ServiceContext } from "../types";
import { ServiceError } from "../types";
import { log } from "../audit/audit.service";
import { requireProjectInTenant } from "../project/require-project-in-tenant";
import {
  clearProjectAccessModeCache,
  getTenantProjectAccessMode,
  hasTenantWideProjectAccess,
  requireProjectAccess,
  type ProjectAccessMode,
} from "../security/access";

function assertCanManageProjectMemberships(roles: ServiceContext["roles"]): void {
  // Same ceiling as Equipo role edits ([D-111] admin surface).
  if (!can(roles, "EDIT", "USERS_PERMISSIONS")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para administrar acceso a obras.");
  }
}

function assertCanChangeProjectAccessMode(roles: ServiceContext["roles"]): void {
  if (!can(roles, "EDIT", "TENANT_SETTINGS") && !hasTenantWideProjectAccess(roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para cambiar el modo de acceso a obras.");
  }
}

function hasProjectFacingCapability(roles: ServiceContext["roles"]): boolean {
  return can(roles, "VIEW", "PROJECTS") || can(roles, "EDIT", "PROJECTS");
}

export type UserProjectAccessProjectRow = {
  projectId: string;
  code: string;
  name: string;
  status: string;
  assigned: boolean;
};

export type UserProjectAccessEditor = {
  mode: ProjectAccessMode;
  userId: string;
  email: string;
  name: string | null;
  /** Target user has tenant-wide project visibility (bypass membership). */
  targetHasTenantWideAccess: boolean;
  assignedCount: number;
  totalProjects: number;
  projects: UserProjectAccessProjectRow[];
};

/**
 * Editor payload for Configuración → Equipo → Acceso a obras.
 * Single projects query + memberships for user (no N+1 canAccessProject).
 */
export async function getUserProjectAccessEditor(
  userId: string,
  ctx: ServiceContext,
): Promise<UserProjectAccessEditor> {
  assertCanManageProjectMemberships(ctx.roles);

  const membership = await prisma.userMembership.findFirst({
    where: { tenantId: ctx.tenantId, userId, status: "ACTIVE" },
    select: {
      roles: true,
      user: { select: { id: true, email: true, name: true } },
    },
  });
  if (!membership) {
    throw new ServiceError("NOT_FOUND", "Usuario no encontrado en este tenant.");
  }

  const mode = await getTenantProjectAccessMode(ctx.tenantId);
  const targetRoles = membership.roles as ServiceContext["roles"];
  const targetHasTenantWideAccess = hasTenantWideProjectAccess(targetRoles);

  const [projects, assignedRows] = await Promise.all([
    prisma.project.findMany({
      where: { tenantId: ctx.tenantId, status: { not: "CANCELLED" } },
      select: { id: true, code: true, name: true, status: true },
      orderBy: [{ code: "asc" }],
    }),
    prisma.projectMembership.findMany({
      where: { tenantId: ctx.tenantId, userId },
      select: { projectId: true },
    }),
  ]);

  const assigned = new Set(assignedRows.map((r) => r.projectId));
  const rows: UserProjectAccessProjectRow[] = projects.map((p) => ({
    projectId: p.id,
    code: p.code ?? "",
    name: p.name,
    status: p.status,
    assigned: assigned.has(p.id),
  }));

  return {
    mode,
    userId: membership.user.id,
    email: membership.user.email,
    name: membership.user.name,
    targetHasTenantWideAccess,
    assignedCount: rows.filter((r) => r.assigned).length,
    totalProjects: rows.length,
    projects: rows,
  };
}

/**
 * Replace the user's project memberships with `projectIds` (tenant-validated).
 * Works under TENANT_WIDE (preparation) and MEMBERSHIP_SCOPED (live ACL).
 */
export async function setUserProjectMemberships(
  userId: string,
  projectIds: string[],
  ctx: ServiceContext,
): Promise<{ added: number; removed: number }> {
  assertCanManageProjectMemberships(ctx.roles);

  const member = await prisma.userMembership.findFirst({
    where: { tenantId: ctx.tenantId, userId, status: "ACTIVE" },
    select: { id: true },
  });
  if (!member) {
    throw new ServiceError("VALIDATION", "El usuario no pertenece a este tenant.");
  }

  const uniqueIds = [...new Set(projectIds)];
  for (const projectId of uniqueIds) {
    await requireProjectInTenant(projectId, ctx.tenantId);
  }

  const existing = await prisma.projectMembership.findMany({
    where: { tenantId: ctx.tenantId, userId },
    select: { id: true, projectId: true },
  });
  const existingSet = new Set(existing.map((e) => e.projectId));
  const desiredSet = new Set(uniqueIds);

  const toAdd = uniqueIds.filter((id) => !existingSet.has(id));
  const toRemove = existing.filter((e) => !desiredSet.has(e.projectId));

  await prisma.$transaction(async (tx) => {
    for (const projectId of toAdd) {
      await tx.projectMembership.create({
        data: {
          tenantId: ctx.tenantId,
          projectId,
          userId,
          createdBy: ctx.actorUserId,
        },
      });
    }
    if (toRemove.length > 0) {
      await tx.projectMembership.deleteMany({
        where: { id: { in: toRemove.map((r) => r.id) }, tenantId: ctx.tenantId },
      });
    }
  });

  if (toAdd.length > 0 || toRemove.length > 0) {
    await log({
      tenantId: ctx.tenantId,
      actorUserId: ctx.actorUserId,
      action: "project_membership.user_set",
      entityType: "User",
      entityId: userId,
      after: {
        addedProjectIds: toAdd,
        removedProjectIds: toRemove.map((r) => r.projectId),
      },
    });
  }

  return { added: toAdd.length, removed: toRemove.length };
}

export async function listProjectMemberships(
  projectId: string,
  ctx: ServiceContext,
): Promise<Array<{ id: string; userId: string; email: string; name: string | null }>> {
  assertCanManageProjectMemberships(ctx.roles);
  await requireProjectAccess(projectId, ctx);
  const rows = await prisma.projectMembership.findMany({
    where: { tenantId: ctx.tenantId, projectId },
    include: { user: { select: { id: true, email: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    email: r.user.email,
    name: r.user.name,
  }));
}

export async function addProjectMembership(
  projectId: string,
  userId: string,
  ctx: ServiceContext,
): Promise<{ id: string }> {
  assertCanManageProjectMemberships(ctx.roles);
  await requireProjectInTenant(projectId, ctx.tenantId);

  const member = await prisma.userMembership.findFirst({
    where: { tenantId: ctx.tenantId, userId, status: "ACTIVE" },
    select: { id: true },
  });
  if (!member) {
    throw new ServiceError("VALIDATION", "El usuario no pertenece a este tenant.");
  }

  const row = await prisma.projectMembership.upsert({
    where: {
      tenantId_projectId_userId: {
        tenantId: ctx.tenantId,
        projectId,
        userId,
      },
    },
    create: {
      tenantId: ctx.tenantId,
      projectId,
      userId,
      createdBy: ctx.actorUserId,
    },
    update: {},
    select: { id: true },
  });

  await log({
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action: "project_membership.added",
    entityType: "ProjectMembership",
    entityId: row.id,
    projectId,
    after: { userId, projectId },
  });

  return row;
}

export async function removeProjectMembership(
  projectId: string,
  membershipId: string,
  ctx: ServiceContext,
): Promise<void> {
  assertCanManageProjectMemberships(ctx.roles);
  await requireProjectInTenant(projectId, ctx.tenantId);
  const row = await prisma.projectMembership.findFirst({
    where: { id: membershipId, tenantId: ctx.tenantId, projectId },
  });
  if (!row) throw new ServiceError("NOT_FOUND", "Membresía no encontrada.");
  await prisma.projectMembership.delete({ where: { id: row.id } });
  await log({
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action: "project_membership.removed",
    entityType: "ProjectMembership",
    entityId: membershipId,
    projectId,
    before: { userId: row.userId, projectId },
  });
}

export type MembershipScopedActivationPreview = {
  currentMode: ProjectAccessMode;
  projectCount: number;
  activeMemberCount: number;
  membersWithMembership: number;
  membersWithoutProjects: Array<{ userId: string; email: string; name: string | null }>;
  /** Users with project VIEW/EDIT who would lose all obras (excl. tenant-wide). */
  projectCapableWithoutProjects: Array<{ userId: string; email: string; name: string | null }>;
  companyWideAccessCount: number;
};

/**
 * Preview impact of enabling MEMBERSHIP_SCOPED (no mutation).
 * Always recomputed server-side at confirm time.
 */
export async function previewMembershipScopedActivation(
  ctx: ServiceContext,
): Promise<MembershipScopedActivationPreview> {
  if (
    !can(ctx.roles, "EDIT", "USERS_PERMISSIONS") &&
    !can(ctx.roles, "EDIT", "TENANT_SETTINGS") &&
    !hasTenantWideProjectAccess(ctx.roles)
  ) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para previsualizar el acceso a obras.");
  }
  const currentMode = await getTenantProjectAccessMode(ctx.tenantId);
  const [members, membershipRows, projectCount] = await Promise.all([
    prisma.userMembership.findMany({
      where: { tenantId: ctx.tenantId, status: "ACTIVE" },
      select: {
        userId: true,
        roles: true,
        user: { select: { email: true, name: true } },
      },
    }),
    prisma.projectMembership.findMany({
      where: { tenantId: ctx.tenantId },
      select: { userId: true },
    }),
    prisma.project.count({
      where: { tenantId: ctx.tenantId, status: { not: "CANCELLED" } },
    }),
  ]);
  const withMembership = new Set(membershipRows.map((r) => r.userId));
  let companyWideAccessCount = 0;
  const membersWithoutProjects: MembershipScopedActivationPreview["membersWithoutProjects"] = [];
  const projectCapableWithoutProjects: MembershipScopedActivationPreview["projectCapableWithoutProjects"] =
    [];
  for (const m of members) {
    const roles = m.roles as ServiceContext["roles"];
    if (hasTenantWideProjectAccess(roles)) {
      companyWideAccessCount += 1;
      continue;
    }
    if (!withMembership.has(m.userId)) {
      const row = {
        userId: m.userId,
        email: m.user.email,
        name: m.user.name,
      };
      membersWithoutProjects.push(row);
      if (hasProjectFacingCapability(roles)) {
        projectCapableWithoutProjects.push(row);
      }
    }
  }
  return {
    currentMode,
    projectCount,
    activeMemberCount: members.length,
    membersWithMembership: withMembership.size,
    membersWithoutProjects,
    projectCapableWithoutProjects,
    companyWideAccessCount,
  };
}

export type SetProjectAccessModeInput = {
  mode: ProjectAccessMode;
  /** Required when activating SCOPED and there are project-capable users without memberships. */
  confirmLockouts?: boolean;
};

/**
 * Switch access mode. Recalculates preview; refuses SCOPED without tenant-wide actor;
 * requires confirmLockouts when project-capable users would be locked out.
 * Memberships are never deleted when switching back to TENANT_WIDE.
 */
export async function setTenantProjectAccessMode(
  input: SetProjectAccessModeInput,
  ctx: ServiceContext,
): Promise<{ mode: ProjectAccessMode }> {
  assertCanChangeProjectAccessMode(ctx.roles);
  const mode = input.mode;

  if (mode === "MEMBERSHIP_SCOPED") {
    if (!hasTenantWideProjectAccess(ctx.roles)) {
      throw new ServiceError(
        "FORBIDDEN",
        "Solo un usuario con acceso global a obras puede activar el modo restringido.",
      );
    }
    const preview = await previewMembershipScopedActivation(ctx);
    if (
      preview.projectCapableWithoutProjects.length > 0 &&
      input.confirmLockouts !== true
    ) {
      throw new ServiceError(
        "VALIDATION",
        `${preview.projectCapableWithoutProjects.length} usuario(s) con permisos de proyecto quedarían sin acceso a ninguna obra. Confirmá la revisión de asignaciones.`,
      );
    }
  }

  const before = await getTenantProjectAccessMode(ctx.tenantId);
  await prisma.tenant.update({
    where: { id: ctx.tenantId },
    data: { projectAccessMode: mode },
  });
  clearProjectAccessModeCache();
  const after = await getTenantProjectAccessMode(ctx.tenantId);

  await log({
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action: "tenant.project_access_mode_changed",
    entityType: "Tenant",
    entityId: ctx.tenantId,
    before: { projectAccessMode: before },
    after: { projectAccessMode: after },
  });

  return { mode: after };
}

export type ImportTeamMembershipsPreview = {
  projectId: string;
  wouldCreate: number;
  alreadyExists: number;
  teamSize: number;
};

export async function previewImportMembershipsFromProjectTeam(
  projectId: string,
  ctx: ServiceContext,
): Promise<ImportTeamMembershipsPreview> {
  assertCanManageProjectMemberships(ctx.roles);
  await requireProjectInTenant(projectId, ctx.tenantId);
  const team = await prisma.projectTeamMember.findMany({
    where: { tenantId: ctx.tenantId, projectId },
    select: { userId: true },
  });
  const existing = await prisma.projectMembership.findMany({
    where: {
      tenantId: ctx.tenantId,
      projectId,
      userId: { in: team.map((t) => t.userId) },
    },
    select: { userId: true },
  });
  const existingSet = new Set(existing.map((e) => e.userId));
  const wouldCreate = team.filter((t) => !existingSet.has(t.userId)).length;
  return {
    projectId,
    wouldCreate,
    alreadyExists: existing.length,
    teamSize: team.length,
  };
}

/** Optional import helper — copies ProjectTeamMember rows into memberships (suggestion only). */
export async function importMembershipsFromProjectTeam(
  projectId: string,
  ctx: ServiceContext,
): Promise<{ created: number; alreadyExists: number; teamSize: number }> {
  assertCanManageProjectMemberships(ctx.roles);
  await requireProjectInTenant(projectId, ctx.tenantId);
  const preview = await previewImportMembershipsFromProjectTeam(projectId, ctx);
  const team = await prisma.projectTeamMember.findMany({
    where: { tenantId: ctx.tenantId, projectId },
    select: { userId: true },
  });
  let created = 0;
  for (const t of team) {
    const before = await prisma.projectMembership.findUnique({
      where: {
        tenantId_projectId_userId: {
          tenantId: ctx.tenantId,
          projectId,
          userId: t.userId,
        },
      },
    });
    if (before) continue;
    await prisma.projectMembership.create({
      data: {
        tenantId: ctx.tenantId,
        projectId,
        userId: t.userId,
        createdBy: ctx.actorUserId,
      },
    });
    created += 1;
  }

  await log({
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action: "project_membership.import_from_team",
    entityType: "Project",
    entityId: projectId,
    projectId,
    after: { created, alreadyExists: preview.alreadyExists, teamSize: preview.teamSize },
  });

  return {
    created,
    alreadyExists: preview.alreadyExists,
    teamSize: preview.teamSize,
  };
}

export async function getTenantProjectAccessModeForAdmin(
  ctx: ServiceContext,
): Promise<ProjectAccessMode> {
  if (
    !can(ctx.roles, "VIEW", "USERS_PERMISSIONS") &&
    !can(ctx.roles, "VIEW", "TENANT_SETTINGS")
  ) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver el modo de acceso a obras.");
  }
  return getTenantProjectAccessMode(ctx.tenantId);
}
