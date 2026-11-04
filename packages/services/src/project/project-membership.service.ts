/**
 * ProjectMembership CRUD — access ACL (D-111), not notification roster.
 * Permission = what (roles). Membership = where (when MEMBERSHIP_SCOPED).
 */

import { prisma, type Prisma } from "@bloqer/database";
import { can } from "@bloqer/domain";
import type { ServiceContext } from "../types";
import { ServiceError } from "../types";
import { log } from "../audit/audit.service";
import { companyScopeFilter, isCrossCompany } from "../company-scope";
import { getSoleActiveCompanyIdForTenant } from "../company/company.service";
import { assertTenantModuleEnabled, getTenantModuleGate } from "../tenant-modules/tenant-module.service";
import {
  clearProjectAccessModeCache,
  getTenantProjectAccessMode,
  hasTenantWideProjectAccess,
  requireProjectAccess,
  type ProjectAccessMode,
} from "../security/access";

async function assertCanManageProjectMemberships(ctx: ServiceContext): Promise<void> {
  // Same ceiling as Equipo role edits ([D-111] admin surface).
  if (!can(ctx.roles, "EDIT", "USERS_PERMISSIONS")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para administrar acceso a obras.");
  }
  await assertTenantModuleEnabled(ctx, "USERS_PERMISSIONS");
}

async function assertCanChangeProjectAccessMode(ctx: ServiceContext): Promise<void> {
  if (!can(ctx.roles, "EDIT", "TENANT_SETTINGS") && !hasTenantWideProjectAccess(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para cambiar el modo de acceso a obras.");
  }
  await assertTenantModuleEnabled(ctx, "TENANT_SETTINGS");
}

type MembershipDb = Prisma.TransactionClient | typeof prisma;

/** Same tenant row lock as tenant membership/role writes: read/diff/write share one snapshot. */
async function lockMembershipWrites(tx: Prisma.TransactionClient, tenantId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM tenants WHERE id = ${tenantId} FOR UPDATE`;
}

async function manageableProject(projectId: string, ctx: ServiceContext, db: MembershipDb) {
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { id: true, tenantId: true, companyId: true, status: true },
  });
  if (!project) throw new ServiceError("NOT_FOUND", "Proyecto no encontrado.");
  if (project.tenantId !== ctx.tenantId || isCrossCompany(project.companyId, ctx)) {
    throw new ServiceError("FORBIDDEN", "El proyecto no está dentro de tu alcance.");
  }
  return project;
}

async function activeTargetMember(
  userId: string,
  ctx: ServiceContext,
  db: MembershipDb,
  missingCode: "NOT_FOUND" | "VALIDATION" = "VALIDATION",
) {
  const member = await db.userMembership.findFirst({
    where: { tenantId: ctx.tenantId, userId, status: "ACTIVE" },
    select: {
      id: true, companyId: true, roles: true,
      company: { select: { tenantId: true, status: true } },
      user: { select: { id: true, email: true, name: true } },
    },
  });
  if (!member) throw new ServiceError(missingCode, "El usuario no pertenece a este tenant.");
  if (member.companyId && (member.company?.tenantId !== ctx.tenantId || member.company.status !== "ACTIVE")) {
    throw new ServiceError("VALIDATION", "La empresa asignada al usuario no está activa en el tenant.");
  }
  if (isCrossCompany(member.companyId, ctx)) {
    throw new ServiceError("FORBIDDEN", "El usuario pertenece a otra empresa.");
  }
  const effectiveCompanyId = member.companyId ?? await getSoleActiveCompanyIdForTenant(ctx.tenantId, db);
  return { ...member, effectiveCompanyId };
}

function targetCompanyScope(companyId: string | null): Prisma.ProjectWhereInput {
  return companyId ? { OR: [{ companyId }, { companyId: null }] } : {};
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
  await assertCanManageProjectMemberships(ctx);

  const membership = await activeTargetMember(userId, ctx, prisma, "NOT_FOUND");

  const mode = await getTenantProjectAccessMode(ctx.tenantId);
  const targetRoles = membership.roles as ServiceContext["roles"];
  const targetHasTenantWideAccess = hasTenantWideProjectAccess(targetRoles);

  const [projects, assignedRows] = await Promise.all([
    prisma.project.findMany({
      where: {
        tenantId: ctx.tenantId, status: { not: "CANCELLED" },
        AND: [companyScopeFilter(ctx), targetCompanyScope(membership.effectiveCompanyId)],
      },
      select: { id: true, code: true, name: true, status: true },
      orderBy: [{ code: "asc" }],
    }),
    prisma.projectMembership.findMany({
      where: {
        tenantId: ctx.tenantId, userId,
        project: {
          tenantId: ctx.tenantId, status: { not: "CANCELLED" },
          AND: [companyScopeFilter(ctx), targetCompanyScope(membership.effectiveCompanyId)],
        },
      },
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
  await assertCanManageProjectMemberships(ctx);
  return prisma.$transaction(async (tx) => {
    await lockMembershipWrites(tx, ctx.tenantId);
    const member = await activeTargetMember(userId, ctx, tx);
    const companyWhere = [companyScopeFilter(ctx), targetCompanyScope(member.effectiveCompanyId)];
    const uniqueIds = [...new Set(projectIds)];
    const desiredProjects = await tx.project.findMany({
      where: { tenantId: ctx.tenantId, id: { in: uniqueIds }, AND: companyWhere },
      select: { id: true },
    });
    if (desiredProjects.length !== uniqueIds.length) {
      throw new ServiceError("VALIDATION", "Alguna obra está fuera del alcance del administrador o del usuario.");
    }
    const existing = await tx.projectMembership.findMany({
      where: { tenantId: ctx.tenantId, userId, project: { tenantId: ctx.tenantId, AND: companyWhere } },
      select: { id: true, projectId: true, project: { select: { status: true } } },
    });
    const existingSet = new Set(existing.map((row) => row.projectId));
    const desiredSet = new Set(uniqueIds);
    const toAdd = uniqueIds.filter((id) => !existingSet.has(id));
    // The editor omits cancelled and out-of-company projects; a partial replace must preserve them.
    const toRemove = existing.filter((row) => row.project.status !== "CANCELLED" && !desiredSet.has(row.projectId));
    const added = toAdd.length > 0
      ? (await tx.projectMembership.createMany({
          data: toAdd.map((projectId) => ({
            tenantId: ctx.tenantId,
            projectId,
            userId,
            createdBy: ctx.actorUserId,
          })),
          skipDuplicates: true,
        })).count : 0;
    const removed = toRemove.length > 0
      ? (await tx.projectMembership.deleteMany({
          where: { id: { in: toRemove.map((r) => r.id) }, tenantId: ctx.tenantId },
        })).count : 0;
    if (added > 0 || removed > 0) {
      await log({
        tenantId: ctx.tenantId, actorUserId: ctx.actorUserId,
        action: "project_membership.user_set", entityType: "User", entityId: userId,
        after: { addedProjectIds: toAdd, removedProjectIds: toRemove.map((row) => row.projectId) },
      }, tx);
    }
    return { added, removed };
  });
}

export async function listProjectMemberships(
  projectId: string,
  ctx: ServiceContext,
): Promise<Array<{ id: string; userId: string; email: string; name: string | null }>> {
  await assertCanManageProjectMemberships(ctx);
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
  await assertCanManageProjectMemberships(ctx);
  return prisma.$transaction(async (tx) => {
    await lockMembershipWrites(tx, ctx.tenantId);
    const project = await manageableProject(projectId, ctx, tx);
    const member = await activeTargetMember(userId, ctx, tx);
    if (isCrossCompany(project.companyId, { ...ctx, companyId: member.effectiveCompanyId })) {
      throw new ServiceError("VALIDATION", "La obra pertenece a otra empresa que la del usuario.");
    }
    const row = await tx.projectMembership.upsert({
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
    }, tx);
    return row;
  });
}

export async function removeProjectMembership(
  projectId: string,
  membershipId: string,
  ctx: ServiceContext,
): Promise<void> {
  await assertCanManageProjectMemberships(ctx);
  await prisma.$transaction(async (tx) => {
    await lockMembershipWrites(tx, ctx.tenantId);
    await manageableProject(projectId, ctx, tx);
    const row = await tx.projectMembership.findFirst({
      where: { id: membershipId, tenantId: ctx.tenantId, projectId },
    });
    if (!row) throw new ServiceError("NOT_FOUND", "Membresía no encontrada.");
    await tx.projectMembership.delete({ where: { id: row.id } });
    await log({
      tenantId: ctx.tenantId,
      actorUserId: ctx.actorUserId,
      action: "project_membership.removed",
      entityType: "ProjectMembership",
      entityId: membershipId,
      projectId,
      before: { userId: row.userId, projectId },
    }, tx);
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
  const gate = await getTenantModuleGate(ctx);
  if (!(
    (gate.isEnabled("USERS_PERMISSIONS") && can(ctx.roles, "EDIT", "USERS_PERMISSIONS")) ||
    (gate.isEnabled("TENANT_SETTINGS") && (can(ctx.roles, "EDIT", "TENANT_SETTINGS") || hasTenantWideProjectAccess(ctx.roles)))
  )) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para previsualizar el acceso a obras.");
  }
  return activationPreview(ctx, prisma);
}

async function activationPreview(
  ctx: ServiceContext,
  db: MembershipDb,
): Promise<MembershipScopedActivationPreview> {
  const tenant = await db.tenant.findUnique({ where: { id: ctx.tenantId }, select: { projectAccessMode: true } });
  if (!tenant) throw new ServiceError("NOT_FOUND", "Tenant no encontrado.");
  const currentMode = tenant.projectAccessMode;
  const [members, membershipRows, projectCount] = await Promise.all([
    db.userMembership.findMany({
      where: { tenantId: ctx.tenantId, status: "ACTIVE" },
      select: {
        userId: true,
        roles: true,
        companyId: true,
        company: { select: { tenantId: true, status: true } },
        user: { select: { email: true, name: true } },
      },
    }),
    db.projectMembership.findMany({
      where: { tenantId: ctx.tenantId, project: { tenantId: ctx.tenantId, status: { not: "CANCELLED" } } },
      select: { userId: true, project: { select: { companyId: true } } },
    }),
    db.project.count({
      where: { tenantId: ctx.tenantId, status: { not: "CANCELLED" } },
    }),
  ]);
  const soleCompanyId = members.some((member) => member.companyId === null)
    ? await getSoleActiveCompanyIdForTenant(ctx.tenantId, db) : null;
  const withMembership = new Set<string>();
  let companyWideAccessCount = 0;
  const membersWithoutProjects: MembershipScopedActivationPreview["membersWithoutProjects"] = [];
  const projectCapableWithoutProjects: MembershipScopedActivationPreview["projectCapableWithoutProjects"] =
    [];
  for (const m of members) {
    const roles = m.roles as ServiceContext["roles"];
    const validCompany = !m.companyId || (m.company?.tenantId === ctx.tenantId && m.company.status === "ACTIVE");
    const memberCtx = { ...ctx, companyId: m.companyId ?? soleCompanyId };
    if (validCompany && membershipRows.some((row) => row.userId === m.userId && !isCrossCompany(row.project.companyId, memberCtx))) {
      withMembership.add(m.userId);
    }
    if (validCompany && hasTenantWideProjectAccess(roles)) {
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
  await assertCanChangeProjectAccessMode(ctx);
  const mode = input.mode;
  const result = await prisma.$transaction(async (tx) => {
    await lockMembershipWrites(tx, ctx.tenantId);
    const tenant = await tx.tenant.findUnique({ where: { id: ctx.tenantId }, select: { projectAccessMode: true } });
    if (!tenant) throw new ServiceError("NOT_FOUND", "Tenant no encontrado.");
    if (mode === "MEMBERSHIP_SCOPED") {
      if (!hasTenantWideProjectAccess(ctx.roles)) {
        throw new ServiceError(
          "FORBIDDEN",
          "Solo un usuario con acceso global a obras puede activar el modo restringido.",
        );
      }
      const preview = await activationPreview(ctx, tx);
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

    await tx.tenant.update({
      where: { id: ctx.tenantId },
      data: { projectAccessMode: mode },
    });
    await log({
      tenantId: ctx.tenantId,
      actorUserId: ctx.actorUserId,
      action: "tenant.project_access_mode_changed",
      entityType: "Tenant",
      entityId: ctx.tenantId,
      before: { projectAccessMode: tenant.projectAccessMode },
      after: { projectAccessMode: mode },
    }, tx);
    return { mode };
  });
  clearProjectAccessModeCache();
  return result;
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
  await assertCanManageProjectMemberships(ctx);
  const plan = await teamImportPlan(projectId, ctx, prisma);
  return {
    projectId, wouldCreate: plan.eligibleIds.length - plan.alreadyExists,
    alreadyExists: plan.alreadyExists, teamSize: plan.teamSize,
  };
}

async function teamImportPlan(projectId: string, ctx: ServiceContext, db: MembershipDb) {
  const project = await manageableProject(projectId, ctx, db);
  const team = await db.projectTeamMember.findMany({
    where: { tenantId: ctx.tenantId, projectId },
    select: { userId: true },
  });
  const members = await db.userMembership.findMany({
    where: {
      tenantId: ctx.tenantId, status: "ACTIVE", userId: { in: team.map((row) => row.userId) },
      OR: [{ companyId: null }, { company: { tenantId: ctx.tenantId, status: "ACTIVE" } }],
    },
    select: { userId: true, companyId: true },
  });
  const soleCompanyId = members.some((member) => member.companyId === null)
    ? await getSoleActiveCompanyIdForTenant(ctx.tenantId, db) : null;
  const eligibleIds = members.filter((member) =>
    !isCrossCompany(member.companyId, ctx) &&
    !isCrossCompany(project.companyId, { ...ctx, companyId: member.companyId ?? soleCompanyId }))
    .map((member) => member.userId);
  const existing = await db.projectMembership.findMany({
    where: {
      tenantId: ctx.tenantId,
      projectId,
      userId: { in: eligibleIds },
    },
    select: { userId: true },
  });
  return { eligibleIds, alreadyExists: existing.length, teamSize: team.length };
}

/** Optional import helper — copies ProjectTeamMember rows into memberships (suggestion only). */
export async function importMembershipsFromProjectTeam(
  projectId: string,
  ctx: ServiceContext,
): Promise<{ created: number; alreadyExists: number; teamSize: number }> {
  await assertCanManageProjectMemberships(ctx);
  return prisma.$transaction(async (tx) => {
    await lockMembershipWrites(tx, ctx.tenantId);
    const plan = await teamImportPlan(projectId, ctx, tx);
    if (plan.eligibleIds.length === 0) return { created: 0, alreadyExists: plan.alreadyExists, teamSize: plan.teamSize };
    const created = await tx.projectMembership.createMany({
      data: plan.eligibleIds.map((userId) => ({
        tenantId: ctx.tenantId,
        projectId,
        userId,
        createdBy: ctx.actorUserId,
      })),
      skipDuplicates: true,
    });
    await log({
      tenantId: ctx.tenantId,
      actorUserId: ctx.actorUserId,
      action: "project_membership.import_from_team",
      entityType: "Project",
      entityId: projectId,
      projectId,
      after: { created: created.count, alreadyExists: plan.alreadyExists, teamSize: plan.teamSize },
    }, tx);
    return { created: created.count, alreadyExists: plan.alreadyExists, teamSize: plan.teamSize };
  });
}

export async function getTenantProjectAccessModeForAdmin(
  ctx: ServiceContext,
): Promise<ProjectAccessMode> {
  const gate = await getTenantModuleGate(ctx);
  if (!(
    (can(ctx.roles, "VIEW", "USERS_PERMISSIONS") && gate.isEnabled("USERS_PERMISSIONS")) ||
    (can(ctx.roles, "VIEW", "TENANT_SETTINGS") && gate.isEnabled("TENANT_SETTINGS"))
  )) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver el modo de acceso a obras.");
  }
  return getTenantProjectAccessMode(ctx.tenantId);
}
