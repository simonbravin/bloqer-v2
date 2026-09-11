import type { NotificationType } from "@bloqer/database";
import { prisma, Prisma } from "@bloqer/database";
import { getPublicAppBaseUrl, isEmailConfigured } from "@bloqer/config";
import {
  sendEmail,
  formatNotificationEmailSubject,
  renderNotificationDigestEmailHtml,
  renderNotificationDigestEmailText,
  type EmailContextField,
} from "@bloqer/email";
import type { UserRole as DomainUserRole } from "@bloqer/domain";
import {
  createEmailDeliveryLog,
  markEmailDeliveryFailed,
  markEmailDeliverySent,
  markEmailDeliverySkipped,
} from "../email-delivery/email-delivery-log.service";
import { getMyFieldPendingCounts } from "../field/field-pending.service";
import type { ServiceContext } from "../types";
import {
  getOrCreateTenantNotificationEmailPolicy,
  isDigestEnabledForUser,
  isMissingNotificationEmailPrefsSchema,
  type TenantNotificationEmailPolicyView,
} from "./notification-email-preference.service";

const DIGEST_CRON_ACTOR = "00000000-0000-4000-8000-0000000000d1";
/** Stuck PENDING rows older than this are treated as failed and may retry. */
const STALE_PENDING_MS = 15 * 60 * 1000;

const CRITICAL_TYPES: NotificationType[] = [
  "PROCUREMENT_SLA_REMINDER",
  "PURCHASE_ORDER_DELIVERY_OVERDUE",
  "PURCHASE_REQUEST_NEEDED_BY_OVERDUE",
  "PURCHASE_ORDER_RECEIVED_WITHOUT_INVOICE",
  "RECEIVABLE_OVERDUE",
  "PAYABLE_OVERDUE",
  "NEGATIVE_STOCK",
  "CERTIFICATION_APPROVED_WITHOUT_INVOICE",
];

export type DigestTenantSummary = {
  tenantId: string;
  ok: boolean;
  sent: number;
  skipped: number;
  errors: number;
};

export type DigestJobResult = {
  ok: true;
  tenantsProcessed: number;
  sent: number;
  skipped: number;
  errors: number;
  tenants: DigestTenantSummary[];
};

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

function localHourInTimezone(now: Date, timeZone: string): number {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hour: "2-digit",
    hour12: false,
  });
  const map = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
  const h = Number(map.hour);
  return h === 24 ? 0 : h;
}

function localDateKey(now: Date, timeZone: string): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(now);
}

function buildUserServiceContext(
  tenantId: string,
  userId: string,
  roles: DomainUserRole[],
): ServiceContext {
  return {
    actorUserId: userId,
    tenantId,
    companyId: null,
    roles,
  };
}

function cronCtx(tenantId: string): ServiceContext {
  return {
    actorUserId: DIGEST_CRON_ACTOR,
    tenantId,
    companyId: null,
    roles: [],
  };
}

async function countUnreadCriticals(tenantId: string, userId: string): Promise<number> {
  return prisma.notification.count({
    where: {
      tenantId,
      recipientUserId: userId,
      status: "UNREAD",
      type: { in: CRITICAL_TYPES },
    },
  });
}

function pendingFieldsFromCounts(
  counts: Awaited<ReturnType<typeof getMyFieldPendingCounts>>,
): EmailContextField[] {
  const rows: EmailContextField[] = [
    { label: "SC a cotizar", value: String(counts.purchaseRequests) },
    { label: "OC a aprobar", value: String(counts.purchaseOrders) },
    { label: "OC a confirmar", value: String(counts.purchaseOrdersToConfirm) },
    { label: "OC a recibir", value: String(counts.purchaseOrdersToReceive) },
    { label: "OC a facturar", value: String(counts.purchaseOrdersToInvoice) },
    { label: "Partes pendientes", value: String(counts.jobsiteLogs) },
    {
      label: "Certificaciones",
      value: String(counts.certifications + counts.subcontractCertifications),
    },
  ];
  return rows.filter((r) => Number(r.value) > 0);
}

/**
 * Run if local hour matches, or catch-up within a few hours later the same local day.
 * Must NOT wrap past midnight (modulo would wrongly fire next-day digests for late targets).
 */
function shouldRunDigestForHour(params: {
  forceHourMatch?: boolean;
  localHour: number;
  digestHourLocal: number;
}): boolean {
  if (params.forceHourMatch) return true;
  if (params.localHour === params.digestHourLocal) return true;
  if (params.localHour <= params.digestHourLocal) return false;
  return params.localHour <= params.digestHourLocal + 3;
}

/**
 * Skip when already SENT / empty SKIPPED / fresh PENDING.
 * SKIPPED(email_not_configured) blocks only while Resend is still down (or when not forcing).
 * PENDING rows that already have providerMessageId are healed to SENT (send succeeded, mark failed).
 */
async function findBlockingDigestLog(params: {
  tenantId: string;
  idempotencyKey: string;
  now: Date;
  allowRetryConfigurableSkips?: boolean;
}): Promise<{ id: string; status: string } | null> {
  const rows = await prisma.emailDeliveryLog.findMany({
    where: {
      tenantId: params.tenantId,
      idempotencyKey: params.idempotencyKey,
    },
    select: {
      id: true,
      status: true,
      createdAt: true,
      skippedReason: true,
      providerMessageId: true,
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  for (const row of rows) {
    if (row.status === "SENT") return row;
    if (row.status === "SKIPPED" && row.skippedReason === "digest_empty") return row;
    if (row.status === "SKIPPED" && row.skippedReason === "email_not_configured") {
      const canRetry =
        params.allowRetryConfigurableSkips === true || isEmailConfigured();
      if (!canRetry) return row;
      continue;
    }
    if (row.status === "PENDING") {
      if (row.providerMessageId) {
        // Send likely succeeded; mark SENT so catch-up never double-sends.
        await prisma.emailDeliveryLog.update({
          where: { id: row.id },
          data: {
            status: "SENT",
            provider: "RESEND",
            sentAt: new Date(),
            skippedReason: null,
            errorMessage: null,
          },
        });
        return row;
      }
      const age = params.now.getTime() - row.createdAt.getTime();
      if (age < STALE_PENDING_MS) return row;
      await prisma.emailDeliveryLog.update({
        where: { id: row.id },
        data: {
          status: "FAILED",
          errorMessage: "stale_pending_timeout",
        },
      });
    }
  }
  return null;
}

async function claimDigestLogOrSkip(
  create: () => Promise<{ id: string }>,
): Promise<{ id: string } | "duplicate"> {
  try {
    return await create();
  } catch (err) {
    if (isUniqueViolation(err)) return "duplicate";
    throw err;
  }
}

async function markDigestSentBestEffort(
  logId: string,
  messageId: string | undefined,
  system: ServiceContext,
): Promise<void> {
  try {
    await markEmailDeliverySent(logId, messageId, system);
  } catch (err) {
    console.error(
      `[notification-digest] mark SENT failed logId=${logId}; forcing status`,
      err instanceof Error ? err.message : err,
    );
    await prisma.emailDeliveryLog.update({
      where: { id: logId },
      data: {
        status: "SENT",
        provider: "RESEND",
        providerMessageId: messageId ? messageId.slice(0, 256) : "mark_sent_recovered",
        sentAt: new Date(),
        skippedReason: null,
        errorMessage: null,
      },
    });
  }
}

/**
 * Send daily digest emails for one ACTIVE tenant when local hour matches (or catch-up).
 */
export async function runNotificationDigestForTenant(
  tenantId: string,
  now: Date = new Date(),
  options?: { forceHourMatch?: boolean },
): Promise<DigestTenantSummary> {
  const tenant = await prisma.tenant.findFirst({
    where: { id: tenantId, status: "ACTIVE" },
    select: { id: true, name: true, timezone: true },
  });
  if (!tenant) {
    return { tenantId, ok: true, sent: 0, skipped: 0, errors: 0 };
  }

  let policy: TenantNotificationEmailPolicyView;
  try {
    policy = await getOrCreateTenantNotificationEmailPolicy(tenantId);
  } catch (err) {
    if (isMissingNotificationEmailPrefsSchema(err)) {
      console.warn(
        `[notification-digest] D-114 schema missing; skipping tenant=${tenantId}`,
      );
      return { tenantId, ok: true, sent: 0, skipped: 1, errors: 0 };
    }
    throw err;
  }

  const tz = tenant.timezone || "America/Argentina/Buenos_Aires";
  const hour = localHourInTimezone(now, tz);
  if (
    !shouldRunDigestForHour({
      forceHourMatch: options?.forceHourMatch,
      localHour: hour,
      digestHourLocal: policy.digestHourLocal,
    })
  ) {
    return { tenantId, ok: true, sent: 0, skipped: 0, errors: 0 };
  }

  const memberships = await prisma.userMembership.findMany({
    where: {
      tenantId,
      status: "ACTIVE",
      OR: [{ roles: { has: "OWNER" } }, { roles: { has: "ADMIN" } }],
    },
    select: {
      userId: true,
      roles: true,
      user: { select: { email: true, name: true } },
    },
  });

  let sent = 0;
  let skipped = 0;
  let errors = 0;
  const dateKey = localDateKey(now, tz);
  const base = getPublicAppBaseUrl();
  const system = cronCtx(tenantId);
  const allowRetryConfigurableSkips = options?.forceHourMatch === true;

  for (const m of memberships) {
    const roles = m.roles as DomainUserRole[];
    const enabled = await isDigestEnabledForUser({
      tenantId,
      userId: m.userId,
      roles,
      policy,
    });
    if (!enabled) {
      skipped += 1;
      continue;
    }

    const email = m.user.email?.trim();
    if (!email) {
      skipped += 1;
      continue;
    }

    const idempotencyKey = `notification-digest:${tenantId}:${m.userId}:${dateKey}`;
    const blocked = await findBlockingDigestLog({
      tenantId,
      idempotencyKey,
      now,
      allowRetryConfigurableSkips,
    });
    if (blocked) {
      skipped += 1;
      continue;
    }

    try {
      const userCtx = buildUserServiceContext(tenantId, m.userId, roles);
      const counts = await getMyFieldPendingCounts(userCtx);
      const criticalUnread = await countUnreadCriticals(tenantId, m.userId);
      const pendingFields = pendingFieldsFromCounts(counts);
      const criticalFields: EmailContextField[] =
        criticalUnread > 0
          ? [{ label: "Alertas críticas sin leer", value: String(criticalUnread) }]
          : [];

      if (pendingFields.length === 0 && criticalFields.length === 0 && counts.total === 0) {
        const claimed = await claimDigestLogOrSkip(() =>
          createEmailDeliveryLog(
            {
              recipientEmail: email,
              subject: formatNotificationEmailSubject("Resumen diario", tenant.name),
              emailType: "NOTIFICATION_DIGEST",
              status: "SKIPPED",
              provider: "DISABLED",
              recipientUserId: m.userId,
              idempotencyKey,
              skippedReason: "digest_empty",
              metadata: { digestDate: dateKey },
            },
            system,
          ),
        );
        if (claimed === "duplicate") {
          skipped += 1;
          continue;
        }
        skipped += 1;
        continue;
      }

      const subject = formatNotificationEmailSubject("Resumen diario", tenant.name);
      const actionUrlAbsolute = base ? `${base}/pendientes` : null;
      const settingsUrlAbsolute = base ? `${base}/configuracion/notificaciones` : null;

      if (!isEmailConfigured()) {
        // Not covered by unique index — findBlocking prevents hourly spam.
        await createEmailDeliveryLog(
          {
            recipientEmail: email,
            subject,
            emailType: "NOTIFICATION_DIGEST",
            status: "SKIPPED",
            provider: "DISABLED",
            recipientUserId: m.userId,
            idempotencyKey,
            skippedReason: "email_not_configured",
            metadata: { digestDate: dateKey },
          },
          system,
        );
        skipped += 1;
        continue;
      }

      const claimed = await claimDigestLogOrSkip(() =>
        createEmailDeliveryLog(
          {
            recipientEmail: email,
            subject,
            emailType: "NOTIFICATION_DIGEST",
            recipientUserId: m.userId,
            idempotencyKey,
            metadata: { digestDate: dateKey, pendingTotal: counts.total, criticalUnread },
          },
          system,
        ),
      );
      if (claimed === "duplicate") {
        skipped += 1;
        continue;
      }
      const logId = claimed.id;

      const html = renderNotificationDigestEmailHtml({
        organizationName: tenant.name,
        recipientName: m.user.name,
        pendingFields:
          pendingFields.length > 0
            ? pendingFields
            : [{ label: "Pendientes", value: String(counts.total) }],
        criticalFields,
        actionUrlAbsolute,
        settingsUrlAbsolute,
      });
      const text = renderNotificationDigestEmailText({
        organizationName: tenant.name,
        recipientName: m.user.name,
        pendingFields:
          pendingFields.length > 0
            ? pendingFields
            : [{ label: "Pendientes", value: String(counts.total) }],
        criticalFields,
        actionUrlAbsolute,
        settingsUrlAbsolute,
      });

      const result = await sendEmail({ to: email, subject, html, text });
      if (result.provider === "disabled") {
        await markEmailDeliverySkipped(logId, "email_not_configured", system);
        skipped += 1;
        continue;
      }
      if (!result.ok) {
        await markEmailDeliveryFailed(logId, result.error ?? "send_failed", system, "RESEND");
        errors += 1;
        continue;
      }
      // Persist messageId on PENDING first so a crash before SENT still heals without resend.
      if (result.messageId) {
        await prisma.emailDeliveryLog.update({
          where: { id: logId },
          data: { providerMessageId: result.messageId.slice(0, 256) },
        });
      }
      await markDigestSentBestEffort(logId, result.messageId, system);
      sent += 1;
    } catch (e) {
      console.error(
        `[notification-digest] user failed tenantId=${tenantId} userId=${m.userId}`,
        e instanceof Error ? e.message : e,
      );
      errors += 1;
    }
  }

  return { tenantId, ok: errors === 0, sent, skipped, errors };
}

export async function runNotificationDigestForAllActiveTenants(
  now: Date = new Date(),
): Promise<DigestJobResult> {
  const tenants = await prisma.tenant.findMany({
    where: { status: "ACTIVE" },
    select: { id: true },
  });

  const summaries: DigestTenantSummary[] = [];
  let sent = 0;
  let skipped = 0;
  let errors = 0;

  for (const t of tenants) {
    try {
      const row = await runNotificationDigestForTenant(t.id, now);
      summaries.push(row);
      sent += row.sent;
      skipped += row.skipped;
      errors += row.errors;
    } catch (e) {
      console.error(
        `[notification-digest] tenant failed tenantId=${t.id}`,
        e instanceof Error ? e.message : e,
      );
      summaries.push({
        tenantId: t.id,
        ok: false,
        sent: 0,
        skipped: 0,
        errors: 1,
      });
      errors += 1;
    }
  }

  return {
    ok: true,
    tenantsProcessed: tenants.length,
    sent,
    skipped,
    errors,
    tenants: summaries,
  };
}

/** Manual OWNER/ADMIN trigger for one tenant (bypasses hour match). */
export async function runNotificationDigestNowForTenant(
  tenantId: string,
): Promise<DigestTenantSummary> {
  return runNotificationDigestForTenant(tenantId, new Date(), { forceHourMatch: true });
}

export type { TenantNotificationEmailPolicyView };
