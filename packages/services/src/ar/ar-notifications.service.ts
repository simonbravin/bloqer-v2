import type { NotificationType, UserRole } from "@bloqer/database";
import { prisma } from "@bloqer/database";
import { createSystemNotification } from "../notifications/notification.service";
import { sendNotificationEmailAsSystem } from "../notifications/notification-email.service";
import { resolveNotificationAudience } from "../notifications/notification-audience.service";
import {
  formatNotificationIdentityBody,
  loadNotificationIdentityFacts,
} from "../notifications/notification-email-context";
import type { ServiceContext } from "../types";

/** Company-finance actors who should be nudged to collect (D-072). Not PROJECT_FINANCE / VIEWER. */
const AR_COLLECTION_NOTIFY_ROLES: ReadonlySet<string> = new Set([
  "OWNER",
  "ADMIN",
  "FINANCE",
  "TREASURER",
]);

/** Active members with OWNER|ADMIN|FINANCE|TREASURER.
 * Prefer company-scoped memberships; include tenant-wide (`companyId` null).
 */
export async function findActiveArCollectionAudience(
  tenantId: string,
  companyId?: string | null,
): Promise<string[]> {
  const memberships = await prisma.userMembership.findMany({
    where: { tenantId, status: "ACTIVE" },
    select: { userId: true, roles: true, companyId: true },
  });
  return [
    ...new Set(
      memberships
        .filter((m) => {
          if (!m.roles.some((r: UserRole) => AR_COLLECTION_NOTIFY_ROLES.has(r))) return false;
          if (!companyId) return true;
          return m.companyId == null || m.companyId === companyId;
        })
        .map((m) => m.userId),
    ),
  ];
}

/**
 * After a **project** sales invoice is ISSUED → receivable OPEN with balance:
 * notify OWNER/ADMIN/FINANCE/TREASURER. PM may still collect (no RBAC change).
 * Certificación does **not** credit treasury — only Collection does ([D-072]).
 */
export async function notifyReceivableReadyToCollect(params: {
  ctx: ServiceContext;
  salesInvoiceId: string;
  receivableId: string;
  projectId: string;
  companyId: string;
  invoiceNumber: number;
  amountLabel: string;
}): Promise<void> {
  const recipients = await findActiveArCollectionAudience(params.ctx.tenantId, params.companyId);
  const invCode = `FAC-${String(params.invoiceNumber).padStart(5, "0")}`;
  const actionUrl = `/proyectos/${params.projectId}/cuentas-por-cobrar/${params.receivableId}/cobrar`;

  const unique = await resolveNotificationAudience({
    tenantId: params.ctx.tenantId,
    primaryUserIds: recipients,
    excludeUserId: params.ctx.actorUserId,
    alwaysCcOwnerAdmin: true,
  });

  const type: NotificationType = "RECEIVABLE_READY_TO_COLLECT";
  const title = "Listo para cobrar";
  const facts = await loadNotificationIdentityFacts({
    tenantId: params.ctx.tenantId,
    companyId: params.companyId,
    projectId: params.projectId,
    actorUserId: params.ctx.actorUserId,
  });
  const body = formatNotificationIdentityBody(
    `La factura ${invCode} (${params.amountLabel}) tiene CxC abierta. Elegí la cuenta de tesorería y registrá la cobranza.`,
    facts,
  );

  for (const recipientUserId of unique) {
    try {
      const { id: notificationId } = await createSystemNotification({
        tenantId: params.ctx.tenantId,
        companyId: params.companyId,
        recipientUserId,
        type,
        title,
        body,
        severity: "INFO",
        linkedEntityType: "SALES_INVOICE",
        linkedEntityId: params.salesInvoiceId,
        projectId: params.projectId,
        actionUrl,
      });
      await sendNotificationEmailAsSystem(notificationId, params.ctx).catch(() => undefined);
    } catch {
      /* best-effort — never abort issue flows */
    }
  }
}
