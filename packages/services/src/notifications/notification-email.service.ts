import type {
  NotificationSeverity,
  NotificationStatus,
  NotificationType,
  EmailDeliveryType,
  LinkedEntityType,
} from "@bloqer/database";
import { prisma } from "@bloqer/database";
import { getPublicAppBaseUrl, isEmailConfigured } from "@bloqer/config";
import {
  sendEmail,
  renderNotificationEmailHtml,
  renderNotificationEmailText,
  renderOperationalAlertEmailHtml,
  renderOperationalAlertEmailText,
  type EmailSendResult,
  type OperationalAlertSeverityLabel,
} from "@bloqer/email";
import {
  createEmailDeliveryLog,
  markEmailDeliveryFailed,
  markEmailDeliverySent,
  markEmailDeliverySkipped,
} from "../email-delivery/email-delivery-log.service";
import { ServiceContext, ServiceError } from "../types";
import { canRunOperationalAlerts } from "./operational-alerts-runner.service";
import { OPERATIONAL_NOTIFICATION_TYPES } from "./operational-alerts.service";

const OPERATIONAL_NOTIFICATION_TYPE_SET: ReadonlySet<NotificationType> = new Set(
  OPERATIONAL_NOTIFICATION_TYPES,
);

const SKIP_LOG_PLACEHOLDER_EMAIL = "skipped@internal.bloqer";

function canDispatchNotificationEmail(ctx: ServiceContext, recipientUserId: string): boolean {
  if (ctx.actorUserId === recipientUserId) return true;
  return canRunOperationalAlerts(ctx);
}

function severityToLabel(s: NotificationSeverity): OperationalAlertSeverityLabel {
  return s as OperationalAlertSeverityLabel;
}

export type SendNotificationEmailResult = {
  ok: boolean;
  skipped?:
    | "email_disabled"
    | "no_recipient_email"
    | "archived"
    | "invalid_status"
    | "recipient_not_in_tenant";
  provider?: EmailSendResult["provider"];
  messageId?: string;
  error?: string;
};

type NotificationRow = {
  id: string;
  tenantId: string;
  companyId: string | null;
  recipientUserId: string | null;
  status: NotificationStatus;
  type: NotificationType;
  title: string;
  body: string;
  severity: NotificationSeverity;
  actionUrl: string | null;
  linkedEntityType: LinkedEntityType | null;
  linkedEntityId: string | null;
};

async function loadNotification(notificationId: string, tenantId: string): Promise<NotificationRow | null> {
  return prisma.notification.findFirst({
    where: { id: notificationId, tenantId },
    select: {
      id: true,
      tenantId: true,
      companyId: true,
      recipientUserId: true,
      status: true,
      type: true,
      title: true,
      body: true,
      severity: true,
      actionUrl: true,
      linkedEntityType: true,
      linkedEntityId: true,
    },
  });
}

async function assertRecipientActiveInTenant(recipientUserId: string, tenantId: string): Promise<boolean> {
  const m = await prisma.userMembership.findFirst({
    where: { userId: recipientUserId, tenantId, status: "ACTIVE" },
    select: { id: true },
  });
  return Boolean(m);
}

/** Mitigate SMTP header injection when notification title is used as Subject. */
function sanitizeEmailSubject(title: string): string {
  return title.replace(/[\r\n\u2028\u2029]+/g, " ").trim().slice(0, 998);
}

async function logNotificationEmailSkipped(
  ctx: ServiceContext,
  emailType: EmailDeliveryType,
  n: Pick<
    NotificationRow,
    "recipientUserId" | "companyId" | "linkedEntityType" | "linkedEntityId" | "title" | "type"
  >,
  skippedReason: string,
): Promise<void> {
  await createEmailDeliveryLog(
    {
      recipientEmail: SKIP_LOG_PLACEHOLDER_EMAIL,
      subject: sanitizeEmailSubject(n.title),
      emailType,
      status: "SKIPPED",
      provider: "DISABLED",
      recipientUserId: n.recipientUserId,
      companyId: n.companyId,
      relatedEntityType: n.linkedEntityType,
      relatedEntityId: n.linkedEntityId,
      metadata: { notificationType: n.type },
      skippedReason,
    },
    ctx,
  );
}

/**
 * Email a single in-app notification to the recipient's user email.
 * Does not mutate the notification row, mark read, or create new notifications.
 * No-op when Resend is not configured (skipped, not an error).
 * Phase 9D: each attempt is recorded in EmailDeliveryLog.
 */
export async function sendNotificationEmail(
  notificationId: string,
  ctx: ServiceContext,
  options?: { emailType?: EmailDeliveryType },
): Promise<SendNotificationEmailResult> {
  const emailType: EmailDeliveryType = options?.emailType ?? "NOTIFICATION";
  const n = await loadNotification(notificationId, ctx.tenantId);
  if (!n) {
    throw new ServiceError("NOT_FOUND", "Notificación no encontrada");
  }
  if (!n.recipientUserId) {
    throw new ServiceError("VALIDATION", "Notificación sin destinatario");
  }

  if (!canDispatchNotificationEmail(ctx, n.recipientUserId)) {
    throw new ServiceError("FORBIDDEN", "No podés enviar esta notificación por email");
  }

  if (n.status === "ARCHIVED") {
    await logNotificationEmailSkipped(ctx, emailType, n, "archived");
    return { ok: true, skipped: "archived", provider: "disabled" };
  }
  if (n.status !== "UNREAD" && n.status !== "READ") {
    await logNotificationEmailSkipped(ctx, emailType, n, "invalid_status");
    return { ok: true, skipped: "invalid_status", provider: "disabled" };
  }

  const inTenant = await assertRecipientActiveInTenant(n.recipientUserId, ctx.tenantId);
  if (!inTenant) {
    await logNotificationEmailSkipped(ctx, emailType, n, "recipient_not_in_tenant");
    return { ok: true, skipped: "recipient_not_in_tenant", provider: "disabled" };
  }

  if (!isEmailConfigured()) {
    await logNotificationEmailSkipped(ctx, emailType, n, "email_not_configured");
    return { ok: true, skipped: "email_disabled", provider: "disabled" };
  }

  const user = await prisma.user.findUnique({
    where: { id: n.recipientUserId },
    select: { email: true },
  });
  if (!user?.email?.trim()) {
    await logNotificationEmailSkipped(ctx, emailType, n, "no_recipient_email");
    return { ok: true, skipped: "no_recipient_email", provider: "disabled" };
  }

  const { id: logId } = await createEmailDeliveryLog(
    {
      recipientEmail: user.email.trim(),
      subject: sanitizeEmailSubject(n.title),
      emailType,
      recipientUserId: n.recipientUserId,
      companyId: n.companyId,
      relatedEntityType: n.linkedEntityType,
      relatedEntityId: n.linkedEntityId,
      metadata: { notificationType: n.type },
    },
    ctx,
  );

  const base = getPublicAppBaseUrl();
  const actionUrlAbsolute =
    n.actionUrl && base && n.actionUrl.startsWith("/") && !n.actionUrl.startsWith("//")
      ? `${base}${n.actionUrl}`
      : null;

  const isOperational = OPERATIONAL_NOTIFICATION_TYPE_SET.has(n.type);

  const { html, text } = isOperational
    ? {
        html: renderOperationalAlertEmailHtml({
          title: n.title,
          body: n.body,
          severityLabel: severityToLabel(n.severity),
          actionUrlAbsolute,
        }),
        text: renderOperationalAlertEmailText({
          title: n.title,
          body: n.body,
          severityLabel: severityToLabel(n.severity),
          actionUrlAbsolute,
        }),
      }
    : {
        html: renderNotificationEmailHtml({ title: n.title, body: n.body, actionUrlAbsolute }),
        text: renderNotificationEmailText({ title: n.title, body: n.body, actionUrlAbsolute }),
      };

  const sendResult = await sendEmail({
    to: user.email.trim(),
    subject: sanitizeEmailSubject(n.title),
    html,
    text,
  });

  if (sendResult.provider === "disabled") {
    await markEmailDeliverySkipped(logId, "email_not_configured", ctx);
    return { ok: true, skipped: "email_disabled", provider: "disabled" };
  }

  if (!sendResult.ok) {
    await markEmailDeliveryFailed(logId, sendResult.error ?? "send_failed", ctx, "RESEND");
    return {
      ok: false,
      provider: sendResult.provider,
      error: sendResult.error,
    };
  }

  await markEmailDeliverySent(logId, sendResult.messageId, ctx);
  return {
    ok: true,
    provider: sendResult.provider,
    messageId: sendResult.messageId,
  };
}

/**
 * Same as {@link sendNotificationEmail} but only for Phase 8B operational alert types.
 */
export async function sendOperationalAlertEmail(
  notificationId: string,
  ctx: ServiceContext,
): Promise<SendNotificationEmailResult> {
  const n = await loadNotification(notificationId, ctx.tenantId);
  if (!n) {
    throw new ServiceError("NOT_FOUND", "Notificación no encontrada");
  }
  if (!OPERATIONAL_NOTIFICATION_TYPE_SET.has(n.type)) {
    throw new ServiceError("VALIDATION", "Esta notificación no es una alerta operativa");
  }
  return sendNotificationEmail(notificationId, ctx, { emailType: "OPERATIONAL_ALERT" });
}
