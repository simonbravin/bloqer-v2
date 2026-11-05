import { prisma } from "@bloqer/database";
import type { PermissionModule } from "@bloqer/domain";
import { isEmailConfigured } from "@bloqer/config";
import {
  sendEmail,
  formatNotificationEmailSubject,
  renderNotificationEmailHtml,
  renderNotificationEmailText,
} from "@bloqer/email";
import {
  createEmailDeliveryLog,
  markEmailDeliveryFailed,
  markEmailDeliverySent,
  markEmailDeliverySkipped,
} from "../email-delivery/email-delivery-log.service";
import { PRODUCT_TIMEZONE, toIsoDateInTimeZone } from "@bloqer/utils";
import { getSoleActiveCompanyIdForTenant } from "../company/company.service";
import { canViewJobsiteLogArea } from "../jobsite-log/jobsite-log-access";
import { loadNotificationIdentityFacts } from "../notifications/notification-email-context";
import {
  filterUserIdsByProjectAccess,
  requireProjectAccess,
  resolveAccessibleProjectScope,
  type ProjectAccessScope,
} from "../security/access";
import { getTenantEnabledModules } from "../tenant-modules/tenant-module.service";
import { ServiceContext, ServiceError } from "../types";
import type { ScheduledReportAttachment } from "./scheduled-report-attachment.service";

export type ScheduledReportDeliveryKind = "scheduled" | "manual" | "retry";

export type ScheduledReportRecipientAccess = Pick<ServiceContext, "companyId" | "roles"> & {
  email: string;
};

export async function loadScheduledReportRecipientAccess(
  tenantId: string,
  userId: string,
): Promise<ScheduledReportRecipientAccess | null> {
  const membership = await prisma.userMembership.findUnique({
    where: { userId_tenantId: { userId, tenantId } },
    select: {
      status: true,
      roles: true,
      companyId: true,
      company: { select: { tenantId: true, status: true } },
      user: { select: { email: true, status: true } },
    },
  });
  if (
    membership?.status !== "ACTIVE" || membership.user.status !== "ACTIVE" ||
    (membership.companyId &&
      (membership.company?.status !== "ACTIVE" || membership.company.tenantId !== tenantId))
  ) return null;
  return {
    companyId: membership.companyId ?? await getSoleActiveCompanyIdForTenant(tenantId),
    roles: membership.roles,
    email: membership.user.email,
  };
}

function sameRecipientAccess(
  previous: ScheduledReportRecipientAccess,
  current: ScheduledReportRecipientAccess,
): boolean {
  return previous.companyId === current.companyId && previous.email === current.email &&
    previous.roles.length === current.roles.length && previous.roles.every((role) => current.roles.includes(role));
}

export function buildScheduledReportIdempotencyKey(
  scheduleId: string,
  runWindow: string,
  recipientEmail: string,
  kind: ScheduledReportDeliveryKind = "scheduled",
): string {
  const prefix =
    kind === "manual" ? "scheduled-manual" : kind === "retry" ? "scheduled-retry" : "scheduled";
  return `${prefix}:${scheduleId}:${runWindow}:${recipientEmail.trim().toLowerCase()}`;
}

export async function hasScheduledReportBundleBeenSent(
  tenantId: string,
  idempotencyKey: string,
): Promise<boolean> {
  const row = await prisma.emailDeliveryLog.findFirst({
    where: {
      tenantId,
      idempotencyKey,
      emailType: "REPORT_SCHEDULED",
      status: "SENT",
    },
    select: { id: true },
  });
  return Boolean(row);
}

export type DeliverScheduledReportBundleInput = {
  scheduleId: string;
  scheduleName: string;
  runWindow: string;
  runId: string;
  recipientUserId: string;
  recipientEmail: string;
  recipientAccess: ScheduledReportRecipientAccess | null;
  generatedWithModules: ReadonlySet<PermissionModule>;
  generatedWithProjectScope?: ProjectAccessScope;
  reportCompanyId?: string | null;
  attachments: ScheduledReportAttachment[];
  deliveryKind?: ScheduledReportDeliveryKind;
  projectId?: string | null;
  timezone?: string | null;
};

export type DeliverScheduledReportBundleResult =
  | { outcome: "sent"; messageId?: string }
  | { outcome: "skipped"; reason: string }
  | { outcome: "failed"; error: string }
  | { outcome: "duplicate" };

type JobsiteAttachmentAudience = ReadonlyMap<ScheduledReportAttachment, ReadonlySet<string>>;

/** Share each company/project ACL lookup across parts and recipients in the same run. */
export async function resolveScheduledJobsiteAttachmentAudience(
  tenantId: string,
  attachments: ScheduledReportAttachment[],
  recipientIds: string[],
): Promise<JobsiteAttachmentAudience> {
  const audienceByScope = new Map<string, Promise<Set<string>>>();
  const entries = await Promise.all(
    attachments.flatMap((attachment) => {
      const scope = attachment.jobsiteScope;
      if (
        attachment.reportKey !== "TENANT_JOBSITE_DAILY_LOGS" ||
        !scope?.projectId ||
        !scope.companyId
      )
        return [];
      const key = `${scope.projectId}/${scope.companyId}`;
      let audience = audienceByScope.get(key);
      if (!audience) {
        audience = filterUserIdsByProjectAccess(tenantId, scope.projectId, recipientIds, {
          companyId: scope.companyId,
          canView: canViewJobsiteLogArea,
        }).then((userIds) => new Set(userIds));
        audienceByScope.set(key, audience);
      }
      return [audience.then((userIds) => [attachment, userIds] as const)];
    }),
  );
  return new Map(entries);
}

/** Prefer the schedule slot instant encoded in runWindow over wall-clock `now` (late cron / retries). */
function asOfFromRunWindow(runWindow: string, deliveryKind: ScheduledReportDeliveryKind): Date {
  if (deliveryKind === "scheduled") {
    const d = new Date(runWindow);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const prefixed = runWindow.match(/^(?:manual|retry):(.+)$/);
  if (prefixed?.[1]) {
    const d = new Date(prefixed[1]);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const fallback = new Date(runWindow);
  if (!Number.isNaN(fallback.getTime())) return fallback;
  return new Date();
}

export async function deliverScheduledReportBundle(
  input: DeliverScheduledReportBundleInput,
  ctx: ServiceContext,
): Promise<DeliverScheduledReportBundleResult> {
  const deliveryKind = input.deliveryKind ?? "scheduled";
  const currentAccess = input.recipientAccess
    ? await loadScheduledReportRecipientAccess(ctx.tenantId, input.recipientUserId)
    : null;
  const recipientEmail = currentAccess?.email ?? input.recipientEmail;
  const idempotencyKey = buildScheduledReportIdempotencyKey(
    input.scheduleId,
    input.runWindow,
    recipientEmail,
    deliveryKind,
  );

  if (await hasScheduledReportBundleBeenSent(ctx.tenantId, idempotencyKey)) {
    return { outcome: "duplicate" };
  }

  const dateLabel = toIsoDateInTimeZone(
    asOfFromRunWindow(input.runWindow, deliveryKind),
    input.timezone?.trim() || PRODUCT_TIMEZONE,
  );
  const companyId = currentAccess?.companyId && ctx.companyId !== currentAccess.companyId
    ? null
    : ctx.companyId;
  const facts = await loadNotificationIdentityFacts({
    tenantId: ctx.tenantId,
    companyId,
    projectId: input.projectId ?? null,
  });
  const subject = formatNotificationEmailSubject(
    `${input.scheduleName} (${dateLabel})`,
    facts.organizationName,
  );

  const attachments = currentAccess && input.recipientAccess && currentAccess.roles.length > 0 &&
    sameRecipientAccess(input.recipientAccess, currentAccess)
    ? await revalidateRecipientAttachments(input, ctx.tenantId, currentAccess)
    : [];
  const skipReason =
    currentAccess === null
      ? "recipient_inactive"
      : attachments.length === 0
        ? "no_authorized_attachments"
        : null;
  const { id: logId } = await createEmailDeliveryLog(
    {
      recipientEmail,
      recipientUserId: input.recipientUserId,
      subject,
      emailType: "REPORT_SCHEDULED",
      ...(skipReason ? { status: "SKIPPED", skippedReason: skipReason } : {}),
      relatedEntityType: "SCHEDULED_REPORT",
      relatedEntityId: input.scheduleId,
      reportFormat: attachments.some((a) => a.contentType.includes("pdf"))
        ? "pdf"
        : attachments[0]
          ? "csv"
          : null,
      idempotencyKey,
      metadata: {
        runId: input.runId,
        runWindow: input.runWindow,
        deliveryKind: deliveryKind,
        attachmentCount: attachments.length,
        reportKeys: attachments.map((a) => a.reportKey).join(","),
      },
    },
    ctx,
  );

  if (skipReason) return { outcome: "skipped", reason: skipReason };

  if (!isEmailConfigured()) {
    await markEmailDeliverySkipped(logId, "email_not_configured", ctx);
    return { outcome: "skipped", reason: "email_not_configured" };
  }

  const templateInput = {
    title: input.scheduleName,
    body: `Envío programado. Adjuntamos ${attachments.length} reporte(s).`,
    actionUrlAbsolute: null as string | null,
    organizationName: facts.organizationName,
    contextFields: [
      ...(facts.organizationName ? [{ label: "Organización", value: facts.organizationName }] : []),
      ...(facts.companyName && facts.companyName !== facts.organizationName
        ? [{ label: "Empresa", value: facts.companyName }]
        : []),
      ...(facts.projectLabel ? [{ label: "Proyecto", value: facts.projectLabel }] : []),
      { label: "Programa", value: input.scheduleName },
      { label: "Fecha", value: dateLabel },
      { label: "Archivos", value: String(attachments.length) },
    ],
    items: attachments.map((a) => a.filename),
    itemsHeading: "Adjuntos",
  };
  const html = renderNotificationEmailHtml(templateInput);
  const text = renderNotificationEmailText(templateInput);

  const sendResult = await sendEmail({
    to: recipientEmail,
    subject,
    html,
    text,
    attachments: attachments.map((a) => ({
      filename: a.filename,
      content: a.content,
      contentType: a.contentType,
    })),
  });

  if (!sendResult.ok) {
    await markEmailDeliveryFailed(logId, sendResult.error ?? "send_failed", ctx, "RESEND");
    return { outcome: "failed", error: sendResult.error ?? "send_failed" };
  }

  if (sendResult.provider === "disabled") {
    await markEmailDeliverySkipped(logId, "email_not_configured", ctx);
    return { outcome: "skipped", reason: "email_not_configured" };
  }

  await markEmailDeliverySent(logId, sendResult.messageId, ctx);
  return { outcome: "sent", messageId: sendResult.messageId };
}

async function revalidateRecipientAttachments(
  input: DeliverScheduledReportBundleInput,
  tenantId: string,
  access: ScheduledReportRecipientAccess,
): Promise<ScheduledReportAttachment[]> {
  if (input.attachments.length === 0) return [];
  const ctx: ServiceContext = {
    tenantId,
    actorUserId: input.recipientUserId,
    companyId: input.reportCompanyId === undefined ? access.companyId : input.reportCompanyId,
    roles: access.roles,
  };
  if (input.projectId) {
    try {
      await requireProjectAccess(input.projectId, ctx);
    } catch (error) {
      if (!(error instanceof ServiceError) || !["FORBIDDEN", "NOT_FOUND"].includes(error.code)) throw error;
      return [];
    }
  }
  if (input.generatedWithProjectScope) {
    const currentScope = await resolveAccessibleProjectScope(ctx);
    if (currentScope !== "ALL") {
      const currentIds = new Set(currentScope.projectIds);
      if (input.generatedWithProjectScope === "ALL" ||
        !input.generatedWithProjectScope.projectIds.every((id) => currentIds.has(id))) return [];
    }
  }
  const jobsiteAudience = await resolveScheduledJobsiteAttachmentAudience(tenantId, input.attachments, [input.recipientUserId]);
  const enabledModules = await getTenantEnabledModules(ctx);
  // Optional report sections also use module gates, so a changed gate can affect an entire rendered file.
  if ([...input.generatedWithModules].some((module) => !enabledModules.has(module))) return [];
  return input.attachments.filter((attachment) => attachment.reportKey !== "TENANT_JOBSITE_DAILY_LOGS" ||
    jobsiteAudience.get(attachment)?.has(input.recipientUserId),
  );
}
