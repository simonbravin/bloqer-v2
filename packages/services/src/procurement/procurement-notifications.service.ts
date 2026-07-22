import type { LinkedEntityType, NotificationType } from "@bloqer/database";
import { prisma } from "@bloqer/database";
import { createSystemNotification } from "../notifications/notification.service";
import { sendNotificationEmailAsSystem } from "../notifications/notification-email.service";
import {
  findActiveOwnerAdminUserIds,
  resolveNotificationAudience,
} from "../notifications/notification-audience.service";
import { getCompanyProcurementSettings } from "./company-procurement-settings.service";
import type { ServiceContext } from "../types";

type ProcurementNotifyType =
  | "PURCHASE_REQUEST_SUBMITTED"
  | "PURCHASE_ORDER_PENDING_APPROVAL"
  | "PURCHASE_ORDER_APPROVED"
  | "PURCHASE_ORDER_RETURNED"
  | "PURCHASE_ORDER_CONFIRMED"
  | "PROCUREMENT_SLA_REMINDER";

async function notifyRecipients(params: {
  ctx: ServiceContext;
  recipients: string[];
  type: ProcurementNotifyType;
  title: string;
  body: string;
  severity: "INFO" | "WARNING" | "SUCCESS";
  linkedEntityType: LinkedEntityType;
  linkedEntityId: string;
  projectId: string;
  companyId: string;
  actionUrl: string;
  excludeUserId?: string;
  /** Default true. SLA reminders pass false because recipients are already OWNER/ADMIN. */
  alwaysCcOwnerAdmin?: boolean;
}): Promise<number> {
  const unique = await resolveNotificationAudience({
    tenantId: params.ctx.tenantId,
    primaryUserIds: params.recipients,
    excludeUserId: params.excludeUserId,
    alwaysCcOwnerAdmin: params.alwaysCcOwnerAdmin ?? true,
  });
  let created = 0;
  for (const recipientUserId of unique) {
    try {
      const { id: notificationId } = await createSystemNotification({
        tenantId: params.ctx.tenantId,
        companyId: params.companyId,
        recipientUserId,
        type: params.type as NotificationType,
        title: params.title,
        body: params.body,
        severity: params.severity,
        linkedEntityType: params.linkedEntityType,
        linkedEntityId: params.linkedEntityId,
        projectId: params.projectId,
        actionUrl: params.actionUrl,
      });
      // Best-effort email (D-050 / BR-PUR-015); never abort the business flow.
      await sendNotificationEmailAsSystem(notificationId, params.ctx).catch(() => undefined);
      created += 1;
    } catch {
      /* best-effort */
    }
  }
  return created;
}

export async function notifyPurchaseRequestSubmitted(params: {
  ctx: ServiceContext;
  purchaseRequestId: string;
  projectId: string;
  companyId: string;
  code: string;
}): Promise<void> {
  const recipients = await resolveNotificationAudience({
    tenantId: params.ctx.tenantId,
    permissionTargets: [
      { action: "EDIT", module: "PROCUREMENT" },
      { action: "APPROVE", module: "PURCHASE_ORDERS" },
    ],
    excludeUserId: params.ctx.actorUserId,
  });

  await notifyRecipients({
    ctx: params.ctx,
    recipients,
    type: "PURCHASE_REQUEST_SUBMITTED",
    title: "Nueva solicitud de compra",
    body: `La solicitud ${params.code} fue enviada y espera cotizaciones.`,
    severity: "INFO",
    linkedEntityType: "PURCHASE_REQUEST",
    linkedEntityId: params.purchaseRequestId,
    projectId: params.projectId,
    companyId: params.companyId,
    actionUrl: `/proyectos/${params.projectId}/solicitudes-compra/${params.purchaseRequestId}`,
    excludeUserId: params.ctx.actorUserId,
    alwaysCcOwnerAdmin: false,
  });
}

export async function notifyPurchaseOrderPendingApproval(params: {
  ctx: ServiceContext;
  purchaseOrderId: string;
  projectId: string;
  companyId: string;
  code: string;
  requiresHighLevel: boolean;
  requiresVarianceExtra: boolean;
}): Promise<void> {
  const recipients = params.requiresHighLevel
    ? await resolveNotificationAudience({
        tenantId: params.ctx.tenantId,
        excludeUserId: params.ctx.actorUserId,
      })
    : await resolveNotificationAudience({
        tenantId: params.ctx.tenantId,
        permissionTargets: [{ action: "APPROVE", module: "PURCHASE_ORDERS" }],
        excludeUserId: params.ctx.actorUserId,
      });

  const reason = params.requiresVarianceExtra
    ? "desvío presupuestario elevado"
    : params.requiresHighLevel
      ? "monto sobre umbral"
      : "aprobación estándar";

  await notifyRecipients({
    ctx: params.ctx,
    recipients,
    type: "PURCHASE_ORDER_PENDING_APPROVAL",
    title: "OC pendiente de aprobación",
    body: `La orden ${params.code} requiere aprobación (${reason}).`,
    severity: params.requiresVarianceExtra ? "WARNING" : "INFO",
    linkedEntityType: "PURCHASE_ORDER",
    linkedEntityId: params.purchaseOrderId,
    projectId: params.projectId,
    companyId: params.companyId,
    actionUrl: `/proyectos/${params.projectId}/ordenes-compra/${params.purchaseOrderId}`,
    excludeUserId: params.ctx.actorUserId,
    alwaysCcOwnerAdmin: false,
  });
}

export async function notifyPurchaseOrderApproved(params: {
  ctx: ServiceContext;
  purchaseOrderId: string;
  projectId: string;
  companyId: string;
  code: string;
  recipientUserIds: string[];
}): Promise<void> {
  await notifyRecipients({
    ctx: params.ctx,
    recipients: params.recipientUserIds,
    type: "PURCHASE_ORDER_APPROVED",
    title: "OC aprobada",
    body: `La orden ${params.code} fue aprobada. Pendiente confirmar al proveedor.`,
    severity: "SUCCESS",
    linkedEntityType: "PURCHASE_ORDER",
    linkedEntityId: params.purchaseOrderId,
    projectId: params.projectId,
    companyId: params.companyId,
    actionUrl: `/proyectos/${params.projectId}/ordenes-compra/${params.purchaseOrderId}`,
    excludeUserId: params.ctx.actorUserId,
  });
}

export async function notifyPurchaseOrderReturned(params: {
  ctx: ServiceContext;
  purchaseOrderId: string;
  projectId: string;
  companyId: string;
  code: string;
  reason: string;
  recipientUserIds: string[];
}): Promise<void> {
  await notifyRecipients({
    ctx: params.ctx,
    recipients: params.recipientUserIds,
    type: "PURCHASE_ORDER_RETURNED",
    title: "OC devuelta para cambios",
    body: `La orden ${params.code} fue devuelta: ${params.reason}`,
    severity: "WARNING",
    linkedEntityType: "PURCHASE_ORDER",
    linkedEntityId: params.purchaseOrderId,
    projectId: params.projectId,
    companyId: params.companyId,
    actionUrl: `/proyectos/${params.projectId}/ordenes-compra/${params.purchaseOrderId}`,
    excludeUserId: params.ctx.actorUserId,
  });
}

export async function notifyPurchaseOrderConfirmed(params: {
  ctx: ServiceContext;
  purchaseOrderId: string;
  projectId: string;
  companyId: string;
  code: string;
  recipientUserIds: string[];
}): Promise<void> {
  await notifyRecipients({
    ctx: params.ctx,
    recipients: params.recipientUserIds,
    type: "PURCHASE_ORDER_CONFIRMED",
    title: "OC confirmada al proveedor",
    body: `La orden ${params.code} fue confirmada. Ya compromete costo y admite recepciones.`,
    severity: "SUCCESS",
    linkedEntityType: "PURCHASE_ORDER",
    linkedEntityId: params.purchaseOrderId,
    projectId: params.projectId,
    companyId: params.companyId,
    actionUrl: `/proyectos/${params.projectId}/ordenes-compra/${params.purchaseOrderId}`,
    excludeUserId: params.ctx.actorUserId,
  });
}

export type ProcurementSlaRunSummary = {
  checkedCount: number;
  createdCount: number;
  skippedCount: number;
};

/**
 * Remind OWNER/ADMIN about stale SUBMITTED POs and SUBMITTED PRs without quotes (D-050).
 * Idempotent via notification type + entity + 7-day window (same pattern as operational alerts).
 */
export async function runProcurementSlaReminders(
  ctx: ServiceContext,
): Promise<ProcurementSlaRunSummary> {
  let checkedCount = 0;
  let createdCount = 0;
  let skippedCount = 0;

  const companies = await prisma.company.findMany({
    where: { tenantId: ctx.tenantId, status: "ACTIVE" },
    select: { id: true },
  });

  const owners = await findActiveOwnerAdminUserIds(ctx.tenantId);
  if (owners.length === 0) {
    return { checkedCount: 0, createdCount: 0, skippedCount: 0 };
  }

  for (const company of companies) {
    const settings = await getCompanyProcurementSettings(company.id, ctx);
    const slaMs = settings.approvalSlaHours * 60 * 60 * 1000;
    const cutoff = new Date(Date.now() - slaMs);

    const stalePos = await prisma.purchaseOrder.findMany({
      where: {
        tenantId: ctx.tenantId,
        companyId: company.id,
        status: "SUBMITTED",
        updatedAt: { lte: cutoff },
      },
      select: { id: true, number: true, projectId: true, companyId: true },
    });

    for (const po of stalePos) {
      checkedCount += 1;
      const code = `OC-${String(po.number).padStart(3, "0")}`;
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const needing: string[] = [];
      for (const recipientUserId of owners) {
        const dup = await prisma.notification.findFirst({
          where: {
            tenantId: ctx.tenantId,
            type: "PROCUREMENT_SLA_REMINDER",
            linkedEntityType: "PURCHASE_ORDER",
            linkedEntityId: po.id,
            recipientUserId,
            status: { not: "ARCHIVED" },
            createdAt: { gte: weekAgo },
          },
          select: { id: true },
        });
        if (dup) {
          skippedCount += 1;
          continue;
        }
        needing.push(recipientUserId);
      }
      if (needing.length === 0) continue;
      createdCount += await notifyRecipients({
        ctx,
        recipients: needing,
        type: "PROCUREMENT_SLA_REMINDER",
        title: "OC demorada en aprobación",
        body: `La orden ${code} lleva más de ${settings.approvalSlaHours}h pendiente de aprobación.`,
        severity: "WARNING",
        linkedEntityType: "PURCHASE_ORDER",
        linkedEntityId: po.id,
        projectId: po.projectId,
        companyId: po.companyId,
        actionUrl: `/proyectos/${po.projectId}/ordenes-compra/${po.id}`,
        alwaysCcOwnerAdmin: false,
      });
    }

    const stalePrs = await prisma.purchaseRequest.findMany({
      where: {
        tenantId: ctx.tenantId,
        companyId: company.id,
        status: "SUBMITTED",
        submittedAt: { lte: cutoff },
      },
      select: { id: true, number: true, projectId: true, companyId: true },
    });

    for (const pr of stalePrs) {
      const quoteCount = await prisma.procurementQuote.count({
        where: { purchaseRequestId: pr.id, status: { in: ["RECEIVED", "SELECTED"] } },
      });
      if (quoteCount > 0) continue;
      checkedCount += 1;
      const code = `SC-${String(pr.number).padStart(3, "0")}`;
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const needing: string[] = [];
      for (const recipientUserId of owners) {
        const dup = await prisma.notification.findFirst({
          where: {
            tenantId: ctx.tenantId,
            type: "PROCUREMENT_SLA_REMINDER",
            linkedEntityType: "PURCHASE_REQUEST",
            linkedEntityId: pr.id,
            recipientUserId,
            status: { not: "ARCHIVED" },
            createdAt: { gte: weekAgo },
          },
          select: { id: true },
        });
        if (dup) {
          skippedCount += 1;
          continue;
        }
        needing.push(recipientUserId);
      }
      if (needing.length === 0) continue;
      createdCount += await notifyRecipients({
        ctx,
        recipients: needing,
        type: "PROCUREMENT_SLA_REMINDER",
        title: "Solicitud demorada sin cotizar",
        body: `La solicitud ${code} lleva más de ${settings.approvalSlaHours}h sin cotizaciones.`,
        severity: "WARNING",
        linkedEntityType: "PURCHASE_REQUEST",
        linkedEntityId: pr.id,
        projectId: pr.projectId,
        companyId: pr.companyId,
        actionUrl: `/proyectos/${pr.projectId}/solicitudes-compra/${pr.id}`,
        alwaysCcOwnerAdmin: false,
      });
    }
  }

  return { checkedCount, createdCount, skippedCount };
}
