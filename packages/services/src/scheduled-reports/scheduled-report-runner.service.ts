import { prisma } from "@bloqer/database";
import type { ScheduledReportRunStatus } from "@bloqer/database";
import type { ScheduledReportKey } from "@bloqer/validators";
import { randomUUID } from "crypto";
import { ServiceContext, ServiceError } from "../types";
import { calculateNextRunAt } from "./scheduling";
import { assertCanManageScheduledReports } from "./scheduled-report-permissions";
import { buildScheduledReportsCronServiceContext } from "./scheduled-report-cron-context";
import type { BuildScheduledReportAttachmentFn } from "./scheduled-report-attachment.service";
import {
  deliverScheduledReportBundle,
  type ScheduledReportDeliveryKind,
} from "./scheduled-report-delivery.service";

const RUN_LOCK_MS = 10 * 60 * 1000;
const DUE_BATCH_PER_TENANT = 25;

export type ScheduledReportRunSummary = {
  scheduleId: string;
  ok: boolean;
  runStatus: ScheduledReportRunStatus | "LOCKED";
  recipientsSent: number;
  recipientsSkipped: number;
  recipientsFailed: number;
  recipientsDuplicate: number;
  attachmentErrors: string[];
};

function paramsFromJson(raw: unknown): Record<string, string> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "string") out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : null;
}

type ScheduleRow = {
  id: string;
  tenantId: string;
  companyId: string | null;
  projectId: string | null;
  name: string;
  status: "ACTIVE" | "PAUSED" | "DELETED";
  frequency: "DAILY" | "WEEKLY" | "MONTHLY";
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  timeOfDay: string;
  timezone: string;
  format: "CSV" | "PDF";
  params: unknown;
  nextRunAt: Date;
  items: { reportKey: string; sortOrder: number }[];
  recipients: { recipientUserId: string; recipient: { email: string } }[];
};

const scheduleSelect = {
  id: true,
  tenantId: true,
  companyId: true,
  projectId: true,
  name: true,
  status: true,
  frequency: true,
  dayOfWeek: true,
  dayOfMonth: true,
  timeOfDay: true,
  timezone: true,
  format: true,
  params: true,
  nextRunAt: true,
  items: { orderBy: { sortOrder: "asc" as const }, select: { reportKey: true, sortOrder: true } },
  recipients: {
    select: {
      recipientUserId: true,
      recipient: { select: { email: true } },
    },
  },
} as const;

type RunOneOptions = {
  runWindowOverride?: string;
  advanceNextRunAt?: boolean;
  deliveryKind?: ScheduledReportDeliveryKind;
  recipientEmails?: Set<string> | null;
};

async function loadScheduledReportRow(
  tenantId: string,
  scheduleId: string,
): Promise<ScheduleRow | null> {
  const row = await prisma.scheduledReport.findFirst({
    where: { id: scheduleId, tenantId },
    select: scheduleSelect,
  });
  return row as ScheduleRow | null;
}

export async function runDueScheduledReportsForTenant(
  tenantId: string,
  buildAttachment: BuildScheduledReportAttachmentFn,
): Promise<ScheduledReportRunSummary[]> {
  const now = new Date();
  const due = await prisma.scheduledReport.findMany({
    where: {
      tenantId,
      status: "ACTIVE",
      nextRunAt: { lte: now },
      OR: [{ runLockUntil: null }, { runLockUntil: { lt: now } }],
    },
    orderBy: { nextRunAt: "asc" },
    take: DUE_BATCH_PER_TENANT,
    select: scheduleSelect,
  });

  const summaries: ScheduledReportRunSummary[] = [];
  for (const row of due) {
    summaries.push(await runOneScheduledReport(row as ScheduleRow, now, buildAttachment));
  }
  return summaries;
}

export async function runScheduledReportNow(
  ctx: ServiceContext,
  scheduleId: string,
  buildAttachment: BuildScheduledReportAttachmentFn,
): Promise<ScheduledReportRunSummary> {
  assertCanManageScheduledReports(ctx);
  const row = await loadScheduledReportRow(ctx.tenantId, scheduleId);
  if (!row) throw new ServiceError("NOT_FOUND", "Reporte programado no encontrado");
  if (row.status !== "ACTIVE") {
    throw new ServiceError("CONFLICT", "Solo se puede ejecutar un envío activo");
  }
  const now = new Date();
  return runOneScheduledReport(row, now, buildAttachment, {
    runWindowOverride: `manual:${now.toISOString()}`,
    advanceNextRunAt: false,
    deliveryKind: "manual",
  });
}

const RETRY_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;

export async function retryScheduledReportFailedDeliveries(
  ctx: ServiceContext,
  scheduleId: string,
  buildAttachment: BuildScheduledReportAttachmentFn,
): Promise<ScheduledReportRunSummary> {
  assertCanManageScheduledReports(ctx);
  const row = await loadScheduledReportRow(ctx.tenantId, scheduleId);
  if (!row) throw new ServiceError("NOT_FOUND", "Reporte programado no encontrado");
  if (row.status === "DELETED") {
    throw new ServiceError("CONFLICT", "No se puede reintentar un envío eliminado");
  }

  const since = new Date(Date.now() - RETRY_LOOKBACK_MS);
  const failedLogs = await prisma.emailDeliveryLog.findMany({
    where: {
      tenantId: ctx.tenantId,
      emailType: "REPORT_SCHEDULED",
      relatedEntityType: "SCHEDULED_REPORT",
      relatedEntityId: scheduleId,
      status: "FAILED",
      createdAt: { gte: since },
    },
    orderBy: { createdAt: "desc" },
    select: { recipientEmail: true },
  });

  const failedEmails = new Set(
    failedLogs.map((l) => l.recipientEmail.trim().toLowerCase()).filter(Boolean),
  );
  if (failedEmails.size === 0) {
    throw new ServiceError("VALIDATION", "No hay envíos fallidos recientes para reintentar");
  }

  const now = new Date();
  return runOneScheduledReport(row, now, buildAttachment, {
    runWindowOverride: `retry:${now.toISOString()}`,
    advanceNextRunAt: false,
    deliveryKind: "retry",
    recipientEmails: failedEmails,
  });
}

async function runOneScheduledReport(
  row: ScheduleRow,
  now: Date,
  buildAttachment: BuildScheduledReportAttachmentFn,
  options: RunOneOptions = {},
): Promise<ScheduledReportRunSummary> {
  const deliveryKind = options.deliveryKind ?? "scheduled";
  const recipientFilter = options.recipientEmails;
  const lockStatuses =
    deliveryKind === "scheduled" ? (["ACTIVE"] as const) : (["ACTIVE", "PAUSED"] as const);

  const lockUntil = new Date(now.getTime() + RUN_LOCK_MS);
  const locked = await prisma.scheduledReport.updateMany({
    where: {
      id: row.id,
      tenantId: row.tenantId,
      status: { in: [...lockStatuses] },
      OR: [{ runLockUntil: null }, { runLockUntil: { lt: now } }],
    },
    data: { runLockUntil: lockUntil },
  });

  if (locked.count === 0) {
    return {
      scheduleId: row.id,
      ok: true,
      runStatus: "LOCKED",
      recipientsSent: 0,
      recipientsSkipped: 0,
      recipientsFailed: 0,
      recipientsDuplicate: 0,
      attachmentErrors: [],
    };
  }

  const runWindow = options.runWindowOverride ?? row.nextRunAt.toISOString();
  const runId = randomUUID();
  const ctx = buildScheduledReportsCronServiceContext(row.tenantId, row.companyId);
  const params = paramsFromJson(row.params);
  const attachmentErrors: string[] = [];
  const attachments = [];

  for (const item of row.items) {
    try {
      const att = await buildAttachment(
        item.reportKey as ScheduledReportKey,
        row.format,
        row.projectId,
        params,
        ctx,
      );
      attachments.push(att);
    } catch (e) {
      const msg =
        e instanceof ServiceError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Error al generar adjunto";
      attachmentErrors.push(`${item.reportKey}: ${msg}`);
    }
  }

  let recipientsSent = 0;
  let recipientsSkipped = 0;
  let recipientsFailed = 0;
  let recipientsDuplicate = 0;

  if (attachments.length === 0) {
    await finalizeScheduledReportRun(row, runWindow, now, "FAILED", {
      recipientsSent,
      recipientsSkipped,
      recipientsFailed,
      recipientsDuplicate,
      attachmentErrors,
    }, options.advanceNextRunAt !== false);
    return {
      scheduleId: row.id,
      ok: false,
      runStatus: "FAILED",
      recipientsSent,
      recipientsSkipped,
      recipientsFailed,
      recipientsDuplicate,
      attachmentErrors,
    };
  }

  for (const rec of row.recipients) {
    const emailNorm = rec.recipient.email.trim().toLowerCase();
    if (recipientFilter && !recipientFilter.has(emailNorm)) continue;

    const result = await deliverScheduledReportBundle(
      {
        scheduleId: row.id,
        scheduleName: row.name,
        runWindow,
        runId,
        recipientUserId: rec.recipientUserId,
        recipientEmail: rec.recipient.email,
        attachments,
        deliveryKind,
      },
      ctx,
    );

    switch (result.outcome) {
      case "sent":
        recipientsSent += 1;
        break;
      case "skipped":
        recipientsSkipped += 1;
        break;
      case "failed":
        recipientsFailed += 1;
        break;
      case "duplicate":
        recipientsDuplicate += 1;
        break;
    }
  }

  if (recipientFilter) {
    const attempted = recipientsSent + recipientsSkipped + recipientsFailed + recipientsDuplicate;
    if (attempted === 0) {
      await prisma.scheduledReport.update({
        where: { id: row.id, tenantId: row.tenantId },
        data: { runLockUntil: null },
      });
      throw new ServiceError(
        "VALIDATION",
        "Ningún destinatario fallido coincide con la configuración actual",
      );
    }
  }

  let runStatus: ScheduledReportRunStatus;
  if (recipientsFailed > 0 && recipientsSent === 0) {
    runStatus = "FAILED";
  } else if (attachmentErrors.length > 0 || recipientsFailed > 0) {
    runStatus = "PARTIAL";
  } else if (recipientsSkipped > 0 && recipientsSent === 0 && recipientsDuplicate === 0) {
    runStatus = "SKIPPED";
  } else {
    runStatus = "SUCCESS";
  }

  await finalizeScheduledReportRun(
    row,
    runWindow,
    now,
    runStatus,
    {
      recipientsSent,
      recipientsSkipped,
      recipientsFailed,
      recipientsDuplicate,
      attachmentErrors,
    },
    options.advanceNextRunAt !== false,
  );

  return {
    scheduleId: row.id,
    ok: runStatus !== "FAILED",
    runStatus,
    recipientsSent,
    recipientsSkipped,
    recipientsFailed,
    recipientsDuplicate,
    attachmentErrors,
  };
}

async function finalizeScheduledReportRun(
  row: ScheduleRow,
  _runWindow: string,
  after: Date,
  runStatus: ScheduledReportRunStatus,
  _stats: {
    recipientsSent: number;
    recipientsSkipped: number;
    recipientsFailed: number;
    recipientsDuplicate: number;
    attachmentErrors: string[];
  },
  advanceNextRunAt: boolean,
): Promise<void> {
  const nextRunAt = advanceNextRunAt
    ? calculateNextRunAt({
        frequency: row.frequency,
        timeOfDay: row.timeOfDay,
        timezone: row.timezone,
        dayOfWeek: row.dayOfWeek,
        dayOfMonth: row.dayOfMonth,
        after,
      })
    : undefined;

  await prisma.scheduledReport.update({
    where: { id: row.id, tenantId: row.tenantId },
    data: {
      runLockUntil: null,
      lastRunAt: after,
      lastRunStatus: runStatus,
      ...(nextRunAt ? { nextRunAt } : {}),
    },
  });
}
