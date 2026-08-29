import { prisma } from "@bloqer/database";
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
import { loadNotificationIdentityFacts } from "../notifications/notification-email-context";
import { ServiceContext } from "../types";
import type { ScheduledReportAttachment } from "./scheduled-report-attachment.service";

export type ScheduledReportDeliveryKind = "scheduled" | "manual" | "retry";

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

/** Prefer the schedule slot instant encoded in runWindow over wall-clock `now` (late cron / retries). */
function asOfFromRunWindow(
  runWindow: string,
  deliveryKind: ScheduledReportDeliveryKind,
): Date {
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
  const idempotencyKey = buildScheduledReportIdempotencyKey(
    input.scheduleId,
    input.runWindow,
    input.recipientEmail,
    deliveryKind,
  );

  if (await hasScheduledReportBundleBeenSent(ctx.tenantId, idempotencyKey)) {
    return { outcome: "duplicate" };
  }

  const dateLabel = toIsoDateInTimeZone(
    asOfFromRunWindow(input.runWindow, deliveryKind),
    input.timezone?.trim() || PRODUCT_TIMEZONE,
  );
  const facts = await loadNotificationIdentityFacts({
    tenantId: ctx.tenantId,
    companyId: ctx.companyId,
    projectId: input.projectId ?? null,
  });
  const subject = formatNotificationEmailSubject(
    `${input.scheduleName} (${dateLabel})`,
    facts.organizationName,
  );

  const { id: logId } = await createEmailDeliveryLog(
    {
      recipientEmail: input.recipientEmail,
      recipientUserId: input.recipientUserId,
      subject,
      emailType: "REPORT_SCHEDULED",
      relatedEntityType: "SCHEDULED_REPORT",
      relatedEntityId: input.scheduleId,
      reportFormat: input.attachments.some((a) => a.contentType.includes("pdf"))
        ? "pdf"
        : input.attachments[0]
          ? "csv"
          : null,
      idempotencyKey,
      metadata: {
        runId: input.runId,
        runWindow: input.runWindow,
        deliveryKind: deliveryKind,
        attachmentCount: input.attachments.length,
        reportKeys: input.attachments.map((a) => a.reportKey).join(","),
      },
    },
    ctx,
  );

  if (!isEmailConfigured()) {
    await markEmailDeliverySkipped(logId, "email_not_configured", ctx);
    return { outcome: "skipped", reason: "email_not_configured" };
  }

  const templateInput = {
    title: input.scheduleName,
    body: `Envío programado. Adjuntamos ${input.attachments.length} reporte(s).`,
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
      { label: "Archivos", value: String(input.attachments.length) },
    ],
    items: input.attachments.map((a) => a.filename),
    itemsHeading: "Adjuntos",
  };
  const html = renderNotificationEmailHtml(templateInput);
  const text = renderNotificationEmailText(templateInput);

  const sendResult = await sendEmail({
    to: input.recipientEmail,
    subject,
    html,
    text,
    attachments: input.attachments.map((a) => ({
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
