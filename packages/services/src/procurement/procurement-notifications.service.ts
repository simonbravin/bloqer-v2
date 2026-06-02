import type { LinkedEntityType } from "@bloqer/database";
import { createSystemNotification } from "../notifications/notification.service";
import { findActiveUsersForPermission, findActiveOwnerAdminUserIds } from "../notifications/operational-alerts.service";
import type { ServiceContext } from "../types";

async function notifyRecipients(params: {
  ctx: ServiceContext;
  recipients: string[];
  type: "PURCHASE_REQUEST_SUBMITTED" | "PURCHASE_ORDER_PENDING_APPROVAL";
  title: string;
  body: string;
  severity: "INFO" | "WARNING";
  linkedEntityType: LinkedEntityType;
  linkedEntityId: string;
  projectId: string;
  companyId: string;
  actionUrl: string;
  excludeUserId?: string;
}): Promise<void> {
  const unique = [...new Set(params.recipients)].filter(
    (id) => id && id !== params.excludeUserId,
  );
  for (const recipientUserId of unique) {
    try {
      await createSystemNotification({
        tenantId: params.ctx.tenantId,
        companyId: params.companyId,
        recipientUserId,
        type: params.type,
        title: params.title,
        body: params.body,
        severity: params.severity,
        linkedEntityType: params.linkedEntityType,
        linkedEntityId: params.linkedEntityId,
        projectId: params.projectId,
        actionUrl: params.actionUrl,
      });
    } catch {
      /* best-effort */
    }
  }
}

export async function notifyPurchaseRequestSubmitted(params: {
  ctx: ServiceContext;
  purchaseRequestId: string;
  projectId: string;
  companyId: string;
  code: string;
}): Promise<void> {
  const procurement = await findActiveUsersForPermission(
    params.ctx.tenantId,
    "EDIT",
    "PROCUREMENT",
  );
  const poApprovers = await findActiveUsersForPermission(
    params.ctx.tenantId,
    "APPROVE",
    "PURCHASE_ORDERS",
  );
  const recipients = [...new Set([...procurement, ...poApprovers])];
  const fallback =
    recipients.length === 0
      ? await findActiveOwnerAdminUserIds(params.ctx.tenantId)
      : recipients;

  await notifyRecipients({
    ctx: params.ctx,
    recipients: fallback,
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
  const approvers = params.requiresHighLevel
    ? await findActiveOwnerAdminUserIds(params.ctx.tenantId)
    : await findActiveUsersForPermission(params.ctx.tenantId, "APPROVE", "PURCHASE_ORDERS");
  const fallback =
    approvers.length === 0
      ? await findActiveOwnerAdminUserIds(params.ctx.tenantId)
      : approvers;

  const reason = params.requiresVarianceExtra
    ? "desvío presupuestario elevado"
    : params.requiresHighLevel
      ? "monto sobre umbral"
      : "aprobación estándar";

  await notifyRecipients({
    ctx: params.ctx,
    recipients: fallback,
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
  });
}
