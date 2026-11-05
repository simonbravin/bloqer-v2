import { prisma, type LinkedEntityType, type NotificationType, type Prisma } from "@bloqer/database";
import { can } from "@bloqer/domain";
import { createSystemNotification } from "../notifications/notification.service";
import { ServiceContext } from "../types";
import { lockAccountingCompany } from "./accounting-company-context";

const DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000;

const TYPE = "ACCOUNTING_DRAFTS_PENDING" satisfies NotificationType;
const LINKED_TYPE = "OTHER" satisfies LinkedEntityType;

async function hasRecentDraftPendingNotice(params: {
  tenantId: string;
  companyId: string;
  recipientUserId: string;
}, db: Prisma.TransactionClient): Promise<boolean> {
  const since = new Date(Date.now() - DEDUP_WINDOW_MS);
  const found = await db.notification.findFirst({
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
    const memberships = await prisma.userMembership.findMany({
      where: {
        tenantId: ctx.tenantId,
        status: "ACTIVE",
        userId: { not: ctx.actorUserId },
        OR: [{ companyId: null }, { companyId: params.companyId }],
      },
      select: { userId: true, roles: true },
    });
    const recipients = memberships.filter(row => can(row.roles, "EDIT", "ACCOUNTING")).map(row => row.userId);
    if (recipients.length === 0) return;

    const actionUrl = `/contabilidad/asientos?status=DRAFT&empresa=${encodeURIComponent(params.companyId)}`;

    // Sequential to keep notification write load predictable under burst ops.
    for (const recipientUserId of recipients) {
      try {
        await prisma.$transaction(async tx => {
          await lockAccountingCompany(tx, ctx.tenantId, params.companyId);
          const recipient = await tx.userMembership.findFirst({
            where: { tenantId: ctx.tenantId, userId: recipientUserId, status: "ACTIVE", OR: [{ companyId: null }, { companyId: params.companyId }] },
            select: { roles: true },
          });
          if (!recipient || !can(recipient.roles, "EDIT", "ACCOUNTING")) return;
          const dup = await hasRecentDraftPendingNotice({ tenantId: ctx.tenantId, companyId: params.companyId, recipientUserId }, tx);
          if (dup) return;
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
          }, tx);
        }, { maxWait: 10_000, timeout: 30_000 });
      } catch {
        // Per-recipient soft fail.
      }
    }
  } catch {
    // Soft path: never fail auto-DRAFT / ops because notifications failed.
  }
}
