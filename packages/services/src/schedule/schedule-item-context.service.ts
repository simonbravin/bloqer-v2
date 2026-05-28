import { prisma } from "@bloqer/database";
import { canViewScheduleArea } from "./schedule-access";
import { ServiceError } from "../types";
import type { ServiceContext } from "../types";

export type ScheduleItemJobsiteEntry = {
  jobsiteLogId: string;
  logDate: string;
  status: string;
  quantityCompleted: string | null;
  physicalPct: string | null;
  href: string;
};

export type ScheduleItemCertificationEntry = {
  certificationId: string;
  certificationNumber: number;
  status: string;
  periodAmount: string;
  href: string;
};

export type ScheduleItemContextDto = {
  jobsiteEntries: ScheduleItemJobsiteEntry[];
  certificationEntries: ScheduleItemCertificationEntry[];
};

export async function getScheduleItemContext(
  projectId: string,
  scheduleItemId: string,
  ctx: ServiceContext,
): Promise<ScheduleItemContextDto> {
  if (!canViewScheduleArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos");
  }

  const item = await prisma.scheduleItem.findFirst({
    where: { id: scheduleItemId, schedule: { projectId, tenantId: ctx.tenantId } },
    include: { wbsLinks: { where: { isPrimary: true }, take: 1 } },
  });
  if (!item) throw new ServiceError("NOT_FOUND", "Ítem no encontrado");

  const primaryWbsId = item.wbsLinks[0]?.wbsNodeId;
  if (!primaryWbsId) {
    return { jobsiteEntries: [], certificationEntries: [] };
  }

  const base = `/proyectos/${projectId}`;

  const progressRows = await prisma.jobsiteLogProgress.findMany({
    where: {
      wbsNodeId: primaryWbsId,
      jobsiteLog: { tenantId: ctx.tenantId, projectId, status: "APPROVED" },
    },
    include: {
      jobsiteLog: { select: { id: true, logDate: true, status: true } },
    },
    orderBy: { jobsiteLog: { logDate: "desc" } },
    take: 10,
  });

  const certLines = await prisma.certificationLine.findMany({
    where: {
      wbsNodeId: primaryWbsId,
      certification: {
        tenantId: ctx.tenantId,
        projectId,
        status: { in: ["ISSUED", "APPROVED"] },
      },
    },
    include: {
      certification: { select: { id: true, number: true, status: true } },
    },
    orderBy: { certification: { issueDate: "desc" } },
    take: 10,
  });

  return {
    jobsiteEntries: progressRows.map((p) => ({
      jobsiteLogId: p.jobsiteLog.id,
      logDate: p.jobsiteLog.logDate.toISOString().slice(0, 10),
      status: p.jobsiteLog.status,
      quantityCompleted: p.quantityCompleted?.toString() ?? null,
      physicalPct: p.physicalPct?.toFixed(2) ?? null,
      href: `${base}/libro-obra/${p.jobsiteLog.id}`,
    })),
    certificationEntries: certLines.map((l) => ({
      certificationId: l.certification.id,
      certificationNumber: l.certification.number,
      status: l.certification.status,
      periodAmount: l.periodAmount.toFixed(2),
      href: `${base}/certificaciones/${l.certification.id}`,
    })),
  };
}
