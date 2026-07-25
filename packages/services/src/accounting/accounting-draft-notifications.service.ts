import { prisma, type LinkedEntityType, type NotificationType } from "@bloqer/database";
import { createSystemNotification } from "../notifications/notification.service";
import { resolveNotificationAudience } from "../notifications/notification-audience.service";
import { ServiceContext } from "../types";

const DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000;

const TYPE = "ACCOUNTING_DRAFTS_PENDING" satisfies NotificationType;
const LINKED_TYPE = "OTHER" satisfies LinkedEntityType;

async function hasRecentDraftPendingNotice(params: {
  tenantId: string;
  companyId: string;
  recipientUserId: string;
}): Promise<boolean> {
  const since = new Date(Date.now() - DEDUP_WINDOW_MS);
  const found = await prisma.notification.findFirst({
    where: {
      tenantId: params.tenantId,
      type: TYPE,
      linkedEntityType: LINKED_TYPE,
      linkedEntityId: params.companyId,
      recipientUserId: params.recipientUserId,
      status: { not: "ARCHIVED" },
      createdAt: { gte: since },
    },
    select: { id: true },
  });
  return Boolean(found);
}

/**
 * Soft nudge after a sourced auto-DRAFT is created [D-063].
 * Never throws to the caller. Dedupe 24h per recipient + company.
 */
export async function notifyAccountingDraftsPendingSoft(
  ctx: ServiceContext,
  params: { companyId: string },
): Promise<void> {
  try {
    const recipients = await resolveNotificationAudience({
      tenantId: ctx.tenantId,
      permissionTargets: [{ action: "EDIT", module: "ACCOUNTING" }],
      // Actor already triggered the draft; nudge the rest of the accounting queue.
      excludeUserId: ctx.actorUserId,
    });
    if (recipients.length === 0) return;

    const actionUrl = `/contabilidad/asientos?status=DRAFT&empresa=${encodeURIComponent(params.companyId)}`;

    // Sequential to keep notification write load predictable under burst ops.
    for (const recipientUserId of recipients) {
      try {
        const dup = await hasRecentDraftPendingNotice({
          tenantId: ctx.tenantId,
          companyId: params.companyId,
          recipientUserId,
        });
        if (dup) continue;
        await createSystemNotification({
          tenantId: ctx.tenantId,
          companyId: params.companyId,
          recipientUserId,
          type: TYPE,
          title: "Asientos pendientes de contabilizar",
          body: "Hay asientos contables en borrador pendientes de contabilizar.",
          severity: "INFO",
          linkedEntityType: LINKED_TYPE,
          linkedEntityId: params.companyId,
          projectId: null,
          actionUrl,
          metadata: { kind: "accounting_drafts_pending" },
        });
      } catch {
        // Per-recipient soft fail.
      }
    }
  } catch {
    // Soft path: never fail auto-DRAFT / ops because notifications failed.
  }
}
