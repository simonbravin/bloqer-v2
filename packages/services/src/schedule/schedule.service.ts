import { prisma } from "@bloqer/database";
import type { ScheduleItemStatus, ScheduleItemType } from "@bloqer/database";
import { can } from "@bloqer/domain";
import type { ServiceContext } from "../types";
import { ServiceError } from "../types";
import { assertTenantModuleEnabledWithGate, getTenantModuleGate } from "../tenant-modules/tenant-module.service";
import { canEditScheduleArea, canViewScheduleArea } from "./schedule-access";
import {
  assertScheduleStatusTransition,
  daysBetween,
  formatDateOnly,
  parseDateOnly,
  wouldCreateDependencyCycle,
} from "./schedule-helpers";
import {
  auditSchedule,
  scheduleItemSnapshot,
  SCHEDULE_ENTITY,
  SCHEDULE_ITEM_ENTITY,
  statusChangeAuditAction,
} from "./schedule-audit";
import { assertProjectAllowsBudgetPlanning } from "../project/project-operational-guard";

const MS_PER_DAY = 86_400_000;

async function assertProjectScheduleMutation(projectId: string, ctx: ServiceContext) {
  await assertProjectAllowsBudgetPlanning(projectId, ctx.tenantId);
}

async function assertProjectAccess(projectId: string, ctx: ServiceContext) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new ServiceError("NOT_FOUND", "Proyecto no encontrado");
  if (project.tenantId !== ctx.tenantId) {
    throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  }
  return project;
}

async function getScheduleForProject(projectId: string, ctx: ServiceContext) {
  const schedule = await prisma.schedule.findUnique({
    where: { projectId },
    include: { items: { select: { id: true } } },
  });
  if (!schedule) return null;
  if (schedule.tenantId !== ctx.tenantId) {
    throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  }
  return schedule;
}

async function getScheduleItemOrThrow(scheduleItemId: string, ctx: ServiceContext) {
  const item = await prisma.scheduleItem.findUnique({
    where: { id: scheduleItemId },
    include: { schedule: true },
  });
  if (!item) throw new ServiceError("NOT_FOUND", "Ítem de cronograma no encontrado");
  if (item.tenantId !== ctx.tenantId) {
    throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  }
  return item;
}

async function getScheduleItemForMutation(scheduleItemId: string, ctx: ServiceContext) {
  const item = await getScheduleItemOrThrow(scheduleItemId, ctx);
  await assertProjectScheduleMutation(item.schedule.projectId, ctx);
  return item;
}

export async function ensureScheduleForProject(projectId: string, ctx: ServiceContext) {
  if (!canViewScheduleArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver cronograma");
  }
  await assertProjectAccess(projectId, ctx);
  const gate = await getTenantModuleGate(ctx);
  assertTenantModuleEnabledWithGate(gate, "PROJECTS");
  assertTenantModuleEnabledWithGate(gate, "SCHEDULE");

  const existing = await getScheduleForProject(projectId, ctx);
  if (existing) return existing;

  await assertProjectScheduleMutation(projectId, ctx);

  const created = await prisma.schedule.create({
    data: {
      tenantId: ctx.tenantId,
      projectId,
      type: "HYBRID",
      createdBy: ctx.actorUserId,
      updatedBy: ctx.actorUserId,
    },
  });
  await auditSchedule(
    ctx,
    "schedule.created",
    SCHEDULE_ENTITY,
    created.id,
    undefined,
    { projectId, type: created.type },
  );
  return created;
}

export type ImportScheduleFromBudgetInput = {
  budgetId: string;
  includeGroups?: boolean;
  placeholderDates?: boolean;
};

export async function importScheduleFromBudget(
  projectId: string,
  input: ImportScheduleFromBudgetInput,
  ctx: ServiceContext,
) {
  if (!canEditScheduleArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para editar cronograma");
  }
  await assertProjectScheduleMutation(projectId, ctx);
  const project = await assertProjectAccess(projectId, ctx);
  const gate = await getTenantModuleGate(ctx);
  assertTenantModuleEnabledWithGate(gate, "SCHEDULE");

  const budget = await prisma.budget.findFirst({
    where: {
      id: input.budgetId,
      projectId,
      tenantId: ctx.tenantId,
      status: { in: ["APPROVED", "CLOSED"] },
    },
  });
  if (!budget) {
    throw new ServiceError("NOT_FOUND", "Presupuesto no encontrado o no está aprobado/cerrado");
  }

  const schedule = await ensureScheduleForProject(projectId, ctx);

  await prisma.schedule.update({
    where: { id: schedule.id },
    data: {
      baselineBudgetId: budget.id,
      updatedBy: ctx.actorUserId,
    },
  });

  const wbsNodes = await prisma.wbsNode.findMany({
    where: { budgetId: budget.id },
    orderBy: [{ parentId: "asc" }, { sortOrder: "asc" }, { code: "asc" }],
  });

  const existingLinks = await prisma.scheduleItemWbsLink.findMany({
    where: {
      tenantId: ctx.tenantId,
      scheduleItem: { scheduleId: schedule.id },
    },
    select: { wbsNodeId: true, scheduleItemId: true },
  });
  const linkedWbs = new Set(existingLinks.map((l) => l.wbsNodeId));
  const scheduleItemByWbsId = new Map<string, string>();
  for (const link of existingLinks) {
    scheduleItemByWbsId.set(link.wbsNodeId, link.scheduleItemId);
  }
  const includeGroups = input.includeGroups !== false;
  const placeholderDates = input.placeholderDates !== false;

  let placeholderStart: Date | null = null;
  let placeholderEnd: Date | null = null;
  if (placeholderDates && project.startDate && project.expectedEndDate) {
    placeholderStart = project.startDate;
    placeholderEnd = project.expectedEndDate;
  }

  const itemNodes = wbsNodes.filter((n) => n.type === "ITEM");
  const groupNodes = includeGroups ? wbsNodes.filter((n) => n.type === "GROUP") : [];

  let importedCount = 0;

  await prisma.$transaction(async (tx) => {
    for (const node of groupNodes) {
      if (linkedWbs.has(node.id)) continue;
      const parentScheduleId = node.parentId
        ? scheduleItemByWbsId.get(node.parentId)
        : undefined;

      const created = await tx.scheduleItem.create({
        data: {
          tenantId: ctx.tenantId,
          scheduleId: schedule.id,
          parentId: parentScheduleId ?? null,
          sortOrder: node.sortOrder,
          name: `${node.code} — ${node.name}`,
          type: "TASK",
          status: "PLANNED",
          createdBy: ctx.actorUserId,
          updatedBy: ctx.actorUserId,
          wbsLinks: {
            create: {
              tenantId: ctx.tenantId,
              wbsNodeId: node.id,
              isPrimary: true,
            },
          },
        },
      });
      scheduleItemByWbsId.set(node.id, created.id);
      linkedWbs.add(node.id);
      importedCount += 1;
    }

    const leafCount = Math.max(itemNodes.length, 1);
    let leafIndex = 0;

    for (const node of itemNodes) {
      if (linkedWbs.has(node.id)) continue;

      const parentScheduleId = node.parentId
        ? scheduleItemByWbsId.get(node.parentId)
        : undefined;

      let startDate: Date | null = null;
      let endDate: Date | null = null;
      let durationDays: number | null = null;

      if (placeholderStart && placeholderEnd) {
        const totalMs = placeholderEnd.getTime() - placeholderStart.getTime();
        const slice = totalMs / leafCount;
        startDate = new Date(placeholderStart.getTime() + slice * leafIndex);
        endDate = new Date(placeholderStart.getTime() + slice * (leafIndex + 1) - MS_PER_DAY);
        if (endDate < startDate) endDate = startDate;
        durationDays = daysBetween(startDate, endDate);
        leafIndex += 1;
      }

      const created = await tx.scheduleItem.create({
        data: {
          tenantId: ctx.tenantId,
          scheduleId: schedule.id,
          parentId: parentScheduleId ?? null,
          sortOrder: node.sortOrder,
          name: `${node.code} — ${node.name}`,
          type: "TASK",
          startDate,
          endDate,
          durationDays,
          status: "PLANNED",
          createdBy: ctx.actorUserId,
          updatedBy: ctx.actorUserId,
          wbsLinks: {
            create: {
              tenantId: ctx.tenantId,
              wbsNodeId: node.id,
              isPrimary: true,
            },
          },
        },
      });
      scheduleItemByWbsId.set(node.id, created.id);
      linkedWbs.add(node.id);
      importedCount += 1;
    }
  });

  if (importedCount > 0) {
    await auditSchedule(
      ctx,
      "schedule.imported_from_budget",
      SCHEDULE_ENTITY,
      schedule.id,
      undefined,
      { budgetId: budget.id, importedCount },
    );
  }

  return prisma.schedule.findUniqueOrThrow({
    where: { id: schedule.id },
    include: {
      items: {
        orderBy: [{ parentId: "asc" }, { sortOrder: "asc" }],
        include: { wbsLinks: { include: { wbsNode: { select: { id: true, code: true, name: true } } } } },
      },
    },
  });
}

export async function createScheduleItem(
  projectId: string,
  input: {
    parentId?: string | null;
    name: string;
    type?: ScheduleItemType;
    startDate?: string | null;
    endDate?: string | null;
    sortOrder?: number;
  },
  ctx: ServiceContext,
) {
  if (!canEditScheduleArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para editar cronograma");
  }
  await assertProjectScheduleMutation(projectId, ctx);
  await assertProjectAccess(projectId, ctx);
  const schedule = await ensureScheduleForProject(projectId, ctx);

  if (input.parentId) {
    const parent = await prisma.scheduleItem.findFirst({
      where: { id: input.parentId, scheduleId: schedule.id },
    });
    if (!parent) throw new ServiceError("NOT_FOUND", "Ítem padre no encontrado");
  }

  const startDate = input.startDate ? parseDateOnly(input.startDate) : null;
  const endDate = input.endDate ? parseDateOnly(input.endDate) : null;
  const durationDays =
    startDate && endDate ? daysBetween(startDate, endDate) : null;

  const created = await prisma.scheduleItem.create({
    data: {
      tenantId: ctx.tenantId,
      scheduleId: schedule.id,
      parentId: input.parentId ?? null,
      sortOrder: input.sortOrder ?? 0,
      name: input.name,
      type: input.type ?? "TASK",
      startDate,
      endDate,
      durationDays,
      createdBy: ctx.actorUserId,
      updatedBy: ctx.actorUserId,
    },
  });
  await auditSchedule(
    ctx,
    "schedule_item.created",
    SCHEDULE_ITEM_ENTITY,
    created.id,
    undefined,
    scheduleItemSnapshot(created),
  );
  return created;
}

export async function updateScheduleItemName(
  scheduleItemId: string,
  name: string,
  ctx: ServiceContext,
) {
  if (!canEditScheduleArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para editar cronograma");
  }
  const item = await getScheduleItemForMutation(scheduleItemId, ctx);
  const before = scheduleItemSnapshot(item);
  const updated = await prisma.scheduleItem.update({
    where: { id: item.id },
    data: { name: name.trim(), updatedBy: ctx.actorUserId },
  });
  await auditSchedule(
    ctx,
    "schedule_item.name_updated",
    SCHEDULE_ITEM_ENTITY,
    item.id,
    before,
    scheduleItemSnapshot(updated),
  );
  return updated;
}

export async function updateScheduleItemDates(
  scheduleItemId: string,
  input: { startDate: string | null; endDate: string | null },
  ctx: ServiceContext,
) {
  if (!canEditScheduleArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para editar cronograma");
  }
  const item = await getScheduleItemForMutation(scheduleItemId, ctx);

  const startDate = input.startDate ? parseDateOnly(input.startDate) : null;
  const endDate = input.endDate ? parseDateOnly(input.endDate) : null;
  if (startDate && endDate && endDate < startDate) {
    throw new ServiceError("VALIDATION", "La fecha de fin no puede ser anterior al inicio");
  }
  const durationDays =
    startDate && endDate ? daysBetween(startDate, endDate) : null;

  const before = scheduleItemSnapshot(item);
  const updated = await prisma.scheduleItem.update({
    where: { id: item.id },
    data: {
      startDate,
      endDate,
      durationDays,
      updatedBy: ctx.actorUserId,
    },
  });
  await auditSchedule(
    ctx,
    "schedule_item.dates_updated",
    SCHEDULE_ITEM_ENTITY,
    item.id,
    before,
    scheduleItemSnapshot(updated),
  );
  return updated;
}

export async function updateScheduleItemProgress(
  scheduleItemId: string,
  progressPct: number,
  ctx: ServiceContext,
) {
  if (!canEditScheduleArea(ctx.roles) && !can(ctx.roles, "VIEW", "SCHEDULE")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para actualizar avance");
  }
  const item = await getScheduleItemForMutation(scheduleItemId, ctx);

  const before = { progressPct: item.progressPct.toFixed(2) };
  const updated = await prisma.scheduleItem.update({
    where: { id: item.id },
    data: {
      progressPct,
      updatedBy: ctx.actorUserId,
    },
  });
  await auditSchedule(
    ctx,
    "schedule_item.progress_updated",
    SCHEDULE_ITEM_ENTITY,
    item.id,
    before,
    { progressPct: updated.progressPct.toFixed(2) },
  );
  return updated;
}

async function transitionScheduleItem(
  scheduleItemId: string,
  to: ScheduleItemStatus,
  ctx: ServiceContext,
  extra?: { blockReason?: string | null },
) {
  if (!canEditScheduleArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para editar cronograma");
  }
  const item = await getScheduleItemForMutation(scheduleItemId, ctx);
  assertScheduleStatusTransition(item.status, to);

  if (to === "BLOCKED" && !extra?.blockReason?.trim()) {
    throw new ServiceError("VALIDATION", "La causa de bloqueo es obligatoria");
  }

  const before = scheduleItemSnapshot(item);
  const updated = await prisma.scheduleItem.update({
    where: { id: item.id },
    data: {
      status: to,
      blockReason: to === "BLOCKED" ? extra!.blockReason!.trim() : to === "IN_PROGRESS" ? null : item.blockReason,
      updatedBy: ctx.actorUserId,
    },
  });
  await auditSchedule(
    ctx,
    statusChangeAuditAction(item.status, to),
    SCHEDULE_ITEM_ENTITY,
    item.id,
    before,
    scheduleItemSnapshot(updated),
  );
  return updated;
}

export const startScheduleItem = (id: string, ctx: ServiceContext) =>
  transitionScheduleItem(id, "IN_PROGRESS", ctx);

export const completeScheduleItem = (id: string, ctx: ServiceContext) =>
  transitionScheduleItem(id, "COMPLETED", ctx);

export const cancelScheduleItem = (id: string, ctx: ServiceContext) =>
  transitionScheduleItem(id, "CANCELLED", ctx);

export const blockScheduleItem = (
  id: string,
  blockReason: string,
  ctx: ServiceContext,
) => transitionScheduleItem(id, "BLOCKED", ctx, { blockReason });

export const unblockScheduleItem = (id: string, ctx: ServiceContext) =>
  transitionScheduleItem(id, "IN_PROGRESS", ctx);

export async function moveScheduleItemToStatus(
  scheduleItemId: string,
  targetStatus: ScheduleItemStatus,
  ctx: ServiceContext,
  blockReason?: string,
) {
  const item = await getScheduleItemForMutation(scheduleItemId, ctx);
  if (item.status === targetStatus) return item;

  switch (targetStatus) {
    case "IN_PROGRESS":
      return item.status === "BLOCKED"
        ? unblockScheduleItem(scheduleItemId, ctx)
        : startScheduleItem(scheduleItemId, ctx);
    case "COMPLETED":
      return completeScheduleItem(scheduleItemId, ctx);
    case "BLOCKED":
      return blockScheduleItem(scheduleItemId, blockReason ?? "", ctx);
    case "CANCELLED":
      return cancelScheduleItem(scheduleItemId, ctx);
    default:
      throw new ServiceError("VALIDATION", "Estado no soportado");
  }
}

export async function linkWbsNodesToScheduleItem(
  scheduleItemId: string,
  wbsNodeIds: string[],
  primaryWbsNodeId: string | undefined,
  ctx: ServiceContext,
) {
  if (!canEditScheduleArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para editar cronograma");
  }
  const item = await getScheduleItemForMutation(scheduleItemId, ctx);
  const schedule = await prisma.schedule.findUniqueOrThrow({
    where: { id: item.scheduleId },
  });

  if (!schedule.baselineBudgetId) {
    throw new ServiceError("VALIDATION", "Definí un presupuesto base antes de vincular WBS");
  }

  const nodes = await prisma.wbsNode.findMany({
    where: {
      id: { in: wbsNodeIds },
      budgetId: schedule.baselineBudgetId,
    },
  });
  if (nodes.length !== wbsNodeIds.length) {
    throw new ServiceError("NOT_FOUND", "Uno o más nodos WBS no pertenecen al presupuesto base");
  }

  const primary = primaryWbsNodeId ?? wbsNodeIds[0]!;

  await prisma.$transaction(async (tx) => {
    for (const wbsNodeId of wbsNodeIds) {
      await tx.scheduleItemWbsLink.upsert({
        where: {
          scheduleItemId_wbsNodeId: { scheduleItemId, wbsNodeId },
        },
        create: {
          tenantId: ctx.tenantId,
          scheduleItemId,
          wbsNodeId,
          isPrimary: wbsNodeId === primary,
        },
        update: { isPrimary: wbsNodeId === primary },
      });
    }
    await tx.scheduleItemWbsLink.updateMany({
      where: {
        scheduleItemId,
        wbsNodeId: { notIn: wbsNodeIds },
      },
      data: { isPrimary: false },
    });
  });

  await auditSchedule(
    ctx,
    "schedule_item.wbs_linked",
    SCHEDULE_ITEM_ENTITY,
    scheduleItemId,
    undefined,
    { wbsNodeIds, primaryWbsNodeId: primary },
  );

  return prisma.scheduleItem.findUniqueOrThrow({
    where: { id: scheduleItemId },
    include: {
      wbsLinks: { include: { wbsNode: { select: { id: true, code: true, name: true } } } },
    },
  });
}

export async function unlinkWbsNodeFromScheduleItem(
  scheduleItemId: string,
  wbsNodeId: string,
  ctx: ServiceContext,
) {
  if (!canEditScheduleArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para editar cronograma");
  }
  await getScheduleItemForMutation(scheduleItemId, ctx);
  await prisma.scheduleItemWbsLink.deleteMany({
    where: { scheduleItemId, wbsNodeId },
  });
  await auditSchedule(
    ctx,
    "schedule_item.wbs_unlinked",
    SCHEDULE_ITEM_ENTITY,
    scheduleItemId,
    { wbsNodeId },
    undefined,
  );
}

export async function addScheduleDependency(
  scheduleId: string,
  predecessorId: string,
  successorId: string,
  ctx: ServiceContext,
) {
  if (!canEditScheduleArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para editar cronograma");
  }
  const schedule = await prisma.schedule.findUnique({ where: { id: scheduleId } });
  if (!schedule || schedule.tenantId !== ctx.tenantId) {
    throw new ServiceError("NOT_FOUND", "Cronograma no encontrado");
  }
  await assertProjectScheduleMutation(schedule.projectId, ctx);

  const [pred, succ] = await Promise.all([
    prisma.scheduleItem.findFirst({ where: { id: predecessorId, scheduleId } }),
    prisma.scheduleItem.findFirst({ where: { id: successorId, scheduleId } }),
  ]);
  if (!pred || !succ) {
    throw new ServiceError("NOT_FOUND", "Ítems de dependencia no encontrados en este cronograma");
  }

  const existing = await prisma.scheduleItemDependency.findMany({
    where: { successor: { scheduleId } },
    select: { predecessorId: true, successorId: true },
  });

  if (wouldCreateDependencyCycle(existing, predecessorId, successorId)) {
    throw new ServiceError("VALIDATION", "La dependencia crearía un ciclo");
  }

  const dep = await prisma.scheduleItemDependency.create({
    data: {
      tenantId: ctx.tenantId,
      predecessorId,
      successorId,
      type: "FS",
    },
  });
  await auditSchedule(
    ctx,
    "schedule_dependency.added",
    SCHEDULE_ITEM_ENTITY,
    successorId,
    undefined,
    { dependencyId: dep.id, predecessorId, successorId, type: "FS" },
  );
  return dep;
}

export async function removeScheduleDependency(dependencyId: string, ctx: ServiceContext) {
  if (!canEditScheduleArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para editar cronograma");
  }
  const dep = await prisma.scheduleItemDependency.findUnique({ where: { id: dependencyId } });
  if (!dep) throw new ServiceError("NOT_FOUND", "Dependencia no encontrada");
  if (dep.tenantId !== ctx.tenantId) {
    throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  }
  const successor = await getScheduleItemOrThrow(dep.successorId, ctx);
  await assertProjectScheduleMutation(successor.schedule.projectId, ctx);
  await prisma.scheduleItemDependency.delete({ where: { id: dependencyId } });
  await auditSchedule(
    ctx,
    "schedule_dependency.removed",
    SCHEDULE_ITEM_ENTITY,
    dep.successorId,
    { dependencyId, predecessorId: dep.predecessorId, successorId: dep.successorId },
    undefined,
  );
}

export async function copyScheduleProgressFromPhysical(
  scheduleItemId: string,
  physicalPct: number,
  ctx: ServiceContext,
) {
  return updateScheduleItemProgress(scheduleItemId, physicalPct, ctx);
}

/** WBS node IDs linked to any schedule item in the project (for cross-module badges). */
export async function getScheduleLinkedWbsNodeIds(
  projectId: string,
  ctx: ServiceContext,
): Promise<string[]> {
  if (!canViewScheduleArea(ctx.roles)) return [];
  const schedule = await prisma.schedule.findUnique({
    where: { projectId },
    select: {
      tenantId: true,
      items: { select: { wbsLinks: { select: { wbsNodeId: true } } } },
    },
  });
  if (!schedule || schedule.tenantId !== ctx.tenantId) return [];
  return [
    ...new Set(schedule.items.flatMap((i) => i.wbsLinks.map((l) => l.wbsNodeId))),
  ];
}

export { formatDateOnly, getScheduleForProject };
export { listScheduleItemAuditHistory } from "./schedule-audit";
export { getScheduleItemContext } from "./schedule-item-context.service";
