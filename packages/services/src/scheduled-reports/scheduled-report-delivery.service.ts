import { prisma } from "@bloqer/database";
import { isEmailConfigured } from "@bloqer/config";
import { sendEmail, escapeHtml } from "@bloqer/email";
import {
  createEmailDeliveryLog,
  markEmailDeliveryFailed,
  markEmailDeliverySent,
  markEmailDeliverySkipped,
} from "../email-delivery/email-delivery-log.service";
import { ServiceContext } from "../types";
import type { ScheduledReportAttachment } from "./scheduled-report-attachment.service";

function sanitizeEmailSubject(s: string): string {
  return s.replace(/[\r\n\u2028\u2029]+/g, " ").trim().slice(0, 998);
}

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
};

export type DeliverScheduledReportBundleResult =
  | { outcome: "sent"; messageId?: string }
  | { outcome: "skipped"; reason: string }
  | { outcome: "failed"; error: string }
  | { outcome: "duplicate" };

export async function deliverScheduledReportBundle(
  input: DeliverScheduledReportBundleInput,
  ctx: ServiceContext,
): Promise<DeliverScheduledReportBundleResult> {
  const idempotencyKey = buildScheduledReportIdempotencyKey(
    input.scheduleId,
    input.runWindow,
    input.recipientEmail,
    input.deliveryKind ?? "scheduled",
  );

  if (await hasScheduledReportBundleBeenSent(ctx.tenantId, idempotencyKey)) {
    return { outcome: "duplicate" };
  }

  const dateLabel = new Date().toISOString().slice(0, 10);
  const subject = sanitizeEmailSubject(`Bloqer — ${input.scheduleName} (${dateLabel})`);

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
        deliveryKind: input.deliveryKind ?? "scheduled",
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

  const html = `<!DOCTYPE html><html><body><p>${escapeHtml(
    `Envío programado: ${input.scheduleName}. Adjuntamos ${input.attachments.length} reporte(s).`,
  )}</p><p style="font-size:12px;color:#666">Generado desde Bloqer. No respondas a este correo automático.</p></body></html>`;
  const text = `Envío programado: ${input.scheduleName}. Adjuntamos ${input.attachments.length} reporte(s).\n\n— Bloqer`;

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
