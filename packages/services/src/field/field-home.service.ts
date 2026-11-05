import { can } from "@bloqer/domain";
import { prisma, type ProjectStatus, type ScheduleItemStatus } from "@bloqer/database";
import { isUuid, productCalendarDateUtc } from "@bloqer/utils";
import { canAccessProjectLayout } from "../project/project.service";
import { canMutateJobsiteLogAsContributor } from "../jobsite-log/jobsite-log-access";
import { canViewScheduleArea } from "../schedule/schedule-access";
import { computeDaysLate } from "../schedule/schedule-helpers";
import { getTenantModuleGate } from "../tenant-modules/tenant-module.service";
import type { TenantModuleGate } from "../tenant-modules/tenant-module-gate";
import { ServiceContext, ServiceError } from "../types";
import { getMyFieldPendingItems } from "./field-pending.service";
import type { FieldPendingCounts } from "./field-pending.service";
import {
  projectRowIdWhereForScope,
  requireProjectAccess,
  resolveAccessibleProjectScope,
} from "../security/access";

const TODAY_LIMIT = 5;
/** Bounds the number of works considered by the home overview. */
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

function getFieldHomeActions(roles: ServiceContext["roles"], gate: TenantModuleGate): FieldHomeActions {
  return {
    jobsiteLog: gate.isEnabled("JOBSITE_LOG") && canMutateJobsiteLogAsContributor(roles),
    purchaseRequest:
      gate.isEnabled("PROCUREMENT") &&
      (can(roles, "EDIT", "PURCHASE_REQUESTS") || can(roles, "EDIT", "PROCUREMENT")),
    consumption: gate.isEnabled("INVENTORY") && can(roles, "EDIT", "INVENTORY"),
    document: gate.isEnabled("PROJECTS") && can(roles, "EDIT", "PROJECTS"),
  };
}

/** Overview requires project listing access; registration uses the eligible project workspaces. */
export async function listFieldProjects(
  ctx: ServiceContext,
  options?: { registration?: boolean },
): Promise<FieldHomeProject[]> {
  const gate = await getTenantModuleGate(ctx);
  const registration = options?.registration === true;
  const canList = registration
    ? canAccessProjectLayout(ctx.roles, gate) && Object.values(getFieldHomeActions(ctx.roles, gate)).some(Boolean)
    : gate.isEnabled("PROJECTS") && can(ctx.roles, "VIEW", "PROJECTS");
  if (!canList) return [];
  const scope = await resolveAccessibleProjectScope(ctx);
  return prisma.project.findMany({
    where: {
      tenantId: ctx.tenantId,
      status: registration ? "ACTIVE" : { not: "CANCELLED" },
      ...projectRowIdWhereForScope(scope),
    },
    select: { id: true, code: true, name: true, status: true },
    orderBy: { code: "asc" },
    ...(registration ? {} : { take: FIELD_PROJECT_LIST_LIMIT }),
  });
}

export async function getFieldHome(
  ctx: ServiceContext,
  options?: { preferredProjectId?: string | null; pendingCounts?: FieldPendingCounts },
): Promise<FieldHomeView> {
  const started = Date.now();
  const gate = await getTenantModuleGate(ctx);
  const canListProjects = gate.isEnabled("PROJECTS") && can(ctx.roles, "VIEW", "PROJECTS");

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
            AND: [projectRowIdWhereForScope(await resolveAccessibleProjectScope(ctx))],
          },
          select: { id: true, code: true, name: true, status: true },
        })
      : null;
  const featuredProject =
    preferredRow ?? (projects.length === 1 ? projects[0]! : null);
  const needsProjectSelection = projects.length > 1 && featuredProject == null;

  const actions = getFieldHomeActions(ctx.roles, gate);

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
  if (!canAccessProjectLayout(ctx.roles, await getTenantModuleGate(ctx))) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver este proyecto");
  }
  const project = await requireProjectAccess(projectId, ctx);
  if (project.status === "CANCELLED") {
    throw new ServiceError("NOT_FOUND", "Proyecto no encontrado");
  }
}
