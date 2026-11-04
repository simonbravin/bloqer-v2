import { prisma, Prisma } from "@bloqer/database";
import type { Project, ProjectStatus, Contact } from "@bloqer/database";
import { can, type PermissionModule } from "@bloqer/domain";
import { listProjectsSchema } from "@bloqer/validators";
import type { CreateProjectInput, UpdateProjectInput, ListProjectsInput, ProjectLifecycleInput } from "@bloqer/validators";
import { log } from "../audit/audit.service";
import { canViewArProjectArea } from "../ar/ar-access";
import { canViewApProjectArea } from "../ap/ap-access";
import { canViewProjectCostControlReport } from "../cost-control/cost-control.service";
import { canViewProcurementProjectArea } from "../procurement/procurement-access";
import { canViewProjectCashFlowReport } from "../project-cash-flow/project-cash-flow.service";
import {
  assertNoOpenOperationalDocuments,
  resolveReactivationTargetStatus,
} from "./project-cancellation-impact.service";
import {
  canCancelActiveProject,
  canCancelDraftProject,
  canReactivateProject,
} from "./project-lifecycle-access";
import { maybeAutoAddCreatorToProjectTeam } from "./project-team.service";
import { lockProjectForMutation } from "./project-write-lock";
import { clearProjectAccessModeCache, hasTenantWideProjectAccess } from "../security/access";
import { assertContactRoleInTenant } from "../contact/assert-contact-role";
import { resolveActiveCompanyId } from "../company/company.service";
import { assertOptimisticRowUpdate } from "../finance/optimistic-lock";
import { assertTenantModuleEnabled, getTenantModuleGate, type TenantModuleGate } from "../tenant-modules/tenant-module.service";
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
export { requireProjectInTenant, type ProjectTenantScope } from "./require-project-in-tenant";

export type ProjectWithClient = Omit<Project, "allowApprovedBudgetEconomicEdits"> & {
  allowApprovedBudgetEconomicEdits?: boolean;
  client: Pick<Contact, "id" | "legalName" | "fantasyName">;
};

/**
 * List/card row: explicit Prisma select so new Project columns (e.g. D-088 flags)
 * are not required for `/proyectos` to render if a deploy races migrations.
 */
export type ProjectListItem = {
  id: string;
  code: string;
  name: string;
  status: ProjectStatus;
  type: Project["type"];
  client: Pick<Contact, "id" | "legalName" | "fantasyName">;
};

/** Minimal project row for layouts and shells (no client join). */
export type ProjectShellInfo = {
  id: string;
  name: string;
  code: string;
  status: ProjectStatus;
  tenantId: string;
  companyId: string | null;
};

/**
 * True if the actor may load `/proyectos/[id]` layout (any project-scoped area they can reach).
 * Narrower than “VIEW PROJECTS everywhere”: AR/AP/procurement specialists can open their routes.
 */
export function canAccessProjectLayout(
  roles: ServiceContext["roles"],
  gate?: Pick<TenantModuleGate, "isEnabled">,
): boolean {
  const enabled = (module: PermissionModule) => gate?.isEnabled(module) ?? true;
  return (
    (enabled("PROJECTS") && can(roles, "VIEW", "PROJECTS")) ||
    (enabled("AR") && canViewArProjectArea(roles)) ||
    (enabled("AP") && canViewApProjectArea(roles)) ||
    (enabled("PROJECTS") && canViewProjectCashFlowReport(roles)) ||
    (enabled("PROJECTS") && enabled("BUDGETS") && canViewProjectCostControlReport(roles)) ||
    (enabled("PROCUREMENT") && canViewProcurementProjectArea(roles)) ||
    (enabled("SUBCONTRACTS") && can(roles, "VIEW", "SUBCONTRACTS")) ||
    (enabled("INVENTORY") && can(roles, "VIEW", "INVENTORY")) ||
    (enabled("JOBSITE_LOG") && can(roles, "VIEW", "JOBSITE_LOG")) ||
    (enabled("BUDGETS") && can(roles, "VIEW", "BUDGETS")) ||
    (enabled("CERTIFICATIONS") && can(roles, "VIEW", "CERTIFICATIONS"))
  );
}

export async function getProjectShellInfo(id: string, ctx: ServiceContext): Promise<ProjectShellInfo> {
  if (!canAccessProjectLayout(ctx.roles, await getTenantModuleGate(ctx))) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver este proyecto");
  }
  const { requireProjectAccess } = await import("../security/access");
  await requireProjectAccess(id, ctx);
  const row = await prisma.project.findUnique({
    where: { id },
    select: { id: true, name: true, code: true, status: true, tenantId: true, companyId: true },
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
  if (!canAccessProjectLayout(ctx.roles, await getTenantModuleGate(ctx))) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para acceder a este proyecto");
  }
  const { requireProjectAccess } = await import("../security/access");
  await requireProjectAccess(projectId, ctx);
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
  await assertTenantModuleEnabled(ctx, "PROJECTS");
  const { requireProjectAccess } = await import("../security/access");
  await requireProjectAccess(id, ctx);
  const project = await prisma.project.findUnique({
    where: { id },
    select: {
      id: true,
      tenantId: true,
      companyId: true,
      clientContactId: true,
      code: true,
      name: true,
      description: true,
      address: true,
      city: true,
      province: true,
      country: true,
      type: true,
      status: true,
      statusBeforeCancellation: true,
      cancellationReason: true,
      cancelledAt: true,
      startDate: true,
      expectedEndDate: true,
      actualEndDate: true,
      notes: true,
      createdBy: true,
      updatedBy: true,
      createdAt: true,
      updatedAt: true,
      client: { select: { id: true, legalName: true, fantasyName: true } },
    },
  });
  if (!project) throw new ServiceError("NOT_FOUND", "Proyecto no encontrado");
  if (project.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  return project;
}

export async function listProjects(
  filters: ListProjectsInput,
  ctx: ServiceContext,
): Promise<{ data: ProjectListItem[]; total: number }> {
  if (!can(ctx.roles, "VIEW", "PROJECTS")) {
    throw new ServiceError("FORBIDDEN", "Insufficient permissions to view projects");
  }
  await assertTenantModuleEnabled(ctx, "PROJECTS");

  const parsed = listProjectsSchema.safeParse(filters);
  if (!parsed.success) {
    throw new ServiceError("VALIDATION", "Los filtros o la página solicitada no son válidos");
  }
  filters = parsed.data;

  const { resolveAccessibleProjectScope } = await import("../security/access");
  const scope = await resolveAccessibleProjectScope(ctx);

  const where: Prisma.ProjectWhereInput = {
    tenantId: ctx.tenantId,
    ...(scope === "ALL" ? {} : { id: { in: scope.projectIds } }),
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
      select: {
        id: true,
        code: true,
        name: true,
        status: true,
        type: true,
        client: { select: { id: true, legalName: true, fantasyName: true } },
      },
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
  await assertTenantModuleEnabled(ctx, "PROJECTS");

  assertProjectDateRange(input.startDate, input.expectedEndDate);

  // BR-PROJ-001: client must have active CLIENT role
  await _guardClientRole(input.clientContactId, ctx.tenantId);

  const existing = await prisma.project.findUnique({
    where: { tenantId_code: { tenantId: ctx.tenantId, code: input.code } },
  });
  if (existing) throw new ServiceError("CONFLICT", `Ya existe un proyecto con el código "${input.code}"`);

  const companyId = (await resolveActiveCompanyId(ctx)) ?? undefined;

  const project = await withProjectCodeConflict(input.code, () => prisma.$transaction(async (tx) => {
    let assignCreator = false;
    if (!hasTenantWideProjectAccess(ctx.roles)) {
      // Same tenant lock as membership/mode administration; do not use a cached mode.
      await tx.$queryRaw`SELECT id FROM tenants WHERE id = ${ctx.tenantId} FOR NO KEY UPDATE`;
      const tenant = await tx.tenant.findUnique({ where: { id: ctx.tenantId }, select: { projectAccessMode: true } });
      if (!tenant) throw new ServiceError("NOT_FOUND", "Tenant no encontrado");
      assignCreator = tenant.projectAccessMode === "MEMBERSHIP_SCOPED";
    }
    await _guardClientRole(input.clientContactId, ctx.tenantId, tx);
    const created = await tx.project.create({
      data: {
        ...input,
        tenantId: ctx.tenantId,
        companyId,
        createdBy: ctx.actorUserId,
        updatedBy: ctx.actorUserId,
      },
    });
    const creatorMembership = assignCreator
      ? await tx.projectMembership.create({
          data: { tenantId: ctx.tenantId, projectId: created.id, userId: ctx.actorUserId, createdBy: ctx.actorUserId },
          select: { id: true, userId: true },
        })
      : null;

    await log({
      tenantId: ctx.tenantId,
      actorUserId: ctx.actorUserId,
      projectId: created.id,
      action: "project.created",
      entityType: "Project",
      entityId: created.id,
      after: {
        ...projectConfigurationAuditSnapshot(created), status: created.status, companyId: created.companyId,
        ...(creatorMembership ? { creatorMembership } : {}),
      },
      ipAddress: ctx.ipAddress,
    }, tx);
    return created;
  }, { maxWait: 10_000, timeout: 30_000 }));
  // Both company-scoped lists and scoped memberships changed; refresh request bags too.
  clearProjectAccessModeCache();

  await maybeAutoAddCreatorToProjectTeam({
    projectId: project.id,
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    roles: ctx.roles,
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
  await assertTenantModuleEnabled(ctx, "PROJECTS");
  const { requireProjectAccess } = await import("../security/access");
  await requireProjectAccess(projectId, ctx);
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
  await assertTenantModuleEnabled(ctx, "PROJECTS");
  const { requireProjectAccess } = await import("../security/access");
  await requireProjectAccess(id, ctx);

  const existing = await prisma.project.findUnique({ where: { id } });
  if (!existing) throw new ServiceError("NOT_FOUND", "Proyecto no encontrado");
  if (existing.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");

  // BR-PROJ-003: completed/cancelled are read-only
  if (existing.status === "COMPLETED" || existing.status === "CANCELLED") {
    throw new ServiceError("CONFLICT", "Los proyectos completados o cancelados no pueden modificarse");
  }

  assertProjectDateRange(
    input.startDate === undefined ? existing.startDate : input.startDate,
    input.expectedEndDate === undefined ? existing.expectedEndDate : input.expectedEndDate,
  );

  // BR-PROJ-002: preserve project classification after first APPROVED/CLOSED budget.
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

  return withProjectCodeConflict(input.code, () => prisma.$transaction(async (tx) => {
    if (input.code !== undefined) {
      // Writing a unique key may upgrade the project lock. Keep Tenant → Project
      // order so membership administration cannot invert the audit FK check.
      await tx.$queryRaw`SELECT id FROM tenants WHERE id = ${ctx.tenantId} FOR KEY SHARE`;
    }
    await lockProjectForMutation(tx, id, ctx.tenantId);
    if (input.type !== undefined && input.type !== existing.type) {
      const lockedBudget = await tx.budget.findFirst({
        where: { projectId: id, tenantId: ctx.tenantId, status: { in: ["APPROVED", "CLOSED"] } },
        select: { id: true },
      });
      if (lockedBudget) {
        throw new ServiceError("CONFLICT", "No se puede cambiar el tipo de obra después de un presupuesto aprobado o cerrado (BR-PROJ-002)");
      }
    }
    if (input.clientContactId && input.clientContactId !== existing.clientContactId) {
      await _guardClientRole(input.clientContactId, ctx.tenantId, tx);
    }
    const changed = await tx.project.updateMany({
      where: { id, tenantId: ctx.tenantId, status: existing.status, updatedAt: existing.updatedAt },
      data: {
        ...rest,
        ...(startDate !== undefined ? { startDate } : {}),
        ...(expectedEndDate !== undefined ? { expectedEndDate } : {}),
        updatedBy: ctx.actorUserId,
      },
    });
    assertOptimisticRowUpdate(changed.count, "El proyecto cambió mientras lo editabas. Recargá e intentá de nuevo.");
    const updated = await tx.project.findUniqueOrThrow({ where: { id } });
    await log({
      tenantId: ctx.tenantId,
      actorUserId: ctx.actorUserId,
      projectId: id,
      action: "project.updated",
      entityType: "Project",
      entityId: id,
      before: projectConfigurationAuditSnapshot(existing),
      after: projectConfigurationAuditSnapshot(updated),
      ipAddress: ctx.ipAddress,
    }, tx);
    return updated;
  }, { maxWait: 10_000, timeout: 30_000 }));
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
    (project) => {
      const actualEndDate = new Date();
      assertProjectDateRange(project.startDate, actualEndDate);
      return { actualEndDate };
    },
    input,
  );
}

export async function cancelProject(
  id: string,
  ctx: ServiceContext,
  input?: ProjectLifecycleInput,
): Promise<Project> {
  await assertTenantModuleEnabled(ctx, "PROJECTS");
  const { requireProjectAccess } = await import("../security/access");
  await requireProjectAccess(id, ctx);
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
  await assertTenantModuleEnabled(ctx, "PROJECTS");
  const { requireProjectAccess } = await import("../security/access");
  await requireProjectAccess(id, ctx);

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

  return prisma.$transaction(async (tx) => {
    await lockProjectForMutation(tx, id, ctx.tenantId);
    const flipped = await tx.project.updateMany({
      where: { id, tenantId: ctx.tenantId, status: "CANCELLED", updatedAt: project.updatedAt },
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
    const updated = await tx.project.findUniqueOrThrow({ where: { id } });
    await log({
      tenantId: ctx.tenantId,
      actorUserId: ctx.actorUserId,
      projectId: id,
      action: "project.reactivated",
      entityType: "Project",
      entityId: id,
      before: { status: "CANCELLED", previousStatus: project.statusBeforeCancellation },
      after: { status: targetStatus, reason, restoredStatus: targetStatus },
      ipAddress: ctx.ipAddress,
    }, tx);
    return updated;
  }, { maxWait: 10_000, timeout: 30_000 });
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function assertProjectDateRange(start: Date | null | undefined, end: Date | null | undefined): void {
  if ((start && !Number.isFinite(start.getTime())) || (end && !Number.isFinite(end.getTime()))) {
    throw new ServiceError("VALIDATION", "Ingresá una fecha válida");
  }
  if (start && end && start > end) {
    throw new ServiceError("VALIDATION", "La fecha de fin no puede ser anterior a la fecha de inicio");
  }
}

function projectConfigurationAuditSnapshot(project: Project) {
  return {
    code: project.code,
    name: project.name,
    type: project.type,
    clientContactId: project.clientContactId,
    startDate: project.startDate,
    expectedEndDate: project.expectedEndDate,
  };
}

async function withProjectCodeConflict<T>(code: string | undefined, operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (code !== undefined && error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const target = error.meta?.target;
      if ((Array.isArray(target) && target.includes("code")) || (typeof target === "string" && target.includes("code"))) {
        throw new ServiceError("CONFLICT", `Ya existe un proyecto con el código "${code}"`);
      }
    }
    throw error;
  }
}

async function _guardClientRole(contactId: string, tenantId: string, tx?: Prisma.TransactionClient) {
  await assertContactRoleInTenant(contactId, "CLIENT", tenantId, {
    contactNotFoundMessage: "Contacto cliente no encontrado",
    ...(tx ? { tx } : {}),
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
  await assertTenantModuleEnabled(ctx, "PROJECTS");
  const { requireProjectAccess } = await import("../security/access");
  await requireProjectAccess(id, ctx);
  const project =
    existingProject ?? (await prisma.project.findUnique({ where: { id } }));
  if (!project) throw new ServiceError("NOT_FOUND", "Proyecto no encontrado");
  if (project.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  if (!allowedFrom.includes(project.status)) {
    throw new ServiceError("CONFLICT", `No se puede cambiar el estado desde ${project.status}`);
  }

  const comment = input?.comment?.trim() || null;
  const reason = input?.reason?.trim() || null;

  const additionalData = extraData?.(project) as Prisma.ProjectUpdateManyMutationInput | undefined;
  return prisma.$transaction(async (tx) => {
    await lockProjectForMutation(tx, id, ctx.tenantId);
    if (to === "CANCELLED" && (project.status === "ACTIVE" || project.status === "ON_HOLD")) {
      await assertNoOpenOperationalDocuments(id, ctx.tenantId, tx);
    }
    const flipped = await tx.project.updateMany({
      where: { id, tenantId: ctx.tenantId, status: project.status, updatedAt: project.updatedAt },
      data: {
        status: to,
        updatedBy: ctx.actorUserId,
        ...additionalData,
      },
    });
    assertOptimisticRowUpdate(
      flipped.count,
      `No se puede cambiar el estado desde ${project.status}. Recargá e intentá de nuevo.`,
    );
    const updated = await tx.project.findUniqueOrThrow({ where: { id } });
    await log({
      tenantId: ctx.tenantId,
      actorUserId: ctx.actorUserId,
      projectId: id,
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
    }, tx);
    return updated;
  }, { maxWait: 10_000, timeout: 30_000 });
}
