import { can } from "@bloqer/domain";
import { prisma, type ProjectStatus, type ScheduleItemStatus } from "@bloqer/database";
import { isUuid, productCalendarDateUtc } from "@bloqer/utils";
import { canAccessProjectLayout } from "../project/project.service";
import { canViewScheduleArea } from "../schedule/schedule-access";
import { computeDaysLate } from "../schedule/schedule-helpers";
import { getTenantModuleGate } from "../tenant-modules/tenant-module.service";
import { ServiceContext, ServiceError } from "../types";
import { getMyFieldPendingItems } from "./field-pending.service";
import type { FieldPendingCounts } from "./field-pending.service";

const TODAY_LIMIT = 5;
/** Matches `listProjects` max pageSize — Field pickers must not silently drop obras. */
export const FIELD_PROJECT_LIST_LIMIT = 100;

export type FieldHomeProject = {
  id: string;
  code: string;
  name: string;
  status: ProjectStatus;
};

export type FieldHomeTodayItem = {
  id: string;
  name: string;
  status: ScheduleItemStatus;
  startDate: Date | null;
  endDate: Date | null;
  progressPct: string;
  daysLate: number | null;
  projectId: string;
  projectCode: string;
  projectName: string;
};

export type FieldHomeActions = {
  jobsiteLog: boolean;
  purchaseRequest: boolean;
  consumption: boolean;
  document: boolean;
};

export type FieldHomeView = {
  projects: FieldHomeProject[];
  featuredProject: FieldHomeProject | null;
  needsProjectSelection: boolean;
  todayItems: FieldHomeTodayItem[];
  pendingCounts: FieldPendingCounts;
  actions: FieldHomeActions;
  canViewSchedule: boolean;
  queryMs: number;
};

/** Operational obras for Field pickers. Excludes CANCELLED; capped at `FIELD_PROJECT_LIST_LIMIT`. */
export async function listFieldProjects(ctx: ServiceContext): Promise<FieldHomeProject[]> {
  if (!can(ctx.roles, "VIEW", "PROJECTS")) return [];
  return prisma.project.findMany({
    where: { tenantId: ctx.tenantId, status: { not: "CANCELLED" } },
    select: { id: true, code: true, name: true, status: true },
    orderBy: { code: "asc" },
    take: FIELD_PROJECT_LIST_LIMIT,
  });
}

export async function getFieldHome(
  ctx: ServiceContext,
  options?: { preferredProjectId?: string | null; pendingCounts?: FieldPendingCounts },
): Promise<FieldHomeView> {
  const started = Date.now();
  const gate = await getTenantModuleGate(ctx);
  const canListProjects = can(ctx.roles, "VIEW", "PROJECTS");

  const projects = canListProjects ? await listFieldProjects(ctx) : [];

  const preferred =
    options?.preferredProjectId && isUuid(options.preferredProjectId)
      ? options.preferredProjectId
      : null;
  const preferredRow =
    preferred && canListProjects && canAccessProjectLayout(ctx.roles)
      ? await prisma.project.findFirst({
          where: {
            id: preferred,
            tenantId: ctx.tenantId,
            status: { not: "CANCELLED" },
          },
          select: { id: true, code: true, name: true, status: true },
        })
      : null;
  const featuredProject =
    preferredRow ?? (projects.length === 1 ? projects[0]! : null);
  const needsProjectSelection = projects.length > 1 && featuredProject == null;

  const actions: FieldHomeActions = {
    jobsiteLog:
      gate.isEnabled("JOBSITE_LOG") &&
      (can(ctx.roles, "EDIT", "JOBSITE_LOG") || can(ctx.roles, "EDIT", "PROJECTS")),
    purchaseRequest:
      gate.isEnabled("PROCUREMENT") &&
      (can(ctx.roles, "EDIT", "PURCHASE_REQUESTS") || can(ctx.roles, "EDIT", "PROCUREMENT")),
    consumption: gate.isEnabled("INVENTORY") && can(ctx.roles, "EDIT", "INVENTORY"),
    document: can(ctx.roles, "EDIT", "PROJECTS"),
  };

  const todayScopeIds = featuredProject ? [featuredProject.id] : projects.map((p) => p.id);
  const canViewSchedule =
    gate.isEnabled("SCHEDULE") && canViewScheduleArea(ctx.roles);
  const canSchedule = canViewSchedule && todayScopeIds.length > 0;

  const today = productCalendarDateUtc();
  const [pending, todayRows] = await Promise.all([
    options?.pendingCounts
      ? Promise.resolve({ counts: options.pendingCounts })
      : getMyFieldPendingItems(ctx, {
          countsOnly: true,
        }),
    canSchedule
      ? prisma.scheduleItem.findMany({
          where: {
            tenantId: ctx.tenantId,
            status: { notIn: ["COMPLETED", "CANCELLED"] },
            schedule: { projectId: { in: todayScopeIds } },
            // Same overlap as `calendarRangeOverlapsIsoDay`: span today, or a
            // milestone with a single bound equal to today (AUDITORIA_MOBILE §Hoy).
            OR: [
              {
                AND: [
                  { startDate: { lte: today } },
                  { endDate: { gte: today } },
                ],
              },
              { AND: [{ startDate: today }, { endDate: null }] },
              { AND: [{ endDate: today }, { startDate: null }] },
            ],
            children: {
              none: { tenantId: ctx.tenantId, status: { not: "CANCELLED" } },
            },
          },
          orderBy: { endDate: "asc" },
          take: TODAY_LIMIT,
          select: {
            id: true,
            name: true,
            status: true,
            startDate: true,
            endDate: true,
            progressPct: true,
            schedule: {
              select: {
                projectId: true,
                project: { select: { code: true, name: true } },
              },
            },
          },
        })
      : Promise.resolve([]),
  ]);
  const todayItems: FieldHomeTodayItem[] = todayRows.map((row) => ({
    id: row.id,
    name: row.name,
    status: row.status,
    startDate: row.startDate,
    endDate: row.endDate,
    progressPct: row.progressPct.toFixed(2),
    daysLate: computeDaysLate(row.endDate, row.status),
    projectId: row.schedule.projectId,
    projectCode: row.schedule.project.code,
    projectName: row.schedule.project.name,
  }));

  return {
    projects,
    featuredProject,
    needsProjectSelection,
    todayItems,
    pendingCounts: pending.counts,
    actions,
    canViewSchedule,
    queryMs: Date.now() - started,
  };
}

export async function assertPreferredProjectAccess(
  projectId: string,
  ctx: ServiceContext,
): Promise<void> {
  if (!isUuid(projectId)) throw new ServiceError("VALIDATION", "Proyecto inválido");
  const row = await prisma.project.findFirst({
    where: { id: projectId, tenantId: ctx.tenantId, status: { not: "CANCELLED" } },
    select: { id: true },
  });
  if (!row) throw new ServiceError("NOT_FOUND", "Proyecto no encontrado");
  if (!canAccessProjectLayout(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver este proyecto");
  }
}
