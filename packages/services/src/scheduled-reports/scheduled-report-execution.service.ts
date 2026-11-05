import type { EmailDeliveryStatus, Prisma } from "@bloqer/database";
import { prisma } from "@bloqer/database";
import { companyScopeFilter } from "../company-scope";
import type { ServiceContext } from "../types";
import { assertCanManageScheduledReports } from "./scheduled-report-permissions";
import { SCHEDULED_REPORT_PROVIDER_REJECTED_PREFIX } from "./scheduled-report-run-status";
import { canReadScheduledReport } from "./scheduled-report.service";

const RETRY_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;

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

/** A global delivery can only be inspected by a company that can identify its recipient. */
export async function scheduledReportEmailCompanyScope(
  ctx: ServiceContext,
): Promise<Prisma.EmailDeliveryLogWhereInput> {
  if (!ctx.companyId) return {};
  const memberships = await prisma.userMembership.findMany({
    where: { tenantId: ctx.tenantId, ...companyScopeFilter(ctx) },
    select: { userId: true },
  });
  return {
    OR: [
      { companyId: ctx.companyId },
      { companyId: null, recipientUserId: { in: memberships.map(({ userId }) => userId) } },
    ],
  };
}

export async function listScheduledReportEmailDeliveries(
  ctx: ServiceContext,
  scheduleId: string,
  limit = 100,
): Promise<ScheduledReportEmailDeliveryRow[]> {
  assertCanManageScheduledReports(ctx);

  if (!await canReadScheduledReport(scheduleId, ctx)) return [];

  const take = Math.min(Math.max(limit, 1), 200);
  const rows = await prisma.emailDeliveryLog.findMany({
    where: {
      tenantId: ctx.tenantId,
      ...await scheduledReportEmailCompanyScope(ctx),
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
  lookbackMs = RETRY_LOOKBACK_MS,
): Promise<number> {
  assertCanManageScheduledReports(ctx);
  if (!await canReadScheduledReport(scheduleId, ctx)) return 0;
  const recipients = await prisma.scheduledReportRecipient.findMany({
    where: { tenantId: ctx.tenantId, scheduledReportId: scheduleId },
    select: { recipientUserId: true },
  });
  const pending = await listPendingScheduledReportRetries(
    ctx,
    scheduleId,
    recipients.map(({ recipientUserId }) => recipientUserId),
    lookbackMs,
  );
  return pending.reduce((count, batch) => count + batch.recipientIds.size, 0);
}

type ScheduledReportRetryWindow = {
  runWindow: string;
  originalDate: Date;
  recipientIds: Set<string>;
};

/** Keep the original slot and stable user identity across all attempts of one delivery. */
export async function listPendingScheduledReportRetries(
  ctx: ServiceContext,
  scheduleId: string,
  recipientIds: string[],
  lookbackMs = RETRY_LOOKBACK_MS,
): Promise<ScheduledReportRetryWindow[]> {
  if (recipientIds.length === 0) return [];
  const since = new Date(Date.now() - lookbackMs);
  const logs = await prisma.emailDeliveryLog.findMany({
    where: {
      tenantId: ctx.tenantId,
      ...await scheduledReportEmailCompanyScope(ctx),
      emailType: "REPORT_SCHEDULED",
      relatedEntityType: "SCHEDULED_REPORT",
      relatedEntityId: scheduleId,
      recipientUserId: { in: recipientIds },
      AND: [{
        OR: [
          { status: { in: ["PENDING", "SENT"] } },
          { status: "FAILED", errorMessage: { startsWith: SCHEDULED_REPORT_PROVIDER_REJECTED_PREFIX } },
        ],
      }],
      createdAt: { gte: since },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { recipientUserId: true, metadata: true, status: true },
  });

  const pendingByWindow = new Map<string, ScheduledReportRetryWindow>();
  const blockedByWindow = new Map<string, Set<string>>();
  for (const log of logs) {
    if (!log.recipientUserId) continue;
    const { runWindow } = parseDeliveryMetadata(log.metadata);
    if (!runWindow) continue;
    const iso = runWindow.replace(/^manual:/, "");
    const originalDate = new Date(iso);
    // Legacy retry timestamps carry no original slot. Keep them in history,
    // but do not generate an unrelated daily report from their attempt date.
    if (Number.isNaN(originalDate.getTime()) || originalDate.toISOString() !== iso) continue;

    if (log.status === "SENT" || log.status === "PENDING") {
      const blocked = blockedByWindow.get(runWindow) ?? new Set<string>();
      blocked.add(log.recipientUserId);
      blockedByWindow.set(runWindow, blocked);
    } else if (log.status === "FAILED") {
      const pending = pendingByWindow.get(runWindow) ?? {
        runWindow,
        originalDate,
        recipientIds: new Set<string>(),
      };
      pending.recipientIds.add(log.recipientUserId);
      pendingByWindow.set(runWindow, pending);
    }
  }
  for (const [window, pending] of pendingByWindow) {
    for (const recipientId of blockedByWindow.get(window) ?? []) {
      pending.recipientIds.delete(recipientId);
    }
  }
  return [...pendingByWindow.values()].filter(({ recipientIds: pending }) => pending.size > 0);
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
