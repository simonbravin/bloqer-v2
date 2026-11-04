import { randomUUID } from "node:crypto";
import { ZodError } from "zod";
import {
  blockScheduleItemSchema,
  createScheduleItemSchema,
  updateScheduleItemNameSchema,
  updateScheduleItemDatesSchema,
  updateScheduleItemProgressSchema,
  linkWbsNodesSchema,
  moveScheduleItemSchema,
} from "@bloqer/validators";
import { Prisma, prisma } from "@bloqer/database";
import type { ScheduleItemStatus, ScheduleItemType } from "@bloqer/database";
import { canViewBudgetsArea } from "../project/project-nav-guards";
import { compareWbsCodes, sortByWbsCode } from "../budget/wbs-code-rules";
import type { ServiceContext } from "../types";
import { ServiceError } from "../types";
import {
  assertTenantModuleEnabledWithGate,
  getTenantModuleGate,
} from "../tenant-modules/tenant-module.service";
import {
  canEditScheduleArea,
  canViewScheduleArea,
  resolveEnsureScheduleCreatePolicy,
} from "./schedule-access";
import {
  assertScheduleStatusTransition,
  checkFinishStartViolations,
  computeContainerRollup,
  daysBetween,
  datesEqualOnDay,
  formatDateOnly,
  isFormerScheduleContainer,
  parseDateOnly,
  scheduleItemHasActiveChildren,
  wouldCreateDependencyCycle,
} from "./schedule-helpers";
import {
  auditSchedule,
  scheduleItemSnapshot,
  SCHEDULE_ENTITY,
  SCHEDULE_ITEM_ENTITY,
  statusChangeAuditAction,
} from "./schedule-audit";
import {
  assertProjectAllowsBudgetPlanning,
  lockProjectForBudgetPlanning,
} from "../project/project-operational-guard";
import { requireProjectAccess } from "../security/access";
import { companyScopeFilter, isCrossCompany } from "../company-scope";
import {
  serializeProgressPct,
  resolveScheduleStatusAfterProgressSync,
} from "./schedule-progress-sync-pure";
import {
  applyMoveSibling,
  resolveInsertSortOrder,
  suggestPlacementForWbs,
  type MoveAction,
  type ScheduleTreeNode,
} from "./schedule-placement";
import { assertCanCompleteScheduleItem } from "./schedule-milestone-from-receipt";

const MS_PER_DAY = 86_400_000;

function parseScheduleInput<T>(schema: { parse: (value: unknown) => T }, input: unknown): T {
  try {
    return schema.parse(input);
  } catch (error) {
    if (error instanceof ZodError)
      throw new ServiceError(
        "VALIDATION",
        error.issues[0]?.message ?? "Datos de cronograma inválidos",
      );
    throw error;
  }
}

async function requireScheduleBaseline(
  schedule: { baselineBudgetId: string | null; projectId: string },
  ctx: ServiceContext,
  db: Pick<Prisma.TransactionClient, "budget">,
) {
  if (!canViewBudgetsArea(ctx.roles))
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver presupuestos");
  assertTenantModuleEnabledWithGate(await getTenantModuleGate(ctx), "BUDGETS");
  if (!schedule.baselineBudgetId)
    throw new ServiceError("VALIDATION", "Definí un presupuesto base antes de vincular EDT");
  const budget = await db.budget.findFirst({
    where: {
      id: schedule.baselineBudgetId,
      projectId: schedule.projectId,
      tenantId: ctx.tenantId,
      ...companyScopeFilter(ctx),
      status: { in: ["APPROVED", "CLOSED"] },
    },
    select: { id: true },
  });
  if (!budget)
    throw new ServiceError(
      "NOT_FOUND",
      "El presupuesto base no está disponible en esta obra y empresa",
    );
  return budget;
}

async function assertProjectScheduleMutation(projectId: string, ctx: ServiceContext) {
  if (!canEditScheduleArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para editar cronograma");
  }
  await assertScheduleReadAccess(projectId, ctx);
  await assertProjectAllowsBudgetPlanning(projectId, ctx);
}

async function assertScheduleReadAccess(projectId: string, ctx: ServiceContext) {
  if (!canViewScheduleArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver cronograma");
  }
  await requireProjectAccess(projectId, ctx);
  const gate = await getTenantModuleGate(ctx);
  assertTenantModuleEnabledWithGate(gate, "PROJECTS");
  assertTenantModuleEnabledWithGate(gate, "SCHEDULE");
}

/** Project lifecycle, schedule writers and graph checks share this existing lock. */
async function withScheduleMutation<T>(
  projectId: string,
  ctx: ServiceContext,
  write: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  await assertProjectScheduleMutation(projectId, ctx);
  return prisma.$transaction(
    async (tx) => {
      const project = await lockProjectForBudgetPlanning(tx, projectId, ctx);
      if (isCrossCompany(project.companyId, ctx)) {
        throw new ServiceError("FORBIDDEN", "La obra no pertenece a la empresa activa");
      }
      return write(tx);
    },
    { maxWait: 10_000, timeout: 30_000 },
  );
}

async function withScheduleItemMutation<T>(
  scheduleItemId: string,
  ctx: ServiceContext,
  write: (
    item: Awaited<ReturnType<typeof getScheduleItemOrThrow>>,
    tx: Prisma.TransactionClient,
  ) => Promise<T>,
): Promise<T> {
  const original = await getScheduleItemOrThrow(scheduleItemId, ctx);
  return withScheduleMutation(original.schedule.projectId, ctx, async (tx) => {
    const item = await tx.scheduleItem.findFirst({
      where: {
        id: scheduleItemId,
        tenantId: ctx.tenantId,
        schedule: { projectId: original.schedule.projectId, tenantId: ctx.tenantId },
      },
      include: { schedule: true },
    });
    if (!item) throw new ServiceError("NOT_FOUND", "Ítem de cronograma no encontrado");
    return write(item, tx);
  });
}

async function assertProjectAccess(projectId: string, ctx: ServiceContext) {
  return requireProjectAccess(projectId, ctx);
}

async function getScheduleForProject(projectId: string, ctx: ServiceContext) {
  await assertScheduleReadAccess(projectId, ctx);
  const schedule = await prisma.schedule.findUnique({
    where: { projectId },
  });
  if (!schedule) return null;
  if (schedule.tenantId !== ctx.tenantId) {
    throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  }
  return schedule;
}

/** Bind route context before an action mutates an entity identified by UUID. */
export async function assertScheduleEntityProject(
  projectId: string,
  entity: { scheduleId: string } | { scheduleItemId: string } | { dependencyId: string },
  ctx: ServiceContext,
): Promise<void> {
  await assertScheduleReadAccess(projectId, ctx);
  if ("scheduleId" in entity) {
    const schedule = await prisma.schedule.findFirst({
      where: { id: entity.scheduleId, projectId, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (schedule) return;
  } else if ("scheduleItemId" in entity) {
    const item = await prisma.scheduleItem.findFirst({
      where: {
        id: entity.scheduleItemId,
        tenantId: ctx.tenantId,
        schedule: { projectId, tenantId: ctx.tenantId },
      },
      select: { id: true },
    });
    if (item) return;
  } else {
    const dependency = await prisma.scheduleItemDependency.findFirst({
      where: {
        id: entity.dependencyId,
        tenantId: ctx.tenantId,
        predecessor: { tenantId: ctx.tenantId, schedule: { projectId, tenantId: ctx.tenantId } },
        successor: { tenantId: ctx.tenantId, schedule: { projectId, tenantId: ctx.tenantId } },
      },
      select: { id: true },
    });
    if (dependency) return;
  }
  throw new ServiceError("NOT_FOUND", "El elemento no pertenece al cronograma de esta obra");
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
  if (item.schedule.tenantId !== ctx.tenantId) {
    throw new ServiceError("FORBIDDEN", "El ítem no pertenece al cronograma del tenant");
  }
  return item;
}

async function getScheduleItemForMutation(scheduleItemId: string, ctx: ServiceContext) {
  const item = await getScheduleItemOrThrow(scheduleItemId, ctx);
  await assertProjectScheduleMutation(item.schedule.projectId, ctx);
  return item;
}

async function rollupScheduleContainerDatesInTx(
  scheduleId: string,
  ctx: ServiceContext,
  tx: Prisma.TransactionClient,
) {
  const items = await tx.scheduleItem.findMany({
    where: { scheduleId, tenantId: ctx.tenantId },
    select: {
      id: true,
      parentId: true,
      status: true,
      startDate: true,
      endDate: true,
      durationDays: true,
      name: true,
      progressPct: true,
      blockReason: true,
    },
  });

  const rollup = computeContainerRollup(items);

  for (const [containerId, dates] of rollup) {
    const current = items.find((i) => i.id === containerId);
    if (!current) continue;

    const newStart = dates?.startDate ?? null;
    const newEnd = dates?.endDate ?? null;
    const newDuration = dates?.durationDays ?? null;

    const sameStart = datesEqualOnDay(current.startDate, newStart);
    const sameEnd = datesEqualOnDay(current.endDate, newEnd);
    if (sameStart && sameEnd && (current.durationDays ?? null) === newDuration) continue;

    const before = scheduleItemSnapshot(current);
    const updated = await tx.scheduleItem.update({
      where: { id: containerId },
      data: {
        startDate: newStart,
        endDate: newEnd,
        durationDays: newDuration,
        updatedBy: ctx.actorUserId,
      },
    });
    await auditSchedule(
      ctx,
      "schedule_item.dates_updated",
      SCHEDULE_ITEM_ENTITY,
      containerId,
      before,
      scheduleItemSnapshot(updated),
      tx,
    );
  }

  for (const item of items) {
    if (item.status === "CANCELLED") continue;
    if (!isFormerScheduleContainer(items, item.id)) continue;
    if (!item.startDate && !item.endDate) continue;

    const before = scheduleItemSnapshot(item);
    const updated = await tx.scheduleItem.update({
      where: { id: item.id },
      data: {
        startDate: null,
        endDate: null,
        durationDays: null,
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
      tx,
    );
  }
}

export async function rollupScheduleContainersForProject(projectId: string, ctx: ServiceContext) {
  return withScheduleMutation(projectId, ctx, async (tx) => {
    if (!canEditScheduleArea(ctx.roles)) {
      throw new ServiceError("FORBIDDEN", "Sin permisos para editar cronograma");
    }
    const schedule = await ensureScheduleInTx(tx, projectId, ctx);

    await (async () => {
      await rollupScheduleContainerDatesInTx(schedule.id, ctx, tx);
    })();

    await auditSchedule(
      ctx,
      "schedule.containers_rollup",
      SCHEDULE_ENTITY,
      schedule.id,
      undefined,
      { projectId },
      tx,
    );

    return schedule;
  });
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
  const policy = resolveEnsureScheduleCreatePolicy(Boolean(existing), ctx.roles);
  if (policy === "reuse" && existing) return existing;
  if (policy === "forbid_create") {
    throw new ServiceError("FORBIDDEN", "Sin permisos para crear cronograma");
  }

  await assertProjectScheduleMutation(projectId, ctx);

  return prisma.$transaction(
    async (tx) => {
      await lockProjectForBudgetPlanning(tx, projectId, ctx);
      return ensureScheduleInTx(tx, projectId, ctx);
    },
    { maxWait: 10_000, timeout: 30_000 },
  );
}

/** Preserve first-load baseline selection under the same guards as explicit import. */
export async function ensureScheduleBaselineForProject(
  projectId: string,
  budgetId: string,
  ctx: ServiceContext,
) {
  return withScheduleMutation(projectId, ctx, async (tx) => {
    const schedule = await ensureScheduleInTx(tx, projectId, ctx);
    if (schedule.baselineBudgetId) return schedule;
    await requireScheduleBaseline({ projectId, baselineBudgetId: budgetId }, ctx, tx);
    const updated = await tx.schedule.update({
      where: { id: schedule.id },
      data: { baselineBudgetId: budgetId, updatedBy: ctx.actorUserId },
    });
    await auditSchedule(
      ctx,
      "schedule.imported_from_budget",
      SCHEDULE_ENTITY,
      schedule.id,
      { baselineBudgetId: null },
      { budgetId, baselineBudgetId: budgetId, importedCount: 0 },
      tx,
    );
    return updated;
  });
}

/** The project write lock serializes creation and budget imports for this obra. */
async function ensureScheduleInTx(
  tx: Prisma.TransactionClient,
  projectId: string,
  ctx: ServiceContext,
) {
  const existing = await tx.schedule.findFirst({ where: { projectId, tenantId: ctx.tenantId } });
  if (existing) return existing;
  const created = await tx.schedule.create({
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
    tx,
  );
  return created;
}

/** Read-only: returns existing schedule or null — never creates. */
export async function findScheduleForProject(projectId: string, ctx: ServiceContext) {
  if (!canViewScheduleArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver cronograma");
  }
  await assertProjectAccess(projectId, ctx);
  const gate = await getTenantModuleGate(ctx);
  assertTenantModuleEnabledWithGate(gate, "PROJECTS");
  assertTenantModuleEnabledWithGate(gate, "SCHEDULE");
  return getScheduleForProject(projectId, ctx);
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
  await assertProjectAccess(projectId, ctx);
  const gate = await getTenantModuleGate(ctx);
  assertTenantModuleEnabledWithGate(gate, "PROJECTS");
  assertTenantModuleEnabledWithGate(gate, "SCHEDULE");
  assertTenantModuleEnabledWithGate(gate, "BUDGETS");

  return prisma.$transaction(
    async (tx) => {
      // Same Project → Budget order as WBS mutations. Read the tree, baseline and
      // existing links only after locking; a retry then imports only missing nodes.
      await lockProjectForBudgetPlanning(tx, projectId, ctx);
      await tx.$queryRaw`SELECT id FROM budgets WHERE id = ${input.budgetId} AND "tenantId" = ${ctx.tenantId} AND "projectId" = ${projectId} AND (${ctx.companyId}::text IS NULL OR "companyId" IS NULL OR "companyId" = ${ctx.companyId}) FOR UPDATE`;
      const budget = await tx.budget.findFirst({
        where: {
          id: input.budgetId,
          projectId,
          tenantId: ctx.tenantId,
          ...companyScopeFilter(ctx),
          status: { in: ["APPROVED", "CLOSED"] },
        },
      });
      if (!budget) {
        throw new ServiceError("NOT_FOUND", "Presupuesto no encontrado o no está aprobado/cerrado");
      }

      const schedule = await ensureScheduleInTx(tx, projectId, ctx);
      const previousBaselineId = schedule.baselineBudgetId;
      const baselineChanged = previousBaselineId !== budget.id;

      await tx.schedule.update({
        where: { id: schedule.id },
        data: {
          baselineBudgetId: budget.id,
          updatedBy: ctx.actorUserId,
        },
      });

      const wbsNodes = sortByWbsCode(
        await tx.wbsNode.findMany({
          where: { budgetId: budget.id },
          orderBy: [{ parentId: "asc" }, { sortOrder: "asc" }, { code: "asc" }],
        }),
      );

      const existingLinks = await tx.scheduleItemWbsLink.findMany({
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
      const placeholderDates = input.placeholderDates === true;

      let placeholderStart: Date | null = null;
      let placeholderEnd: Date | null = null;
      if (placeholderDates) {
        const projectDates = await tx.project.findUnique({
          where: { id: projectId },
          select: { startDate: true, expectedEndDate: true },
        });
        if (projectDates?.startDate && projectDates?.expectedEndDate) {
          placeholderStart = projectDates.startDate;
          placeholderEnd = projectDates.expectedEndDate;
        }
      }

      const itemNodes = wbsNodes.filter((n) => n.type === "ITEM");
      const groupNodes = includeGroups ? wbsNodes.filter((n) => n.type === "GROUP") : [];

      const newItemNodes = itemNodes.filter((n) => !linkedWbs.has(n.id));
      const siblingsByParent = new Map<string | null, typeof itemNodes>();
      for (const node of newItemNodes) {
        const key = node.parentId ?? null;
        const list = siblingsByParent.get(key) ?? [];
        list.push(node);
        siblingsByParent.set(key, list);
      }
      for (const list of siblingsByParent.values()) {
        list.sort((a, b) => a.sortOrder - b.sortOrder || compareWbsCodes(a.code, b.code));
      }

      const itemsToCreate: Prisma.ScheduleItemCreateManyInput[] = [];
      const linksToCreate: Prisma.ScheduleItemWbsLinkCreateManyInput[] = [];

      for (const node of groupNodes) {
        if (linkedWbs.has(node.id)) continue;
        const parentScheduleId = node.parentId ? scheduleItemByWbsId.get(node.parentId) : undefined;

        const itemId = randomUUID();
        itemsToCreate.push({
          id: itemId,
          tenantId: ctx.tenantId,
          scheduleId: schedule.id,
          parentId: parentScheduleId ?? null,
          sortOrder: node.sortOrder,
          name: `${node.code} — ${node.name}`,
          type: "TASK",
          status: "PLANNED",
          createdBy: ctx.actorUserId,
          updatedBy: ctx.actorUserId,
        });
        linksToCreate.push({
          tenantId: ctx.tenantId,
          scheduleItemId: itemId,
          wbsNodeId: node.id,
          isPrimary: true,
        });
        scheduleItemByWbsId.set(node.id, itemId);
        linkedWbs.add(node.id);
      }

      for (const node of itemNodes) {
        if (linkedWbs.has(node.id)) continue;

        const parentScheduleId = node.parentId ? scheduleItemByWbsId.get(node.parentId) : undefined;

        let startDate: Date | null = null;
        let endDate: Date | null = null;
        let durationDays: number | null = null;

        if (placeholderStart && placeholderEnd) {
          const siblings = siblingsByParent.get(node.parentId ?? null) ?? [node];
          const siblingIndex = Math.max(
            0,
            siblings.findIndex((s) => s.id === node.id),
          );
          const siblingCount = Math.max(siblings.length, 1);
          const totalMs = placeholderEnd.getTime() - placeholderStart.getTime();
          const slice = totalMs / siblingCount;
          startDate = new Date(placeholderStart.getTime() + slice * siblingIndex);
          endDate = new Date(placeholderStart.getTime() + slice * (siblingIndex + 1) - MS_PER_DAY);
          if (endDate < startDate) endDate = startDate;
          durationDays = daysBetween(startDate, endDate);
        }

        const itemId = randomUUID();
        itemsToCreate.push({
          id: itemId,
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
        });
        linksToCreate.push({
          tenantId: ctx.tenantId,
          scheduleItemId: itemId,
          wbsNodeId: node.id,
          isPrimary: true,
        });
        scheduleItemByWbsId.set(node.id, itemId);
        linkedWbs.add(node.id);
      }

      const importedCount = itemsToCreate.length;
      if (importedCount > 0) {
        // PostgreSQL checks self-FKs after the statement; preassigned UUIDs keep
        // parent/child links while avoiding one remote round trip per task.
        await tx.scheduleItem.createMany({ data: itemsToCreate });
        await tx.scheduleItemWbsLink.createMany({ data: linksToCreate });
        await rollupScheduleContainerDatesInTx(schedule.id, ctx, tx);
      }
      if (importedCount > 0 || baselineChanged) {
        await auditSchedule(
          ctx,
          "schedule.imported_from_budget",
          SCHEDULE_ENTITY,
          schedule.id,
          { baselineBudgetId: previousBaselineId },
          { budgetId: budget.id, baselineBudgetId: budget.id, importedCount },
          tx,
        );
      }

      return tx.schedule.findUniqueOrThrow({
        where: { id: schedule.id },
        include: {
          items: {
            orderBy: [{ parentId: "asc" }, { sortOrder: "asc" }],
            include: {
              wbsLinks: { include: { wbsNode: { select: { id: true, code: true, name: true } } } },
            },
          },
        },
      });
    },
    { maxWait: 10_000, timeout: 30_000 },
  );
}

export async function createScheduleItem(
  projectId: string,
  input: {
    parentId?: string | null;
    /** Insert immediately after this sibling (same parent). Takes precedence over sortOrder. */
    afterItemId?: string | null;
    name: string;
    type?: ScheduleItemType;
    startDate?: string | null;
    endDate?: string | null;
    sortOrder?: number;
    /** Optional leaf WBS to link as primary (D-039). */
    wbsNodeId?: string;
  },
  ctx: ServiceContext,
) {
  input = parseScheduleInput(createScheduleItemSchema, input);
  return withScheduleMutation(projectId, ctx, async (tx) => {
    if (!canEditScheduleArea(ctx.roles)) {
      throw new ServiceError("FORBIDDEN", "Sin permisos para editar cronograma");
    }
    const schedule = await ensureScheduleInTx(tx, projectId, ctx);

    const existingRows = await tx.scheduleItem.findMany({
      where: { scheduleId: schedule.id, tenantId: ctx.tenantId },
      select: {
        id: true,
        parentId: true,
        sortOrder: true,
        status: true,
        wbsLinks: { select: { wbsNodeId: true } },
      },
    });
    const treeNodes: ScheduleTreeNode[] = existingRows.map((r) => ({
      id: r.id,
      parentId: r.parentId,
      sortOrder: r.sortOrder,
      status: r.status,
      wbsNodeIds: r.wbsLinks.map((l) => l.wbsNodeId),
    }));

    let parentId = input.parentId ?? null;
    let afterItemId = input.afterItemId ?? null;

    // D-103: if WBS chosen and no explicit placement, suggest sibling under existing leaf.
    if (input.wbsNodeId && input.parentId === undefined && input.afterItemId === undefined) {
      const suggested = suggestPlacementForWbs(treeNodes, input.wbsNodeId);
      if (suggested) {
        parentId = suggested.parentId;
        afterItemId = suggested.afterItemId;
      }
    }

    if (afterItemId) {
      const after = existingRows.find((r) => r.id === afterItemId);
      if (!after || after.status === "CANCELLED") {
        throw new ServiceError("NOT_FOUND", "Ítem de referencia no encontrado");
      }
      // afterItem defines parent when parent not explicitly set
      if (input.parentId === undefined) {
        parentId = after.parentId ?? null;
      } else if ((after.parentId ?? null) !== parentId) {
        throw new ServiceError(
          "VALIDATION",
          "El ítem de referencia debe ser hermano (mismo padre)",
        );
      }
    }

    if (parentId) {
      const parent = existingRows.find((r) => r.id === parentId);
      if (!parent || parent.status === "CANCELLED") {
        throw new ServiceError("NOT_FOUND", "Ítem padre no encontrado");
      }
    }

    if (input.wbsNodeId) {
      await requireScheduleBaseline(schedule, ctx, tx);
      if (!schedule.baselineBudgetId) {
        throw new ServiceError(
          "VALIDATION",
          "Definí un presupuesto base (importá desde presupuesto) antes de vincular EDT",
        );
      }
      const node = await tx.wbsNode.findFirst({
        where: {
          id: input.wbsNodeId,
          budgetId: schedule.baselineBudgetId,
          type: "ITEM",
        },
        select: { id: true },
      });
      if (!node) {
        throw new ServiceError("NOT_FOUND", "La partida EDT no pertenece al presupuesto base");
      }
    }

    let startDate = input.startDate ? parseDateOnly(input.startDate) : null;
    let endDate = input.endDate ? parseDateOnly(input.endDate) : null;
    const itemType = input.type ?? "TASK";
    if (itemType === "MILESTONE") {
      const day = startDate ?? endDate;
      startDate = day;
      endDate = day;
    }
    if (startDate && endDate && endDate < startDate) {
      throw new ServiceError("VALIDATION", "La fecha de fin no puede ser anterior al inicio");
    }
    const durationDays = startDate && endDate ? daysBetween(startDate, endDate) : null;

    const siblings = existingRows
      .filter((r) => (r.parentId ?? null) === parentId && r.status !== "CANCELLED")
      .map((r) => ({ id: r.id, sortOrder: r.sortOrder }));

    const sortOrder =
      input.sortOrder !== undefined && !afterItemId
        ? input.sortOrder
        : resolveInsertSortOrder(siblings, afterItemId);

    if (
      sortOrder > 2_147_483_647 ||
      siblings.some((row) => row.sortOrder >= sortOrder && row.sortOrder >= 2_147_483_647)
    ) {
      throw new ServiceError(
        "VALIDATION",
        "El orden del cronograma alcanzó su capacidad. Reordená las tareas antes de agregar otra.",
      );
    }

    const created = await (async () => {
      // Shift siblings at or after insertion point
      await tx.scheduleItem.updateMany({
        where: {
          scheduleId: schedule.id,
          tenantId: ctx.tenantId,
          parentId,
          status: { not: "CANCELLED" },
          sortOrder: { gte: sortOrder },
        },
        data: { sortOrder: { increment: 1 } },
      });

      const row = await tx.scheduleItem.create({
        data: {
          tenantId: ctx.tenantId,
          scheduleId: schedule.id,
          parentId,
          sortOrder,
          name: input.name,
          type: input.type ?? "TASK",
          startDate,
          endDate,
          durationDays,
          createdBy: ctx.actorUserId,
          updatedBy: ctx.actorUserId,
        },
      });
      if (input.wbsNodeId) {
        await tx.scheduleItemWbsLink.create({
          data: {
            tenantId: ctx.tenantId,
            scheduleItemId: row.id,
            wbsNodeId: input.wbsNodeId,
            isPrimary: true,
          },
        });
      }
      // Leaf→container: drop parent's EDT so libro sync does not target a non-leaf.
      if (
        parentId &&
        !existingRows.some((r) => r.parentId === parentId && r.status !== "CANCELLED")
      ) {
        await tx.scheduleItemWbsLink.deleteMany({
          where: { scheduleItemId: parentId, tenantId: ctx.tenantId },
        });
      }
      await rollupScheduleContainerDatesInTx(schedule.id, ctx, tx);
      return row;
    })();
    await auditSchedule(
      ctx,
      "schedule_item.created",
      SCHEDULE_ITEM_ENTITY,
      created.id,
      undefined,
      {
        ...scheduleItemSnapshot(created),
        ...(input.wbsNodeId ? { wbsNodeId: input.wbsNodeId } : {}),
        afterItemId: afterItemId ?? undefined,
      },
      tx,
    );

    return created;
  });
}

export async function moveScheduleItem(
  projectId: string,
  input: {
    itemId: string;
    action: MoveAction;
  },
  ctx: ServiceContext,
): Promise<{
  item: Awaited<ReturnType<typeof prisma.scheduleItem.update>>;
  promotesLeafToContainer: boolean;
}> {
  input = parseScheduleInput(moveScheduleItemSchema, input);
  return withScheduleMutation(projectId, ctx, async (tx) => {
    if (!canEditScheduleArea(ctx.roles)) {
      throw new ServiceError("FORBIDDEN", "Sin permisos para editar cronograma");
    }

    const schedule = await tx.schedule.findUnique({ where: { projectId } });
    if (!schedule || schedule.tenantId !== ctx.tenantId) {
      throw new ServiceError("NOT_FOUND", "Cronograma no encontrado");
    }

    const rows = await tx.scheduleItem.findMany({
      where: { scheduleId: schedule.id, tenantId: ctx.tenantId },
      select: { id: true, parentId: true, sortOrder: true, status: true, name: true },
    });
    const item = rows.find((r) => r.id === input.itemId);
    if (!item) throw new ServiceError("NOT_FOUND", "Ítem no encontrado");
    if (item.status === "CANCELLED") {
      throw new ServiceError("VALIDATION", "No se puede reordenar un ítem cancelado");
    }

    const treeNodes: ScheduleTreeNode[] = rows.map((r) => ({
      id: r.id,
      parentId: r.parentId,
      sortOrder: r.sortOrder,
      status: r.status,
    }));

    const result = applyMoveSibling(treeNodes, input.itemId, input.action);
    if (!result) {
      throw new ServiceError("VALIDATION", "No se puede aplicar ese movimiento");
    }

    const before = {
      parentId: item.parentId,
      sortOrder: item.sortOrder,
    };

    const updated = await (async () => {
      // One statement keeps large sibling moves atomic without remote N+1 writes.
      const positions = Prisma.join(
        result.orderedSiblingIds.map((id, index) => Prisma.sql`(${id}::text, ${index}::integer)`),
      );
      const changed = await tx.$executeRaw`
        UPDATE schedule_items AS item
        SET "parentId" = ${result.parentId}, "sortOrder" = ordering.position,
            "updatedBy" = ${ctx.actorUserId}, "updatedAt" = CURRENT_TIMESTAMP
        FROM (VALUES ${positions}) AS ordering(id, position)
        WHERE item.id = ordering.id AND item."scheduleId" = ${schedule.id}
          AND item."tenantId" = ${ctx.tenantId}
      `;
      if (changed !== result.orderedSiblingIds.length) {
        throw new ServiceError(
          "CONFLICT",
          "Cambió el orden del cronograma. Recargá e intentá de nuevo.",
        );
      }
      // Leaf→container: drop new parent's EDT so libro sync targets leaves only.
      if (result.promotesLeafToContainer && result.parentId) {
        await tx.scheduleItemWbsLink.deleteMany({
          where: { scheduleItemId: result.parentId, tenantId: ctx.tenantId },
        });
      }
      await rollupScheduleContainerDatesInTx(schedule.id, ctx, tx);
      return tx.scheduleItem.findUniqueOrThrow({ where: { id: input.itemId } });
    })();

    await auditSchedule(
      ctx,
      "schedule_item.moved",
      SCHEDULE_ITEM_ENTITY,
      input.itemId,
      before,
      {
        parentId: updated.parentId,
        sortOrder: updated.sortOrder,
        action: input.action.kind,
        promotesLeafToContainer: result.promotesLeafToContainer,
      },
      tx,
    );

    return { item: updated, promotesLeafToContainer: result.promotesLeafToContainer };
  });
}

export async function updateScheduleItemName(
  scheduleItemId: string,
  name: string,
  ctx: ServiceContext,
) {
  name = parseScheduleInput(updateScheduleItemNameSchema, { name }).name;
  return withScheduleItemMutation(scheduleItemId, ctx, async (item, tx) => {
    if (!canEditScheduleArea(ctx.roles)) {
      throw new ServiceError("FORBIDDEN", "Sin permisos para editar cronograma");
    }
    const before = scheduleItemSnapshot(item);
    const updated = await tx.scheduleItem.update({
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
      tx,
    );
    return updated;
  });
}

export async function updateScheduleItemDates(
  scheduleItemId: string,
  input: { startDate: string | null; endDate: string | null },
  ctx: ServiceContext,
): Promise<{ item: Awaited<ReturnType<typeof prisma.scheduleItem.update>>; fsWarnings: string[] }> {
  input = parseScheduleInput(updateScheduleItemDatesSchema, input);
  return withScheduleItemMutation(scheduleItemId, ctx, async (item, tx) => {
    if (!canEditScheduleArea(ctx.roles)) {
      throw new ServiceError("FORBIDDEN", "Sin permisos para editar cronograma");
    }

    const siblings = await tx.scheduleItem.findMany({
      where: {
        scheduleId: item.scheduleId,
        tenantId: ctx.tenantId,
        status: { not: "CANCELLED" },
      },
      select: { id: true, parentId: true, status: true },
    });
    if (scheduleItemHasActiveChildren(siblings, item.id)) {
      throw new ServiceError(
        "VALIDATION",
        "Las fechas de contenedores se calculan automáticamente desde las subtareas.",
      );
    }

    let startDate = input.startDate ? parseDateOnly(input.startDate) : null;
    let endDate = input.endDate ? parseDateOnly(input.endDate) : null;
    if (item.type === "MILESTONE") {
      const day = startDate ?? endDate;
      startDate = day;
      endDate = day;
    }
    if (startDate && endDate && endDate < startDate) {
      throw new ServiceError("VALIDATION", "La fecha de fin no puede ser anterior al inicio");
    }
    const durationDays = startDate && endDate ? daysBetween(startDate, endDate) : null;

    const before = scheduleItemSnapshot(item);
    const updated = await (async () => {
      const row = await tx.scheduleItem.update({
        where: { id: item.id },
        data: {
          startDate,
          endDate,
          durationDays,
          updatedBy: ctx.actorUserId,
        },
      });
      await rollupScheduleContainerDatesInTx(item.scheduleId, ctx, tx);
      return row;
    })();
    await auditSchedule(
      ctx,
      "schedule_item.dates_updated",
      SCHEDULE_ITEM_ENTITY,
      item.id,
      before,
      scheduleItemSnapshot(updated),
      tx,
    );

    const predDeps = await tx.scheduleItemDependency.findMany({
      where: {
        successorId: item.id,
        tenantId: ctx.tenantId,
        predecessor: { scheduleId: item.scheduleId, tenantId: ctx.tenantId },
      },
      include: {
        predecessor: { select: { id: true, name: true, startDate: true, endDate: true } },
      },
    });
    const succDeps = await tx.scheduleItemDependency.findMany({
      where: {
        predecessorId: item.id,
        tenantId: ctx.tenantId,
        successor: { scheduleId: item.scheduleId, tenantId: ctx.tenantId },
      },
      include: { successor: { select: { id: true, name: true, startDate: true, endDate: true } } },
    });

    const fsWarnings = checkFinishStartViolations(
      {
        id: updated.id,
        name: updated.name,
        startDate: updated.startDate,
        endDate: updated.endDate,
      },
      predDeps.map((d) => d.predecessor),
      succDeps.map((d) => d.successor),
    );

    return { item: updated, fsWarnings };
  });
}

export async function updateScheduleItemProgress(
  scheduleItemId: string,
  progressPct: number,
  ctx: ServiceContext,
) {
  progressPct = parseScheduleInput(updateScheduleItemProgressSchema, { progressPct }).progressPct;
  return withScheduleItemMutation(scheduleItemId, ctx, async (item, tx) => {
    if (!canEditScheduleArea(ctx.roles)) {
      throw new ServiceError("FORBIDDEN", "Sin permisos para actualizar avance");
    }

    if (item.status === "CANCELLED") {
      throw new ServiceError("VALIDATION", "No se puede editar el avance de una tarea anulada");
    }
    if (item.status === "COMPLETED") {
      throw new ServiceError(
        "VALIDATION",
        "La tarea ya está completada. El avance real queda bloqueado.",
      );
    }

    // [D-046] Containers are date-derived; progress is leaf-only (manual % on parents misleads).
    const hasActiveChildren = await tx.scheduleItem.count({
      where: {
        parentId: item.id,
        status: { not: "CANCELLED" },
      },
    });
    if (hasActiveChildren > 0) {
      throw new ServiceError(
        "VALIDATION",
        "El avance se carga en tareas hoja. Las tareas contenedoras no aceptan % manual.",
      );
    }

    // Defense in depth (action Zod already 0–100); keep service safe for internal callers.
    const pct = serializeProgressPct(progressPct);
    const pctNum = Number(pct);
    if (!Number.isFinite(pctNum) || pctNum < 0 || pctNum > 100) {
      throw new ServiceError("VALIDATION", "Avance inválido (0–100)");
    }

    const nextStatus = resolveScheduleStatusAfterProgressSync(item.status, pct);
    // Progress-driven path uses the status matrix (same as libro sync), not the
    // MILESTONE-only PLANNED→COMPLETED button guard ([D-045] / [D-104]).
    if (nextStatus !== item.status) {
      assertScheduleStatusTransition(item.status, nextStatus);
    }

    const prevPct = serializeProgressPct(item.progressPct.toString());
    if (prevPct === pct && nextStatus === item.status) {
      return item;
    }

    const before = scheduleItemSnapshot(item);
    const updated = await tx.scheduleItem.update({
      where: { id: item.id },
      data: {
        progressPct: pct,
        status: nextStatus,
        ...(nextStatus !== item.status &&
        (nextStatus === "COMPLETED" || nextStatus === "IN_PROGRESS")
          ? { blockReason: null }
          : {}),
        updatedBy: ctx.actorUserId,
      },
    });
    const after = scheduleItemSnapshot(updated);
    await auditSchedule(
      ctx,
      "schedule_item.progress_updated",
      SCHEDULE_ITEM_ENTITY,
      item.id,
      before,
      after,
      tx,
    );
    if (nextStatus !== item.status) {
      await auditSchedule(
        ctx,
        statusChangeAuditAction(item.status, nextStatus),
        SCHEDULE_ITEM_ENTITY,
        item.id,
        before,
        after,
        tx,
      );
    }
    return updated;
  });
}

async function transitionScheduleItem(
  scheduleItemId: string,
  to: ScheduleItemStatus,
  ctx: ServiceContext,
  extra?: { blockReason?: string | null },
) {
  if (to === "BLOCKED") {
    extra = parseScheduleInput(blockScheduleItemSchema, { blockReason: extra?.blockReason });
  }
  return withScheduleItemMutation(scheduleItemId, ctx, async (item, tx) => {
    if (!canEditScheduleArea(ctx.roles)) {
      throw new ServiceError("FORBIDDEN", "Sin permisos para editar cronograma");
    }

    const siblingsForLeaf = await tx.scheduleItem.findMany({
      where: {
        scheduleId: item.scheduleId,
        tenantId: ctx.tenantId,
        status: { not: "CANCELLED" },
      },
      select: { id: true, parentId: true, status: true },
    });
    if (scheduleItemHasActiveChildren(siblingsForLeaf, item.id)) {
      throw new ServiceError(
        "VALIDATION",
        "Los contenedores no cambian de estado; editá las subtareas hoja.",
      );
    }

    // D-045: if Real is already 100% (e.g. libro approved while BLOCKED), Iniciar /
    // Desbloquear must land on COMPLETED — otherwise the item stays open and counts
    // as atrasada again.
    const progressPctNum = Number(serializeProgressPct(item.progressPct.toString()));
    let effectiveTo = to;
    if (
      to === "IN_PROGRESS" &&
      Number.isFinite(progressPctNum) &&
      progressPctNum >= 100 &&
      (item.status === "BLOCKED" || item.status === "PLANNED")
    ) {
      effectiveTo = "COMPLETED";
    }

    if (effectiveTo === "COMPLETED") {
      if (item.status === "PLANNED" && item.type === "TASK" && progressPctNum >= 100) {
        // Progress-driven (same as libro sync): matrix allows PLANNED→COMPLETED.
        assertScheduleStatusTransition(item.status, effectiveTo);
      } else {
        assertCanCompleteScheduleItem(item.type, item.status, effectiveTo, progressPctNum);
      }
    } else {
      assertScheduleStatusTransition(item.status, effectiveTo);
    }

    if (effectiveTo === "BLOCKED" && !extra?.blockReason?.trim()) {
      throw new ServiceError("VALIDATION", "La causa de bloqueo es obligatoria");
    }

    const before = scheduleItemSnapshot(item);
    const updated = await (async () => {
      const claimed = await tx.scheduleItem.updateMany({
        where: { id: item.id, tenantId: ctx.tenantId, status: item.status },
        data: {
          status: effectiveTo,
          ...(effectiveTo === "COMPLETED" ? { progressPct: new Prisma.Decimal(100) } : {}),
          blockReason:
            effectiveTo === "BLOCKED"
              ? extra!.blockReason!.trim()
              : effectiveTo === "IN_PROGRESS" ||
                  effectiveTo === "COMPLETED" ||
                  effectiveTo === "CANCELLED"
                ? null
                : item.blockReason,
          updatedBy: ctx.actorUserId,
        },
      });
      if (claimed.count !== 1) {
        throw new ServiceError(
          "CONFLICT",
          "El ítem de cronograma cambió de estado. Recargá e intentá de nuevo.",
        );
      }
      const row = await tx.scheduleItem.findUniqueOrThrow({ where: { id: item.id } });
      if (effectiveTo === "CANCELLED") {
        await rollupScheduleContainerDatesInTx(item.scheduleId, ctx, tx);
      }
      return row;
    })();
    await auditSchedule(
      ctx,
      statusChangeAuditAction(item.status, effectiveTo),
      SCHEDULE_ITEM_ENTITY,
      item.id,
      before,
      scheduleItemSnapshot(updated),
      tx,
    );
    return updated;
  });
}

export const startScheduleItem = (id: string, ctx: ServiceContext) =>
  transitionScheduleItem(id, "IN_PROGRESS", ctx);

export const completeScheduleItem = (id: string, ctx: ServiceContext) =>
  transitionScheduleItem(id, "COMPLETED", ctx);

export const cancelScheduleItem = (id: string, ctx: ServiceContext) =>
  transitionScheduleItem(id, "CANCELLED", ctx);

export const blockScheduleItem = (id: string, blockReason: string, ctx: ServiceContext) =>
  transitionScheduleItem(id, "BLOCKED", ctx, { blockReason });

export const unblockScheduleItem = (id: string, ctx: ServiceContext) =>
  transitionScheduleItem(id, "IN_PROGRESS", ctx);

export async function moveScheduleItemToStatus(
  scheduleItemId: string,
  targetStatus: ScheduleItemStatus,
  ctx: ServiceContext,
  blockReason?: string,
) {
  if (!canEditScheduleArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para editar cronograma");
  }
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
  const parsed = parseScheduleInput(linkWbsNodesSchema, { wbsNodeIds, primaryWbsNodeId });
  wbsNodeIds = parsed.wbsNodeIds;
  primaryWbsNodeId = parsed.primaryWbsNodeId;
  return withScheduleItemMutation(scheduleItemId, ctx, async (item, tx) => {
    if (!canEditScheduleArea(ctx.roles)) {
      throw new ServiceError("FORBIDDEN", "Sin permisos para editar cronograma");
    }

    const siblingsForLeaf = await tx.scheduleItem.findMany({
      where: {
        scheduleId: item.scheduleId,
        tenantId: ctx.tenantId,
        status: { not: "CANCELLED" },
      },
      select: { id: true, parentId: true, status: true },
    });
    if (scheduleItemHasActiveChildren(siblingsForLeaf, item.id)) {
      throw new ServiceError(
        "VALIDATION",
        "Solo se vincula EDT a tareas u hitos hoja (no a contenedores).",
      );
    }

    const schedule = await tx.schedule.findUniqueOrThrow({
      where: { id: item.scheduleId },
    });

    await requireScheduleBaseline(schedule, ctx, tx);

    const uniqueWbsIds = [...new Set(wbsNodeIds)];
    const nodes = await tx.wbsNode.findMany({
      where: {
        id: { in: uniqueWbsIds },
        budgetId: schedule.baselineBudgetId!,
        type: "ITEM",
      },
    });
    if (nodes.length !== uniqueWbsIds.length) {
      throw new ServiceError("NOT_FOUND", "Uno o más nodos EDT no pertenecen al presupuesto base");
    }

    if (primaryWbsNodeId && !uniqueWbsIds.includes(primaryWbsNodeId)) {
      throw new ServiceError("VALIDATION", "La partida primaria debe estar en la lista vinculada");
    }
    const primary = primaryWbsNodeId ?? uniqueWbsIds[0]!;

    await (async () => {
      // Demote all first so we never leave multiple or zero primaries mid-upsert.
      await tx.scheduleItemWbsLink.updateMany({
        where: { scheduleItemId },
        data: { isPrimary: false },
      });
      for (const wbsNodeId of uniqueWbsIds) {
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
    })();

    await auditSchedule(
      ctx,
      "schedule_item.wbs_linked",
      SCHEDULE_ITEM_ENTITY,
      scheduleItemId,
      undefined,
      { wbsNodeIds: uniqueWbsIds, primaryWbsNodeId: primary },
      tx,
    );

    return tx.scheduleItem.findUniqueOrThrow({
      where: { id: scheduleItemId },
      include: {
        wbsLinks: { include: { wbsNode: { select: { id: true, code: true, name: true } } } },
      },
    });
  });
}

export async function unlinkWbsNodeFromScheduleItem(
  scheduleItemId: string,
  wbsNodeId: string,
  ctx: ServiceContext,
) {
  return withScheduleItemMutation(scheduleItemId, ctx, async (item, tx) => {
    if (!canEditScheduleArea(ctx.roles)) {
      throw new ServiceError("FORBIDDEN", "Sin permisos para editar cronograma");
    }

    await (async () => {
      const existing = await tx.scheduleItemWbsLink.findUnique({
        where: { scheduleItemId_wbsNodeId: { scheduleItemId, wbsNodeId } },
      });
      if (!existing) return;

      await tx.scheduleItemWbsLink.delete({
        where: { scheduleItemId_wbsNodeId: { scheduleItemId, wbsNodeId } },
      });

      if (existing.isPrimary) {
        const next = await tx.scheduleItemWbsLink.findFirst({
          where: { scheduleItemId },
          orderBy: { createdAt: "asc" },
        });
        if (next) {
          await tx.scheduleItemWbsLink.update({
            where: { id: next.id },
            data: { isPrimary: true },
          });
        }
      }
    })();

    await auditSchedule(
      ctx,
      "schedule_item.wbs_unlinked",
      SCHEDULE_ITEM_ENTITY,
      scheduleItemId,
      { wbsNodeId },
      undefined,
      tx,
    );
  });
}

export async function addScheduleDependency(
  scheduleId: string,
  predecessorId: string,
  successorId: string,
  ctx: ServiceContext,
) {
  const schedule = await prisma.schedule.findFirst({
    where: { id: scheduleId, tenantId: ctx.tenantId },
  });
  if (!schedule) throw new ServiceError("NOT_FOUND", "Cronograma no encontrado");
  return withScheduleMutation(schedule.projectId, ctx, async (tx) => {
    const current = await tx.schedule.findFirst({
      where: { id: scheduleId, projectId: schedule.projectId, tenantId: ctx.tenantId },
    });
    if (!current) throw new ServiceError("NOT_FOUND", "Cronograma no encontrado");
    const items = await tx.scheduleItem.findMany({
      where: { id: { in: [predecessorId, successorId] }, scheduleId, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!items.some((i) => i.id === predecessorId) || !items.some((i) => i.id === successorId)) {
      throw new ServiceError("NOT_FOUND", "Ítems de dependencia no encontrados en este cronograma");
    }
    const existing = await tx.scheduleItemDependency.findMany({
      where: {
        tenantId: ctx.tenantId,
        predecessor: { scheduleId, tenantId: ctx.tenantId },
        successor: { scheduleId, tenantId: ctx.tenantId },
      },
      select: { id: true, predecessorId: true, successorId: true },
    });
    const duplicate = existing.find(
      (d) => d.predecessorId === predecessorId && d.successorId === successorId,
    );
    if (duplicate)
      return tx.scheduleItemDependency.findUniqueOrThrow({ where: { id: duplicate.id } });
    if (wouldCreateDependencyCycle(existing, predecessorId, successorId)) {
      throw new ServiceError("VALIDATION", "La dependencia crearía un ciclo");
    }
    const dep = await tx.scheduleItemDependency.create({
      data: { tenantId: ctx.tenantId, predecessorId, successorId, type: "FS" },
    });
    await auditSchedule(
      ctx,
      "schedule_dependency.added",
      SCHEDULE_ITEM_ENTITY,
      successorId,
      undefined,
      { dependencyId: dep.id, predecessorId, successorId, type: "FS" },
      tx,
    );
    return dep;
  });
}

export async function removeScheduleDependency(dependencyId: string, ctx: ServiceContext) {
  const original = await prisma.scheduleItemDependency.findFirst({
    where: { id: dependencyId, tenantId: ctx.tenantId },
    include: { successor: { include: { schedule: true } } },
  });
  if (
    !original ||
    original.successor.tenantId !== ctx.tenantId ||
    original.successor.schedule.tenantId !== ctx.tenantId
  ) {
    throw new ServiceError("NOT_FOUND", "Dependencia no encontrada");
  }
  return withScheduleMutation(original.successor.schedule.projectId, ctx, async (tx) => {
    const dep = await tx.scheduleItemDependency.findFirst({
      where: {
        id: dependencyId,
        tenantId: ctx.tenantId,
        successor: { tenantId: ctx.tenantId, scheduleId: original.successor.scheduleId },
        predecessor: { tenantId: ctx.tenantId, scheduleId: original.successor.scheduleId },
      },
    });
    if (!dep) throw new ServiceError("NOT_FOUND", "Dependencia no encontrada");
    await tx.scheduleItemDependency.delete({ where: { id: dependencyId } });
    await auditSchedule(
      ctx,
      "schedule_dependency.removed",
      SCHEDULE_ITEM_ENTITY,
      dep.successorId,
      { dependencyId, predecessorId: dep.predecessorId, successorId: dep.successorId },
      undefined,
      tx,
    );
  });
}

export async function copyScheduleProgressFromPhysical(
  scheduleItemId: string,
  physicalPct: number,
  ctx: ServiceContext,
) {
  return updateScheduleItemProgress(scheduleItemId, physicalPct, ctx);
}

/** Primary schedule item id per WBS (for deep links libro → cronograma). */
export async function getPrimaryScheduleItemIdsByWbs(
  projectId: string,
  wbsNodeIds: string[],
  ctx: ServiceContext,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!canViewScheduleArea(ctx.roles) || wbsNodeIds.length === 0) return map;
  await assertProjectAccess(projectId, ctx);
  const gate = await getTenantModuleGate(ctx);
  if (
    !gate.isEnabled("PROJECTS") ||
    !gate.isEnabled("SCHEDULE") ||
    !gate.isEnabled("BUDGETS") ||
    !canViewBudgetsArea(ctx.roles)
  )
    return map;

  const schedule = await prisma.schedule.findUnique({
    where: { projectId },
    select: { id: true, tenantId: true },
  });
  if (!schedule || schedule.tenantId !== ctx.tenantId) return map;

  const links = await prisma.scheduleItemWbsLink.findMany({
    where: {
      tenantId: ctx.tenantId,
      wbsNodeId: { in: wbsNodeIds },
      isPrimary: true,
      scheduleItem: { scheduleId: schedule.id },
      wbsNode: { budget: { tenantId: ctx.tenantId, projectId, ...companyScopeFilter(ctx) } },
    },
    orderBy: [{ scheduleItem: { sortOrder: "asc" } }, { scheduleItem: { name: "asc" } }],
    select: { wbsNodeId: true, scheduleItemId: true },
  });

  for (const link of links) {
    if (!map.has(link.wbsNodeId)) map.set(link.wbsNodeId, link.scheduleItemId);
  }
  return map;
}

/** WBS node IDs linked to any schedule item in the project (for cross-module badges). */
export async function getScheduleLinkedWbsNodeIds(
  projectId: string,
  ctx: ServiceContext,
): Promise<string[]> {
  if (!canViewScheduleArea(ctx.roles)) return [];
  await assertProjectAccess(projectId, ctx);
  const gate = await getTenantModuleGate(ctx);
  if (
    !gate.isEnabled("PROJECTS") ||
    !gate.isEnabled("SCHEDULE") ||
    !gate.isEnabled("BUDGETS") ||
    !canViewBudgetsArea(ctx.roles)
  )
    return [];
  const schedule = await prisma.schedule.findUnique({
    where: { projectId },
    select: {
      tenantId: true,
      items: {
        where: { tenantId: ctx.tenantId },
        select: {
          wbsLinks: {
            where: {
              tenantId: ctx.tenantId,
              wbsNode: {
                budget: { tenantId: ctx.tenantId, projectId, ...companyScopeFilter(ctx) },
              },
            },
            select: { wbsNodeId: true },
          },
        },
      },
    },
  });
  if (!schedule || schedule.tenantId !== ctx.tenantId) return [];
  return [...new Set(schedule.items.flatMap((i) => i.wbsLinks.map((l) => l.wbsNodeId)))];
}

export type ScheduleLinkableWbsOption = {
  id: string;
  code: string;
  name: string;
};

/** Leaf EDT (WBS ITEM) nodes from the schedule baseline budget — for link pickers. */
export async function listScheduleLinkableWbsOptions(
  projectId: string,
  ctx: ServiceContext,
): Promise<ScheduleLinkableWbsOption[]> {
  if (!canViewScheduleArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver cronograma");
  }
  await assertScheduleReadAccess(projectId, ctx);
  const schedule = await prisma.schedule.findUnique({
    where: { projectId },
    select: { baselineBudgetId: true, tenantId: true, projectId: true },
  });
  if (!schedule || schedule.tenantId !== ctx.tenantId) {
    throw new ServiceError("NOT_FOUND", "Cronograma no encontrado");
  }
  if (!schedule.baselineBudgetId) return [];
  await requireScheduleBaseline(schedule, ctx, prisma);

  const nodes = await prisma.wbsNode.findMany({
    where: {
      type: "ITEM",
      budgetId: schedule.baselineBudgetId,
    },
    select: { id: true, code: true, name: true },
  });
  const ordered = sortByWbsCode(nodes);
  return ordered.map((n) => ({ id: n.id, code: n.code, name: n.name }));
}

export { formatDateOnly, getScheduleForProject };
export { listScheduleItemAuditHistory } from "./schedule-audit";
export { getScheduleItemContext } from "./schedule-item-context.service";
