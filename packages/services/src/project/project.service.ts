import { prisma } from "@bloqer/database";
import type { Project, ProjectStatus, Prisma, Contact } from "@bloqer/database";
import { can } from "@bloqer/domain";
import type { CreateProjectInput, UpdateProjectInput, ListProjectsInput, ProjectLifecycleInput } from "@bloqer/validators";
import { log } from "../audit/audit.service";
import { canViewArProjectArea } from "../ar/ar-access";
import { canViewApProjectArea } from "../ap/ap-access";
import { canViewProjectCostControlReport } from "../cost-control/cost-control.service";
import { canViewProcurementProjectArea } from "../procurement/procurement-access";
import { canViewProjectCashFlowReport } from "../project-cash-flow/project-cash-flow.service";
import {
  assertNoOpenOperationalDocuments,
  getProjectCancellationImpact,
  resolveReactivationTargetStatus,
} from "./project-cancellation-impact.service";
import {
  canCancelActiveProject,
  canCancelDraftProject,
  canReactivateProject,
} from "./project-lifecycle-access";
import { assertContactRoleInTenant } from "../contact/assert-contact-role";
import { assertOptimisticRowUpdate } from "../finance/optimistic-lock";
import { ServiceContext, ServiceError } from "../types";

export {
  canCancelActiveProject,
  canCancelDraftProject,
  canReactivateProject,
  canViewProjectCancellationImpact,
} from "./project-lifecycle-access";
export {
  sanitizeReactivationTargetStatus,
  resolveReactivationTargetStatus,
  type ProjectCancellationImpact,
} from "./project-cancellation-impact.service";
export { getProjectCancellationImpact } from "./project-cancellation-impact.service";
export {
  assertProjectAllowsOperationalMutation,
  assertProjectAllowsBudgetPlanning,
  getProjectOperationalMutationBlockReason,
} from "./project-operational-guard";

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

/** Client contact for AR flows without requiring VIEW PROJECTS on the full project record. */
export async function getProjectClientContactId(
  projectId: string,
  ctx: ServiceContext,
): Promise<string> {
  if (!canAccessProjectLayout(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para acceder a este proyecto");
  }
  const row = await prisma.project.findUnique({
    where: { id: projectId },
    select: { tenantId: true, clientContactId: true },
  });
  if (!row) throw new ServiceError("NOT_FOUND", "Proyecto no encontrado");
  if (row.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  return row.clientContactId;
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

/** BR-PROJ-002 helper for edit UI — true when type must stay frozen. */
export async function isProjectTypeLocked(
  projectId: string,
  ctx: ServiceContext,
): Promise<boolean> {
  if (!can(ctx.roles, "VIEW", "PROJECTS") && !can(ctx.roles, "EDIT", "PROJECTS")) {
    throw new ServiceError("FORBIDDEN", "Insufficient permissions");
  }
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { tenantId: true },
  });
  if (!project) throw new ServiceError("NOT_FOUND", "Proyecto no encontrado");
  if (project.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");

  const lockedBudget = await prisma.budget.findFirst({
    where: {
      projectId,
      tenantId: ctx.tenantId,
      status: { in: ["APPROVED", "CLOSED"] },
    },
    select: { id: true },
  });
  return lockedBudget != null;
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

  // BR-PROJ-002: type drives over-cert rules; immutable after first APPROVED/CLOSED budget.
  if (input.type !== undefined && input.type !== existing.type) {
    const lockedBudget = await prisma.budget.findFirst({
      where: {
        projectId: id,
        tenantId: ctx.tenantId,
        status: { in: ["APPROVED", "CLOSED"] },
      },
      select: { id: true },
    });
    if (lockedBudget) {
      throw new ServiceError(
        "CONFLICT",
        "No se puede cambiar el tipo de obra después de un presupuesto aprobado o cerrado (BR-PROJ-002)",
      );
    }
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

export async function activateProject(
  id: string,
  ctx: ServiceContext,
  input?: ProjectLifecycleInput,
): Promise<Project> {
  return _transition(id, ctx, ["DRAFT"], "ACTIVE", "project.activated", undefined, input);
}

export async function pauseProject(
  id: string,
  ctx: ServiceContext,
  input?: ProjectLifecycleInput,
): Promise<Project> {
  return _transition(id, ctx, ["ACTIVE"], "ON_HOLD", "project.paused", undefined, input);
}

export async function resumeProject(
  id: string,
  ctx: ServiceContext,
  input?: ProjectLifecycleInput,
): Promise<Project> {
  return _transition(id, ctx, ["ON_HOLD"], "ACTIVE", "project.resumed", undefined, input);
}

export async function completeProject(
  id: string,
  ctx: ServiceContext,
  input?: ProjectLifecycleInput,
): Promise<Project> {
  return _transition(
    id,
    ctx,
    ["ACTIVE"],
    "COMPLETED",
    "project.completed",
    () => ({ actualEndDate: new Date() }),
    input,
  );
}

export async function cancelProject(
  id: string,
  ctx: ServiceContext,
  input?: ProjectLifecycleInput,
): Promise<Project> {
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) throw new ServiceError("NOT_FOUND", "Proyecto no encontrado");
  if (project.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");

  if (project.status === "DRAFT") {
    if (!canCancelDraftProject(ctx.roles)) {
      throw new ServiceError("FORBIDDEN", "Sin permisos para cancelar el proyecto");
    }
  } else if (project.status === "ACTIVE" || project.status === "ON_HOLD") {
    if (!canCancelActiveProject(ctx.roles)) {
      throw new ServiceError("FORBIDDEN", "Solo OWNER o ADMIN pueden cancelar una obra en curso");
    }
    const reason = input?.reason?.trim();
    if (!reason) {
      throw new ServiceError("CONFLICT", "El motivo de cancelación es obligatorio");
    }
    await assertNoOpenOperationalDocuments(id, ctx.tenantId);
  } else {
    throw new ServiceError("CONFLICT", `No se puede cancelar desde el estado ${project.status}`);
  }

  const reason = input?.reason?.trim() || null;

  return _transition(
    id,
    ctx,
    ["ACTIVE", "ON_HOLD", "DRAFT"],
    "CANCELLED",
    "project.cancelled",
    () => ({
      statusBeforeCancellation: project.status,
      cancellationReason: reason,
      cancelledAt: new Date(),
    }),
    { ...input, reason: reason ?? undefined },
    { previousStatus: project.status },
    project,
  );
}

export async function reactivateProject(
  id: string,
  ctx: ServiceContext,
  input: ProjectLifecycleInput,
): Promise<Project> {
  if (!canReactivateProject(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Solo OWNER o ADMIN pueden reactivar una obra cancelada");
  }

  const reason = input.reason?.trim();
  if (!reason) {
    throw new ServiceError("CONFLICT", "El motivo de reactivación es obligatorio");
  }

  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) throw new ServiceError("NOT_FOUND", "Proyecto no encontrado");
  if (project.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  if (project.status !== "CANCELLED") {
    throw new ServiceError("CONFLICT", "Solo se pueden reactivar proyectos cancelados");
  }

  const targetStatus = await resolveReactivationTargetStatus(project);
  if (!targetStatus) {
    throw new ServiceError("CONFLICT", "No se pudo determinar el estado de reactivación");
  }

  const flipped = await prisma.project.updateMany({
    where: { id, tenantId: ctx.tenantId, status: "CANCELLED" },
    data: {
      status: targetStatus,
      statusBeforeCancellation: null,
      cancellationReason: null,
      cancelledAt: null,
      updatedBy: ctx.actorUserId,
    },
  });
  assertOptimisticRowUpdate(
    flipped.count,
    "El proyecto ya no está cancelado. Recargá e intentá de nuevo.",
  );

  const updated = await prisma.project.findUniqueOrThrow({ where: { id } });

  await log({
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action: "project.reactivated",
    entityType: "Project",
    entityId: id,
    before: { status: "CANCELLED", previousStatus: project.statusBeforeCancellation },
    after: { status: targetStatus, reason, restoredStatus: targetStatus },
    ipAddress: ctx.ipAddress,
  });

  return updated;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function _guardClientRole(contactId: string, tenantId: string) {
  await assertContactRoleInTenant(contactId, "CLIENT", tenantId, {
    contactNotFoundMessage: "Contacto cliente no encontrado",
  });
}

async function _transition(
  id: string,
  ctx: ServiceContext,
  allowedFrom: ProjectStatus[],
  to: ProjectStatus,
  action: string,
  extraData?: (project: Project) => Partial<Prisma.ProjectUpdateInput>,
  input?: ProjectLifecycleInput,
  auditExtra?: Record<string, unknown>,
  existingProject?: Project,
): Promise<Project> {
  if (!can(ctx.roles, "EDIT", "PROJECTS")) {
    throw new ServiceError("FORBIDDEN", "Insufficient permissions");
  }
  const project =
    existingProject ?? (await prisma.project.findUnique({ where: { id } }));
  if (!project) throw new ServiceError("NOT_FOUND", "Proyecto no encontrado");
  if (project.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  if (!allowedFrom.includes(project.status)) {
    throw new ServiceError("CONFLICT", `No se puede cambiar el estado desde ${project.status}`);
  }

  const comment = input?.comment?.trim() || null;
  const reason = input?.reason?.trim() || null;

  const flipped = await prisma.project.updateMany({
    where: { id, tenantId: ctx.tenantId, status: { in: allowedFrom } },
    data: {
      status: to,
      updatedBy: ctx.actorUserId,
      ...(extraData?.(project) as Prisma.ProjectUpdateManyMutationInput | undefined),
    },
  });
  assertOptimisticRowUpdate(
    flipped.count,
    `No se puede cambiar el estado desde ${project.status}. Recargá e intentá de nuevo.`,
  );

  const updated = await prisma.project.findUniqueOrThrow({ where: { id } });

  await log({
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action,
    entityType: "Project",
    entityId: id,
    before: { status: project.status },
    after: {
      status: to,
      ...(comment ? { comment } : {}),
      ...(reason ? { reason } : {}),
      ...auditExtra,
    },
    ipAddress: ctx.ipAddress,
  });

  return updated;
}
