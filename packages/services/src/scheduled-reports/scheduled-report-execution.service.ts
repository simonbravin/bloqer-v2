import type { EmailDeliveryStatus } from "@bloqer/database";
import { prisma } from "@bloqer/database";
import type { ServiceContext } from "../types";
import { assertCanManageScheduledReports } from "./scheduled-report-permissions";

export type ScheduledReportEmailDeliveryRow = {
  id: string;
  createdAt: Date;
  recipientEmail: string;
  status: EmailDeliveryStatus;
  skippedReason: string | null;
  errorMessage: string | null;
  runId: string | null;
  runWindow: string | null;
  attachmentCount: number | null;
};

export type ScheduledReportExecutionRun = {
  runKey: string;
  runId: string | null;
  runWindow: string | null;
  at: Date;
  deliveries: ScheduledReportEmailDeliveryRow[];
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  pendingCount: number;
};

function parseDeliveryMetadata(meta: unknown): {
  runId: string | null;
  runWindow: string | null;
  attachmentCount: number | null;
} {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    return { runId: null, runWindow: null, attachmentCount: null };
  }
  const o = meta as Record<string, unknown>;
  return {
    runId: typeof o.runId === "string" ? o.runId : null,
    runWindow: typeof o.runWindow === "string" ? o.runWindow : null,
    attachmentCount: typeof o.attachmentCount === "number" ? o.attachmentCount : null,
  };
}

export async function listScheduledReportEmailDeliveries(
  ctx: ServiceContext,
  scheduleId: string,
  limit = 100,
): Promise<ScheduledReportEmailDeliveryRow[]> {
  assertCanManageScheduledReports(ctx);

  const schedule = await prisma.scheduledReport.findFirst({
    where: { id: scheduleId, tenantId: ctx.tenantId },
    select: { id: true },
  });
  if (!schedule) return [];

  const take = Math.min(Math.max(limit, 1), 200);
  const rows = await prisma.emailDeliveryLog.findMany({
    where: {
      tenantId: ctx.tenantId,
      emailType: "REPORT_SCHEDULED",
      relatedEntityType: "SCHEDULED_REPORT",
      relatedEntityId: scheduleId,
    },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      createdAt: true,
      recipientEmail: true,
      status: true,
      skippedReason: true,
      errorMessage: true,
      metadata: true,
    },
  });

  return rows.map((row) => {
    const meta = parseDeliveryMetadata(row.metadata);
    return {
      id: row.id,
      createdAt: row.createdAt,
      recipientEmail: row.recipientEmail,
      status: row.status,
      skippedReason: row.skippedReason,
      errorMessage: row.errorMessage,
      runId: meta.runId,
      runWindow: meta.runWindow,
      attachmentCount: meta.attachmentCount,
    };
  });
}

export async function countRecentFailedScheduledReportDeliveries(
  ctx: ServiceContext,
  scheduleId: string,
  lookbackMs = 7 * 24 * 60 * 60 * 1000,
): Promise<number> {
  assertCanManageScheduledReports(ctx);
  const since = new Date(Date.now() - lookbackMs);
  return prisma.emailDeliveryLog.count({
    where: {
      tenantId: ctx.tenantId,
      emailType: "REPORT_SCHEDULED",
      relatedEntityType: "SCHEDULED_REPORT",
      relatedEntityId: scheduleId,
      status: "FAILED",
      createdAt: { gte: since },
    },
  });
}

export function groupScheduledReportDeliveriesIntoRuns(
  deliveries: ScheduledReportEmailDeliveryRow[],
): ScheduledReportExecutionRun[] {
  const map = new Map<string, ScheduledReportExecutionRun>();

  for (const d of deliveries) {
    const runKey = d.runId ?? d.runWindow ?? d.id;
    let run = map.get(runKey);
    if (!run) {
      run = {
        runKey,
        runId: d.runId,
        runWindow: d.runWindow,
        at: d.createdAt,
        deliveries: [],
        sentCount: 0,
        failedCount: 0,
        skippedCount: 0,
        pendingCount: 0,
      };
      map.set(runKey, run);
    }
    run.deliveries.push(d);
    if (d.createdAt > run.at) run.at = d.createdAt;
    if (d.status === "SENT") run.sentCount += 1;
    else if (d.status === "FAILED") run.failedCount += 1;
    else if (d.status === "SKIPPED") run.skippedCount += 1;
    else if (d.status === "PENDING") run.pendingCount += 1;
  }

  return [...map.values()].sort((a, b) => b.at.getTime() - a.at.getTime());
}
