import { prisma } from "@bloqer/database";
import type { ScheduledReportRunStatus } from "@bloqer/database";
import type { ScheduledReportKey } from "@bloqer/validators";
import { randomUUID } from "crypto";
import {
  hasTenantWideProjectAccess,
  requireProjectAccess,
  resolveAccessibleProjectScope,
  type ProjectAccessScope,
} from "../security/access";
import { getTenantEnabledModules } from "../tenant-modules/tenant-module.service";
import { ServiceContext, ServiceError } from "../types";
import { calculateNextRunAt, calendarDateInTimezone } from "./scheduling";
import { assertCanManageScheduledReports } from "./scheduled-report-permissions";
import {
  assertActiveJobsiteProjectsForSchedule,
  scheduledReportWhereForContext,
} from "./scheduled-report.service";
import { buildScheduledReportsCronServiceContext } from "./scheduled-report-cron-context";
import type { BuildScheduledReportAttachmentFn } from "./scheduled-report-attachment.service";
import { isPartialScheduledAttachmentsError } from "./scheduled-report-attachment.service";
import {
  deliverScheduledReportBundle,
  loadScheduledReportRecipientAccess,
  type ScheduledReportDeliveryKind,
  type ScheduledReportRecipientAccess,
} from "./scheduled-report-delivery.service";
import { listPendingScheduledReportRetries } from "./scheduled-report-execution.service";
import { deriveScheduledReportRunStatus } from "./scheduled-report-run-status";

const RUN_LOCK_MS = 10 * 60 * 1000;
const DUE_BATCH_PER_TENANT = 25;
const JOBSITE_DAILY_REPORT = "TENANT_JOBSITE_DAILY_LOGS";
const TENANT_WIDE_TREASURY_REPORTS = new Set<string>([
  "TENANT_TREASURY_CASH_POSITION",
  "TENANT_TREASURY_MOVEMENTS",
  "TENANT_TREASURY_CASH_FLOW",
]);

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
  updatedAt: Date;
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
  updatedAt: true,
  items: { orderBy: { sortOrder: "asc" as const }, select: { reportKey: true, sortOrder: true } },
  recipients: {
    select: {
      recipientUserId: true,
      recipient: { select: { email: true } },
    },
  },
} as const;

type RunBatch = {
  runWindow: string;
  originalDate: Date;
  recipients: ScheduleRow["recipients"];
};

type RunOneOptions = {
  deliveryKind?: ScheduledReportDeliveryKind;
  executionContext?: ServiceContext;
  retryBatches?: RunBatch[];
};

function emptyRunCounts() {
  return { recipientsSent: 0, recipientsSkipped: 0, recipientsFailed: 0, recipientsDuplicate: 0 };
}

async function loadManualExecution(ctx: ServiceContext, scheduleId: string) {
  const row = await prisma.scheduledReport.findFirst({
    where: { ...(await scheduledReportWhereForContext(ctx)), id: scheduleId },
    select: scheduleSelect,
  });
  if (!row) throw new ServiceError("NOT_FOUND", "Reporte programado no encontrado");
  const executionContext = { ...ctx, companyId: row.companyId ?? ctx.companyId };
  await assertActiveJobsiteProjectsForSchedule(
    row.items,
    paramsFromJson(row.params),
    executionContext,
  );
  return { row, executionContext };
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
      OR: [{ runLockUntil: null }, { runLockUntil: { lte: now } }],
    },
    orderBy: { nextRunAt: "asc" },
    take: DUE_BATCH_PER_TENANT,
    select: scheduleSelect,
  });

  const summaries: ScheduledReportRunSummary[] = [];
  for (const row of due) {
    try {
      summaries.push(await runOneScheduledReport(row, new Date(), buildAttachment));
    } catch (error) {
      summaries.push({
        scheduleId: row.id,
        ok: false,
        runStatus: "FAILED",
        ...emptyRunCounts(),
        attachmentErrors: [error instanceof Error ? error.message : "Error al ejecutar el envío"],
      });
    }
  }
  return summaries;
}

export async function runScheduledReportNow(
  ctx: ServiceContext,
  scheduleId: string,
  buildAttachment: BuildScheduledReportAttachmentFn,
): Promise<ScheduledReportRunSummary> {
  assertCanManageScheduledReports(ctx);
  const { row, executionContext } = await loadManualExecution(ctx, scheduleId);
  if (row.status !== "ACTIVE") {
    throw new ServiceError("CONFLICT", "Solo se puede ejecutar un envío activo");
  }
  if (row.recipients.length === 0) {
    throw new ServiceError("VALIDATION", "El envío no tiene destinatarios");
  }
  const now = new Date();
  const summary = await runOneScheduledReport(row, now, buildAttachment, {
    executionContext,
    deliveryKind: "manual",
  });
  if (summary.runStatus === "LOCKED") {
    throw new ServiceError("CONFLICT", "Hay otra ejecución en curso. Reintentá en unos minutos.");
  }
  return summary;
}

export async function retryScheduledReportFailedDeliveries(
  ctx: ServiceContext,
  scheduleId: string,
  buildAttachment: BuildScheduledReportAttachmentFn,
): Promise<ScheduledReportRunSummary> {
  assertCanManageScheduledReports(ctx);
  const { row, executionContext } = await loadManualExecution(ctx, scheduleId);
  if (row.status === "DELETED") {
    throw new ServiceError("CONFLICT", "No se puede reintentar un envío eliminado");
  }

  const pending = await listPendingScheduledReportRetries(
    executionContext,
    scheduleId,
    row.recipients.map(({ recipientUserId }) => recipientUserId),
  );
  if (pending.length === 0) {
    throw new ServiceError("VALIDATION", "No hay envíos fallidos recientes para reintentar");
  }

  const now = new Date();
  const summary = await runOneScheduledReport(row, now, buildAttachment, {
    executionContext,
    deliveryKind: "retry",
    retryBatches: pending.map(({ runWindow, originalDate, recipientIds }) => ({
      runWindow,
      originalDate,
      recipients: row.recipients.filter(({ recipientUserId }) => recipientIds.has(recipientUserId)),
    })),
  });
  if (summary.runStatus === "LOCKED") {
    throw new ServiceError("CONFLICT", "Hay otra ejecución en curso. Reintentá en unos minutos.");
  }
  return summary;
}

async function runOneScheduledReport(
  row: ScheduleRow,
  now: Date,
  buildAttachment: BuildScheduledReportAttachmentFn,
  options: RunOneOptions = {},
): Promise<ScheduledReportRunSummary> {
  const deliveryKind = options.deliveryKind ?? "scheduled";
  const lockStatuses =
    deliveryKind === "retry" ? (["ACTIVE", "PAUSED"] as const) : (["ACTIVE"] as const);

  const lockUntil = new Date(now.getTime() + RUN_LOCK_MS);
  const ownedLockWhere = { id: row.id, tenantId: row.tenantId, runLockUntil: lockUntil };
  const locked = await prisma.scheduledReport.updateMany({
    where: {
      id: row.id,
      tenantId: row.tenantId,
      updatedAt: row.updatedAt,
      status: { in: [...lockStatuses] },
      ...(deliveryKind === "scheduled" ? { nextRunAt: { lte: now } } : {}),
      OR: [{ runLockUntil: null }, { runLockUntil: { lte: now } }],
    },
    data: { runLockUntil: lockUntil },
  });

  if (locked.count === 0) {
    return {
      scheduleId: row.id,
      ok: false,
      runStatus: "LOCKED",
      ...emptyRunCounts(),
      attachmentErrors: [],
    };
  }

  let finalized = false;
  try {
    const ctx =
      options.executionContext ??
      buildScheduledReportsCronServiceContext(row.tenantId, row.companyId);
    const batches = options.retryBatches ?? [{
      runWindow: deliveryKind === "manual" ? `manual:${now.toISOString()}` : row.nextRunAt.toISOString(),
      originalDate: deliveryKind === "manual" ? now : row.nextRunAt,
      recipients: row.recipients,
    }];
    const counts = emptyRunCounts();
    const attachmentErrors = new Set<string>();
    const jobsiteItems = row.items.filter(({ reportKey }) => reportKey === JOBSITE_DAILY_REPORT);
    const otherItems = row.items.filter(({ reportKey }) => reportKey !== JOBSITE_DAILY_REPORT);
    let hasAttachments = false;
    for (const batch of batches) {
      assertRunLeaseActive(lockUntil);
      const runId = randomUUID();
      const generatedWithModules = await getTenantEnabledModules(ctx);
      const jobsiteBundle = await buildRunBundle(row, jobsiteItems, batch.originalDate, ctx, buildAttachment);
      for (const error of jobsiteBundle.attachmentErrors) attachmentErrors.add(error);

      for (const recipient of batch.recipients) {
        assertRunLeaseActive(lockUntil);
        const access = await loadScheduledReportRecipientAccess(ctx.tenantId, recipient.recipientUserId);
        const recipientBundle: RecipientBundle = access?.roles.length && otherItems.length > 0
          ? await buildRecipientBundle(row, otherItems, batch.originalDate, ctx, recipient.recipientUserId, access, buildAttachment)
          : { attachments: [], attachmentErrors: [] };
        for (const error of recipientBundle.attachmentErrors) attachmentErrors.add(error);
        const attachments = [...jobsiteBundle.attachments, ...recipientBundle.attachments];
        hasAttachments ||= attachments.length > 0;
        assertRunLeaseActive(lockUntil);
        const result = await deliverScheduledReportBundle(
          {
            scheduleId: row.id,
            scheduleName: row.name,
            runWindow: batch.runWindow,
            runId,
            recipientUserId: recipient.recipientUserId,
            recipientEmail: recipient.recipient.email,
            recipientAccess: access,
            generatedWithModules,
            generatedWithProjectScope: recipientBundle.generatedWithProjectScope,
            reportCompanyId: recipientBundle.reportCompanyId,
            attachments,
            deliveryKind,
            projectId: row.projectId,
            timezone: row.timezone,
          },
          ctx,
        );
        switch (result.outcome) {
          case "sent":
            counts.recipientsSent += 1;
            break;
          case "skipped":
            counts.recipientsSkipped += 1;
            break;
          case "failed":
            counts.recipientsFailed += 1;
            break;
          case "duplicate":
            counts.recipientsDuplicate += 1;
            break;
        }
      }
    }

    const runStatus = !hasAttachments && attachmentErrors.size > 0
      ? "FAILED"
      : deriveScheduledReportRunStatus({ ...counts, attachmentErrorCount: attachmentErrors.size });

    await finalizeScheduledReportRun(
      row,
      lockUntil,
      now,
      runStatus,
      deliveryKind === "scheduled",
    );
    finalized = true;

    return {
      scheduleId: row.id,
      ok: runStatus !== "FAILED",
      runStatus,
      ...counts,
      attachmentErrors: [...attachmentErrors],
    };
  } finally {
    if (!finalized) {
      await prisma.scheduledReport
        .updateMany({
          where: ownedLockWhere,
          data: { runLockUntil: null },
        })
        .catch(() => undefined);
    }
  }
}

function assertRunLeaseActive(lockUntil: Date): void {
  if (Date.now() >= lockUntil.getTime()) {
    throw new ServiceError("CONFLICT", "La ejecución perdió el bloqueo. Volvé a intentar.");
  }
}

type RecipientBundle = Awaited<ReturnType<typeof buildRunBundle>> & {
  generatedWithProjectScope?: ProjectAccessScope;
  reportCompanyId?: string | null;
};

async function buildRecipientBundle(
  row: ScheduleRow,
  items: ScheduleRow["items"],
  originalDate: Date,
  executionContext: ServiceContext,
  userId: string,
  access: ScheduledReportRecipientAccess,
  buildAttachment: BuildScheduledReportAttachmentFn,
): Promise<RecipientBundle> {
  const otherCompany = executionContext.companyId !== null && access.companyId !== null &&
    executionContext.companyId !== access.companyId;
  // Corporate Treasury is tenant-wide. Other reports must stay in the company
  // authorized by both the schedule/operator and the recipient.
  const allowedItems = otherCompany
    ? items.filter(({ reportKey }) => TENANT_WIDE_TREASURY_REPORTS.has(reportKey))
    : items;
  const recipientContext: ServiceContext = {
    tenantId: executionContext.tenantId,
    actorUserId: userId,
    companyId: otherCompany ? access.companyId : executionContext.companyId ?? access.companyId,
    roles: access.roles,
  };
  if (row.projectId && allowedItems.length > 0) {
    try {
      await requireProjectAccess(row.projectId, recipientContext);
    } catch (error) {
      if (!(error instanceof ServiceError) || !["FORBIDDEN", "NOT_FOUND"].includes(error.code)) throw error;
      return { attachments: [], attachmentErrors: [] };
    }
  }
  const generatedWithProjectScope = !row.projectId &&
    !hasTenantWideProjectAccess(recipientContext.roles) &&
    allowedItems.some(({ reportKey }) => !TENANT_WIDE_TREASURY_REPORTS.has(reportKey))
    ? await resolveAccessibleProjectScope(recipientContext)
    : undefined;
  return {
    ...await buildRunBundle(row, allowedItems, originalDate, recipientContext, buildAttachment),
    generatedWithProjectScope,
    reportCompanyId: recipientContext.companyId,
  };
}

async function buildRunBundle(
  row: ScheduleRow,
  items: ScheduleRow["items"],
  originalDate: Date,
  ctx: ServiceContext,
  buildAttachment: BuildScheduledReportAttachmentFn,
) {
  const params = paramsFromJson(row.params);
  const attachments: Awaited<ReturnType<BuildScheduledReportAttachmentFn>> = [];
  const attachmentErrors: string[] = [];
  for (const item of items) {
    try {
      const runParams = item.reportKey === JOBSITE_DAILY_REPORT
        ? { ...(params ?? {}), runLogDate: calendarDateInTimezone(originalDate, row.timezone) }
        : params;
      attachments.push(...await buildAttachment(
        item.reportKey as ScheduledReportKey, row.format, row.projectId, runParams, ctx,
      ));
    } catch (error) {
      if (error instanceof ServiceError && error.code === "FORBIDDEN") {
        continue;
      } else if (isPartialScheduledAttachmentsError(error)) {
        attachments.push(...error.attachments);
        attachmentErrors.push(...error.itemErrors);
      } else {
        const message = error instanceof Error ? error.message : "Error al generar adjunto";
        attachmentErrors.push(`${item.reportKey}: ${message}`);
      }
    }
  }
  return { attachments, attachmentErrors };
}

async function finalizeScheduledReportRun(
  row: ScheduleRow,
  lockUntil: Date,
  after: Date,
  runStatus: ScheduledReportRunStatus,
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

  const finished = await prisma.scheduledReport.updateMany({
    where: { id: row.id, tenantId: row.tenantId, runLockUntil: { equals: lockUntil, gt: new Date() } },
    data: {
      runLockUntil: null,
      lastRunAt: after,
      lastRunStatus: runStatus,
      ...(nextRunAt ? { nextRunAt } : {}),
    },
  });
  if (finished.count !== 1) {
    throw new ServiceError("CONFLICT", "La ejecución perdió el bloqueo. Volvé a intentar.");
  }
}
