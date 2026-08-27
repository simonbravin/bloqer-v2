import type { ProjectTeamMemberKind } from "@bloqer/database";
import { prisma } from "@bloqer/database";
import { can, type UserRole } from "@bloqer/domain";
import type { AddProjectTeamMemberInput } from "@bloqer/validators";
import { log } from "../audit/audit.service";
import { canSuperviseJobsiteLog } from "../jobsite-log/jobsite-log-access";
import { ServiceContext, ServiceError } from "../types";

export type ProjectTeamMemberRow = {
  id: string;
  userId: string;
  email: string;
  name: string | null;
  kind: ProjectTeamMemberKind;
  /** Global roles — used for UI badges; roster `kind` is label only. */
  roles: UserRole[];
  membershipActive: boolean;
  canSuperviseJobsiteLog: boolean;
  createdAt: Date;
};

/** Supervisor flag for roster UI: ACTIVE membership ∩ canSupervise ([D-091]). */
export function isActiveJobsiteSupervisor(membership: {
  status: string;
  roles: UserRole[];
} | undefined): boolean {
  if (!membership || membership.status !== "ACTIVE") return false;
  return canSuperviseJobsiteLog(membership.roles);
}

export type ProjectTeamPickerOption = {
  userId: string;
  email: string;
  name: string | null;
  roles: UserRole[];
};

function assertCanEditProjectTeam(roles: ServiceContext["roles"]): void {
  if (!can(roles, "EDIT", "PROJECTS")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para editar el equipo de obra");
  }
}

function assertCanViewProjectTeam(roles: ServiceContext["roles"]): void {
  if (!can(roles, "VIEW", "PROJECTS") && !can(roles, "EDIT", "PROJECTS")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver el equipo de obra");
  }
}

async function requireProjectInTenant(projectId: string, tenantId: string): Promise<void> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, tenantId },
    select: { id: true },
  });
  if (!project) throw new ServiceError("NOT_FOUND", "Proyecto no encontrado");
}

export async function listProjectTeam(
  projectId: string,
  ctx: ServiceContext,
): Promise<ProjectTeamMemberRow[]> {
  assertCanViewProjectTeam(ctx.roles);
  await requireProjectInTenant(projectId, ctx.tenantId);

  const rows = await prisma.projectTeamMember.findMany({
    where: { tenantId: ctx.tenantId, projectId },
    orderBy: [{ kind: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      userId: true,
      kind: true,
      createdAt: true,
      user: { select: { email: true, name: true } },
    },
  });

  if (rows.length === 0) return [];

  const memberships = await prisma.userMembership.findMany({
    where: {
      tenantId: ctx.tenantId,
      userId: { in: rows.map((r) => r.userId) },
    },
    select: { userId: true, roles: true, status: true },
  });
  const byUser = new Map(memberships.map((m) => [m.userId, m]));

  return rows.map((r) => {
    const m = byUser.get(r.userId);
    const membershipActive = m?.status === "ACTIVE";
    const roles = (membershipActive && m ? m.roles : []) as UserRole[];
    return {
      id: r.id,
      userId: r.userId,
      email: r.user.email,
      name: r.user.name,
      kind: r.kind,
      roles,
      membershipActive,
      canSuperviseJobsiteLog: isActiveJobsiteSupervisor(
        m ? { status: m.status, roles: m.roles as UserRole[] } : undefined,
      ),
      createdAt: r.createdAt,
    };
  });
}

/**
 * ACTIVE tenant members for the project-team picker.
 * Not gated like Configuración → Equipo (OWNER/ADMIN only).
 */
export async function listActiveMembersForProjectTeamPicker(
  projectId: string,
  ctx: ServiceContext,
): Promise<ProjectTeamPickerOption[]> {
  assertCanEditProjectTeam(ctx.roles);
  await requireProjectInTenant(projectId, ctx.tenantId);

  const [memberships, existing] = await Promise.all([
    prisma.userMembership.findMany({
      where: { tenantId: ctx.tenantId, status: "ACTIVE" },
      orderBy: { createdAt: "asc" },
      select: {
        userId: true,
        roles: true,
        user: { select: { email: true, name: true } },
      },
    }),
    prisma.projectTeamMember.findMany({
      where: { tenantId: ctx.tenantId, projectId },
      select: { userId: true },
    }),
  ]);

  const already = new Set(existing.map((e) => e.userId));
  return memberships
    .filter((m) => !already.has(m.userId))
    .map((m) => ({
      userId: m.userId,
      email: m.user.email,
      name: m.user.name,
      roles: m.roles as UserRole[],
    }));
}

export async function addProjectTeamMember(
  projectId: string,
  input: AddProjectTeamMemberInput,
  ctx: ServiceContext,
): Promise<ProjectTeamMemberRow> {
  assertCanEditProjectTeam(ctx.roles);
  await requireProjectInTenant(projectId, ctx.tenantId);

  const membership = await prisma.userMembership.findFirst({
    where: {
      tenantId: ctx.tenantId,
      userId: input.userId,
      status: "ACTIVE",
    },
    select: {
      userId: true,
      roles: true,
      user: { select: { email: true, name: true } },
    },
  });
  if (!membership) {
    throw new ServiceError(
      "VALIDATION",
      "El usuario no tiene membresía activa en la organización",
    );
  }

  const existing = await prisma.projectTeamMember.findUnique({
    where: {
      tenantId_projectId_userId: {
        tenantId: ctx.tenantId,
        projectId,
        userId: input.userId,
      },
    },
    select: { id: true },
  });
  if (existing) {
    throw new ServiceError("CONFLICT", "Ese usuario ya está en el equipo de obra");
  }

  const row = await prisma.projectTeamMember.create({
    data: {
      tenantId: ctx.tenantId,
      projectId,
      userId: input.userId,
      kind: input.kind,
      createdBy: ctx.actorUserId,
    },
    select: {
      id: true,
      userId: true,
      kind: true,
      createdAt: true,
      user: { select: { email: true, name: true } },
    },
  });

  await log({
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    projectId,
    action: "PROJECT_TEAM_MEMBER_ADDED",
    entityType: "ProjectTeamMember",
    entityId: row.id,
    after: { userId: row.userId, kind: row.kind },
  });

  const roles = membership.roles as UserRole[];
  return {
    id: row.id,
    userId: row.userId,
    email: row.user.email,
    name: row.user.name,
    kind: row.kind,
    roles,
    membershipActive: true,
    canSuperviseJobsiteLog: isActiveJobsiteSupervisor({ status: "ACTIVE", roles }),
    createdAt: row.createdAt,
  };
}

export async function removeProjectTeamMember(
  projectId: string,
  memberId: string,
  ctx: ServiceContext,
): Promise<void> {
  assertCanEditProjectTeam(ctx.roles);
  await requireProjectInTenant(projectId, ctx.tenantId);

  const row = await prisma.projectTeamMember.findFirst({
    where: { id: memberId, tenantId: ctx.tenantId, projectId },
    select: { id: true, userId: true, kind: true },
  });
  if (!row) throw new ServiceError("NOT_FOUND", "Miembro del equipo no encontrado");

  await prisma.projectTeamMember.delete({ where: { id: row.id } });

  await log({
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    projectId,
    action: "PROJECT_TEAM_MEMBER_REMOVED",
    entityType: "ProjectTeamMember",
    entityId: row.id,
    before: { userId: row.userId, kind: row.kind },
  });
}

/** Best-effort auto-add when the creator is PM or site foreman ([D-091]). */
export async function maybeAutoAddCreatorToProjectTeam(params: {
  projectId: string;
  tenantId: string;
  actorUserId: string;
  roles: UserRole[];
}): Promise<void> {
  const isPm = params.roles.includes("PROJECT_MANAGER");
  const isForeman = params.roles.includes("SITE_FOREMAN");
  if (!isPm && !isForeman) return;

  const kind: ProjectTeamMemberKind = isPm ? "PROJECT_MANAGER" : "SITE_FOREMAN";
  try {
    await prisma.projectTeamMember.create({
      data: {
        tenantId: params.tenantId,
        projectId: params.projectId,
        userId: params.actorUserId,
        kind,
        createdBy: params.actorUserId,
      },
    });
  } catch {
    /* unique race / already present — ignore */
  }
}

export function projectTeamHasJobsiteSupervisor(members: ProjectTeamMemberRow[]): boolean {
  return members.some((m) => m.canSuperviseJobsiteLog);
}

/** Roster has an active membership labeled PM ([D-091] UI banner). */
export function hasAssignedProjectManager(
  members: Array<{ kind: ProjectTeamMemberKind; membershipActive: boolean }>,
): boolean {
  return members.some((m) => m.kind === "PROJECT_MANAGER" && m.membershipActive);
}
