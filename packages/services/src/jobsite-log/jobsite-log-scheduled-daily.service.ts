import { prisma } from "@bloqer/database";
import { ServiceContext, ServiceError } from "../types";
import { assertJobsiteLogTenantModule } from "../tenant-modules/tenant-module-enforcement";
import { canViewJobsiteLogArea } from "./jobsite-log-access";

export type DailyJobsiteLogForSchedule = {
  id: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  logDate: Date;
  status: "SUBMITTED" | "APPROVED";
  workFront: string | null;
  shift: string | null;
  title: string | null;
};

/**
 * Parts SUBMITTED|APPROVED on `logDateIso` (YYYY-MM-DD) for ACTIVE projects in the selection.
 * Used by scheduled TENANT_JOBSITE_DAILY_LOGS ([D-100]).
 */
export async function listDailyJobsiteLogsForSchedule(
  projectIds: string[],
  logDateIso: string,
  ctx: ServiceContext,
): Promise<{
  logs: DailyJobsiteLogForSchedule[];
  truncated: boolean;
  takeLimit: number;
}> {
  await assertJobsiteLogTenantModule(ctx);
  if (!canViewJobsiteLogArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver partes de obra");
  }

  const uniqueIds = [...new Set(projectIds.filter(Boolean))];
  if (uniqueIds.length === 0) {
    return { logs: [], truncated: false, takeLimit: 0 };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(logDateIso)) {
    throw new ServiceError("VALIDATION", "Fecha de parte inválida");
  }

  const logDate = new Date(`${logDateIso}T00:00:00.000Z`);

  // Cap covers multi-shift / multiple SUBMITTED|APPROVED parts per obra (no @@unique on logDate).
  // Fetch take+1 to detect silent truncation.
  const take = Math.min(200, Math.max(40, uniqueIds.length * 10));

  const rows = await prisma.jobsiteLog.findMany({
    where: {
      tenantId: ctx.tenantId,
      projectId: { in: uniqueIds },
      logDate,
      status: { in: ["SUBMITTED", "APPROVED"] },
      project: { status: "ACTIVE", tenantId: ctx.tenantId },
    },
    select: {
      id: true,
      projectId: true,
      logDate: true,
      status: true,
      workFront: true,
      shift: true,
      title: true,
      project: { select: { code: true, name: true } },
    },
    orderBy: [{ project: { code: "asc" } }, { createdAt: "asc" }],
    take: take + 1,
  });

  const truncated = rows.length > take;
  const logs = truncated ? rows.slice(0, take) : rows;

  return {
    logs: logs.map((l) => ({
      id: l.id,
      projectId: l.projectId,
      projectCode: l.project.code,
      projectName: l.project.name,
      logDate: l.logDate,
      status: l.status as "SUBMITTED" | "APPROVED",
      workFront: l.workFront,
      shift: l.shift,
      title: l.title,
    })),
    truncated,
    takeLimit: take,
  };
}
