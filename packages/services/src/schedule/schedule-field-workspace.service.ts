import { prisma, type ScheduleItemStatus } from "@bloqer/database";
import type { ServiceContext } from "../types";
import { ServiceError } from "../types";
import { canEditScheduleArea, canViewScheduleArea } from "./schedule-access";
import {
  computeDaysLate,
  computeTimePlanProgressPct,
  formatDateOnly,
  isFormerScheduleContainer,
  isScheduleLeafItem,
} from "./schedule-helpers";
import { ensureScheduleForProject, findScheduleForProject } from "./schedule.service";
import { serializeProgressPct } from "./schedule-progress-sync-pure";
import {
  summarizeScheduleFieldKpis,
  type ScheduleFieldKpis,
} from "./schedule-field";

export type ScheduleFieldWbsLinkDto = {
  wbsNodeId: string;
  wbsCode: string;
  wbsName: string;
  isPrimary: boolean;
};

/** Leaf task/milestone for Cronograma Field — no cost-control / Gantt tree extras. */
export type ScheduleFieldItemDto = {
  id: string;
  parentId: string | null;
  name: string;
  type: string;
  status: ScheduleItemStatus;
  blockReason: string | null;
  startDate: string | null;
  endDate: string | null;
  progressPct: string;
  timePlanPct: string | null;
  daysLate: number | null;
  wbsLinks: ScheduleFieldWbsLinkDto[];
  predecessorIds: string[];
  predecessorNames: string[];
};

export type ScheduleFieldWorkspaceQueryTimings = {
  ensureScheduleMs: number;
  itemsMs: number;
  mapMs: number;
  totalMs: number;
};

export type ScheduleFieldWorkspaceDto = {
  type: "FIELD";
  projectId: string;
  scheduleId: string;
  canEdit: boolean;
  items: ScheduleFieldItemDto[];
  summary: ScheduleFieldKpis & { leafCount: number };
  queryBreakdown: ScheduleFieldWorkspaceQueryTimings;
};

let lastScheduleFieldWorkspaceTimings: ScheduleFieldWorkspaceQueryTimings | null = null;

export function getLastScheduleFieldWorkspaceTimings(): ScheduleFieldWorkspaceQueryTimings | null {
  return lastScheduleFieldWorkspaceTimings;
}

/**
 * Light read-model for Cronograma Field (`< lg`).
 * Reuses schedule permissions, module gates, ScheduleItems, `computeDaysLate`,
 * and `computeTimePlanProgressPct`. Does **not** call `getProjectCostControl`,
 * APU / cost-by-category, Gantt rollup DTOs, or successor edges.
 */
export async function getProjectScheduleFieldWorkspace(
  projectId: string,
  ctx: ServiceContext,
): Promise<ScheduleFieldWorkspaceDto> {
  const t0 = Date.now();
  if (!canViewScheduleArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver cronograma");
  }

  let t = Date.now();
  const existingSchedule = await findScheduleForProject(projectId, ctx);
  if (!existingSchedule && !canEditScheduleArea(ctx.roles)) {
    const emptyKpis = summarizeScheduleFieldKpis([]);
    const queryBreakdown: ScheduleFieldWorkspaceQueryTimings = {
      ensureScheduleMs: Date.now() - t,
      itemsMs: 0,
      mapMs: 0,
      totalMs: Date.now() - t0,
    };
    lastScheduleFieldWorkspaceTimings = queryBreakdown;
    return {
      type: "FIELD",
      projectId,
      scheduleId: "",
      canEdit: false,
      items: [],
      summary: { ...emptyKpis, leafCount: 0 },
      queryBreakdown,
    };
  }
  const schedule = existingSchedule ?? (await ensureScheduleForProject(projectId, ctx));
  const ensureScheduleMs = Date.now() - t;

  t = Date.now();
  const rows = await prisma.scheduleItem.findMany({
    where: { scheduleId: schedule.id, tenantId: ctx.tenantId },
    orderBy: [{ parentId: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      parentId: true,
      name: true,
      type: true,
      status: true,
      blockReason: true,
      startDate: true,
      endDate: true,
      progressPct: true,
      wbsLinks: {
        include: { wbsNode: { select: { id: true, code: true, name: true } } },
      },
      predecessors: { select: { predecessorId: true } },
    },
  });
  const itemsMs = Date.now() - t;

  const mapStarted = Date.now();
  const nameById = new Map(rows.map((row) => [row.id, row.name]));
  const tree = rows.map((row) => ({
    id: row.id,
    parentId: row.parentId,
    status: row.status,
  }));

  const items: ScheduleFieldItemDto[] = [];
  for (const row of rows) {
    if (row.status === "CANCELLED") continue;
    if (!isScheduleLeafItem(tree, row.id)) continue;

    // Former containers keep stale DB rollup dates — hide them (same as desktop merge).
    const former = isFormerScheduleContainer(tree, row.id);
    const startDate = former ? null : formatDateOnly(row.startDate);
    const endDate = former ? null : formatDateOnly(row.endDate);
    const predecessorIds = row.predecessors.map((p) => p.predecessorId);
    items.push({
      id: row.id,
      parentId: row.parentId,
      name: row.name,
      type: row.type,
      status: row.status,
      blockReason: row.blockReason,
      startDate,
      endDate,
      progressPct: serializeProgressPct(row.progressPct.toString()),
      timePlanPct: computeTimePlanProgressPct(startDate, endDate),
      daysLate: former ? null : computeDaysLate(row.endDate, row.status),
      wbsLinks: row.wbsLinks.map((link) => ({
        wbsNodeId: link.wbsNodeId,
        wbsCode: link.wbsNode.code,
        wbsName: link.wbsNode.name,
        isPrimary: link.isPrimary,
      })),
      predecessorIds,
      predecessorNames: predecessorIds
        .map((id) => nameById.get(id))
        .filter((name): name is string => Boolean(name)),
    });
  }

  const kpis = summarizeScheduleFieldKpis(items);
  const queryBreakdown: ScheduleFieldWorkspaceQueryTimings = {
    ensureScheduleMs,
    itemsMs,
    mapMs: Date.now() - mapStarted,
    totalMs: Date.now() - t0,
  };
  lastScheduleFieldWorkspaceTimings = queryBreakdown;
  if (process.env.BLOQER_SCHEDULE_PROFILE === "1") {
    console.info("[schedule-field-workspace] timings", queryBreakdown);
  }

  return {
    type: "FIELD",
    projectId,
    scheduleId: schedule.id,
    canEdit: canEditScheduleArea(ctx.roles),
    items,
    summary: { ...kpis, leafCount: items.length },
    queryBreakdown,
  };
}
