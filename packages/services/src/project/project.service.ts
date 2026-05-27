import { prisma } from "@bloqer/database";
import type { Project, ProjectStatus, Prisma, Contact } from "@bloqer/database";
import { can } from "@bloqer/domain";
import type { CreateProjectInput, UpdateProjectInput, ListProjectsInput } from "@bloqer/validators";
import { log } from "../audit/audit.service";
import { canViewArProjectArea } from "../ar/ar-access";
import { canViewApProjectArea } from "../ap/ap-access";
import { canViewProjectCostControlReport } from "../cost-control/cost-control.service";
import { canViewProcurementProjectArea } from "../procurement/procurement-access";
import { canViewProjectCashFlowReport } from "../project-cash-flow/project-cash-flow.service";
import { ServiceContext, ServiceError } from "../types";

export type ProjectWithClient = Project & {
  client: Pick<Contact, "id" | "legalName" | "fantasyName">;
};

/** Minimal project row for layouts and shells (no client join). */
export type ProjectShellInfo = {
  id: string;
  name: string;
  code: string;
  status: ProjectStatus;
  tenantId: string;
};

/**
 * True if the actor may load `/proyectos/[id]` layout (any project-scoped area they can reach).
 * Narrower than “VIEW PROJECTS everywhere”: AR/AP/procurement specialists can open their routes.
 */
export function canAccessProjectLayout(roles: ServiceContext["roles"]): boolean {
  return (
    can(roles, "VIEW", "PROJECTS") ||
    canViewArProjectArea(roles) ||
    canViewApProjectArea(roles) ||
    canViewProjectCashFlowReport(roles) ||
    canViewProjectCostControlReport(roles) ||
    canViewProcurementProjectArea(roles) ||
    can(roles, "VIEW", "SUBCONTRACTS") ||
    can(roles, "VIEW", "INVENTORY") ||
    can(roles, "VIEW", "JOBSITE_LOG") ||
    can(roles, "VIEW", "BUDGETS") ||
    can(roles, "VIEW", "CERTIFICATIONS")
  );
}

export async function getProjectShellInfo(id: string, ctx: ServiceContext): Promise<ProjectShellInfo> {
  if (!canAccessProjectLayout(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver este proyecto");
  }
  const row = await prisma.project.findUnique({
    where: { id },
    select: { id: true, name: true, code: true, status: true, tenantId: true },
  });
  if (!row) throw new ServiceError("NOT_FOUND", "Proyecto no encontrado");
  if (row.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  return row;
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getProjectById(id: string, ctx: ServiceContext): Promise<ProjectWithClient> {
  if (!can(ctx.roles, "VIEW", "PROJECTS")) {
    throw new ServiceError("FORBIDDEN", "Insufficient permissions to view projects");
  }
  const project = await prisma.project.findUnique({
    where: { id },
    include: { client: { select: { id: true, legalName: true, fantasyName: true } } },
  });
  if (!project) throw new ServiceError("NOT_FOUND", "Proyecto no encontrado");
  if (project.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  return project;
}

export async function listProjects(
  filters: ListProjectsInput,
  ctx: ServiceContext,
): Promise<{ data: ProjectWithClient[]; total: number }> {
  if (!can(ctx.roles, "VIEW", "PROJECTS")) {
    throw new ServiceError("FORBIDDEN", "Insufficient permissions to view projects");
  }

  const where: Prisma.ProjectWhereInput = {
    tenantId: ctx.tenantId,
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.clientContactId ? { clientContactId: filters.clientContactId } : {}),
    ...(filters.search
      ? {
          OR: [
            { name: { contains: filters.search, mode: "insensitive" } },
            { code: { contains: filters.search, mode: "insensitive" } },
            { city: { contains: filters.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 20;

  const [data, total] = await Promise.all([
    prisma.project.findMany({
      where,
      include: { client: { select: { id: true, legalName: true, fantasyName: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.project.count({ where }),
  ]);

  return { data, total };
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function createProject(
  input: CreateProjectInput,
  ctx: ServiceContext,
): Promise<Project> {
  if (!can(ctx.roles, "EDIT", "PROJECTS")) {
    throw new ServiceError("FORBIDDEN", "Insufficient permissions to create projects");
  }

  // BR-PROJ-001: client must have active CLIENT role
  await _guardClientRole(input.clientContactId, ctx.tenantId);

  const existing = await prisma.project.findUnique({
    where: { tenantId_code: { tenantId: ctx.tenantId, code: input.code } },
  });
  if (existing) throw new ServiceError("CONFLICT", `Ya existe un proyecto con el código "${input.code}"`);

  const project = await prisma.project.create({
    data: {
      ...input,
      tenantId: ctx.tenantId,
      companyId: ctx.companyId ?? undefined,
      createdBy: ctx.actorUserId,
      updatedBy: ctx.actorUserId,
    },
  });

  await log({
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action: "project.created",
    entityType: "Project",
    entityId: project.id,
    after: { code: project.code, name: project.name, status: project.status },
    ipAddress: ctx.ipAddress,
  });

  return project;
}

export async function updateProject(
  id: string,
  input: UpdateProjectInput,
  ctx: ServiceContext,
): Promise<Project> {
  if (!can(ctx.roles, "EDIT", "PROJECTS")) {
    throw new ServiceError("FORBIDDEN", "Insufficient permissions to update projects");
  }

  const existing = await prisma.project.findUnique({ where: { id } });
  if (!existing) throw new ServiceError("NOT_FOUND", "Proyecto no encontrado");
  if (existing.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");

  // BR-PROJ-003: completed/cancelled are read-only
  if (existing.status === "COMPLETED" || existing.status === "CANCELLED") {
    throw new ServiceError("CONFLICT", "Los proyectos completados o cancelados no pueden modificarse");
  }

  if (input.code && input.code !== existing.code) {
    const conflict = await prisma.project.findUnique({
      where: { tenantId_code: { tenantId: ctx.tenantId, code: input.code } },
    });
    if (conflict) throw new ServiceError("CONFLICT", `Ya existe un proyecto con el código "${input.code}"`);
  }

  if (input.clientContactId && input.clientContactId !== existing.clientContactId) {
    await _guardClientRole(input.clientContactId, ctx.tenantId);
  }

  const { startDate, expectedEndDate, ...rest } = input;

  const updated = await prisma.project.update({
    where: { id },
    data: {
      ...rest,
      ...(startDate !== undefined ? { startDate } : {}),
      ...(expectedEndDate !== undefined ? { expectedEndDate } : {}),
      updatedBy: ctx.actorUserId,
    },
  });

  await log({
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action: "project.updated",
    entityType: "Project",
    entityId: id,
    before: { name: existing.name, code: existing.code },
    after: { name: updated.name, code: updated.code },
    ipAddress: ctx.ipAddress,
  });

  return updated;
}

// ─── Status transitions ───────────────────────────────────────────────────────

export async function activateProject(id: string, ctx: ServiceContext): Promise<Project> {
  return _transition(id, ctx, ["DRAFT"], "ACTIVE", "project.activated");
}

export async function pauseProject(id: string, ctx: ServiceContext): Promise<Project> {
  return _transition(id, ctx, ["ACTIVE"], "ON_HOLD", "project.paused");
}

export async function resumeProject(id: string, ctx: ServiceContext): Promise<Project> {
  return _transition(id, ctx, ["ON_HOLD"], "ACTIVE", "project.resumed");
}

export async function completeProject(id: string, ctx: ServiceContext): Promise<Project> {
  return _transition(id, ctx, ["ACTIVE"], "COMPLETED", "project.completed", (p) => ({
    actualEndDate: new Date(),
  }));
}

export async function cancelProject(id: string, ctx: ServiceContext): Promise<Project> {
  return _transition(id, ctx, ["ACTIVE", "ON_HOLD", "DRAFT"], "CANCELLED", "project.cancelled");
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function _guardClientRole(contactId: string, tenantId: string) {
  const contact = await prisma.contact.findUnique({ where: { id: contactId } });
  if (!contact) throw new ServiceError("NOT_FOUND", "Contacto cliente no encontrado");
  if (contact.tenantId !== tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");

  const clientRole = await prisma.contactRole.findUnique({
    where: { contactId_role: { contactId, role: "CLIENT" } },
  });
  if (!clientRole || clientRole.status !== "ACTIVE") {
    throw new ServiceError("CONFLICT", "El contacto no tiene el rol Cliente activo");
  }
}

async function _transition(
  id: string,
  ctx: ServiceContext,
  allowedFrom: ProjectStatus[],
  to: ProjectStatus,
  action: string,
  extraData?: (project: Project) => Partial<Prisma.ProjectUpdateInput>,
): Promise<Project> {
  if (!can(ctx.roles, "EDIT", "PROJECTS")) {
    throw new ServiceError("FORBIDDEN", "Insufficient permissions");
  }
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) throw new ServiceError("NOT_FOUND", "Proyecto no encontrado");
  if (project.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  if (!allowedFrom.includes(project.status)) {
    throw new ServiceError("CONFLICT", `No se puede cambiar el estado desde ${project.status}`);
  }

  const updated = await prisma.project.update({
    where: { id },
    data: { status: to, updatedBy: ctx.actorUserId, ...(extraData?.(project) ?? {}) },
  });

  await log({
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action,
    entityType: "Project",
    entityId: id,
    before: { status: project.status },
    after: { status: to },
    ipAddress: ctx.ipAddress,
  });

  return updated;
}
