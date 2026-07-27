import type { NotificationType } from "@bloqer/database";
import { prisma } from "@bloqer/database";
import { createSystemNotification } from "../notifications/notification.service";
import { resolveNotificationAudience } from "../notifications/notification-audience.service";
import type { ServiceContext } from "../types";
import { canRegisterApPayment } from "./ap-access";

/** Active members who can debit treasury for AP payments ([D-069]). */
export async function findActiveApPaymentAudience(tenantId: string): Promise<string[]> {
  const memberships = await prisma.userMembership.findMany({
    where: { tenantId, status: "ACTIVE" },
    select: { userId: true, roles: true },
  });
  return [
    ...new Set(
      memberships.filter((m) => canRegisterApPayment(m.roles)).map((m) => m.userId),
    ),
  ];
}

async function notifyInAppOnly(params: {
  ctx: ServiceContext;
  recipients: string[];
  type: NotificationType;
  title: string;
  body: string;
  severity: "INFO" | "WARNING" | "SUCCESS";
  linkedEntityType: "SUPPLIER_INVOICE" | "PURCHASE_ORDER";
  linkedEntityId: string;
  projectId: string | null;
  companyId: string;
  actionUrl: string;
  excludeUserId?: string;
  alwaysCcOwnerAdmin?: boolean;
}): Promise<void> {
  const unique = await resolveNotificationAudience({
    tenantId: params.ctx.tenantId,
    primaryUserIds: params.recipients,
    excludeUserId: params.excludeUserId,
    alwaysCcOwnerAdmin: params.alwaysCcOwnerAdmin ?? true,
  });
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
      /* best-effort in-app only ([D-069]) — no email */
    }
  }
}

/**
 * After a project supplier invoice is ISSUED → payable OPEN: alert finance/treasury + OWNER/ADMIN.
 * In-app only ([D-069]).
 */
export async function notifyPayableReadyToPay(params: {
  ctx: ServiceContext;
  supplierInvoiceId: string;
  payableId: string;
  projectId: string;
  companyId: string;
  invoiceNumber: number;
  purchaseOrderId?: string | null;
  purchaseOrderCode?: string | null;
  amountLabel: string;
}): Promise<void> {
  const recipients = await findActiveApPaymentAudience(params.ctx.tenantId);
  const invCode = `FP-${String(params.invoiceNumber).padStart(3, "0")}`;
  const ocPart = params.purchaseOrderCode
    ? ` vinculada a ${params.purchaseOrderCode}`
    : params.purchaseOrderId
      ? " vinculada a una OC"
      : "";
  const actionUrl = params.purchaseOrderId
    ? `/proyectos/${params.projectId}/ordenes-compra/${params.purchaseOrderId}`
    : `/proyectos/${params.projectId}/cuentas-por-pagar/${params.payableId}`;

  await notifyInAppOnly({
    ctx: params.ctx,
    recipients,
    type: "PAYABLE_READY_TO_PAY",
    title: "Listo para pagar",
    body: `La factura ${invCode}${ocPart} (${params.amountLabel}) tiene CxP abierta. Elegí la cuenta de tesorería y registrá el pago.`,
    severity: "INFO",
    linkedEntityType: "SUPPLIER_INVOICE",
    linkedEntityId: params.supplierInvoiceId,
    projectId: params.projectId,
    companyId: params.companyId,
    actionUrl,
    excludeUserId: params.ctx.actorUserId,
    alwaysCcOwnerAdmin: true,
  });
}

/**
 * After Payment CONFIRMED: notify procurement (+ OWNER/ADMIN CC). In-app only ([D-069]).
 */
export async function notifyPaymentConfirmed(params: {
  ctx: ServiceContext;
  paymentId: string;
  supplierInvoiceId: string;
  projectId: string | null;
  companyId: string;
  invoiceNumber: number;
  amountLabel: string;
  accountName: string;
  purchaseOrderId?: string | null;
}): Promise<void> {
  const recipients = await resolveNotificationAudience({
    tenantId: params.ctx.tenantId,
    permissionTargets: [{ action: "EDIT", module: "PROCUREMENT" }],
    excludeUserId: params.ctx.actorUserId,
    alwaysCcOwnerAdmin: true,
  });

  const invCode = `FP-${String(params.invoiceNumber).padStart(3, "0")}`;
  const actionUrl = params.projectId
    ? params.purchaseOrderId
      ? `/proyectos/${params.projectId}/ordenes-compra/${params.purchaseOrderId}`
      : `/proyectos/${params.projectId}/facturas-proveedor/${params.supplierInvoiceId}`
    : `/finanzas/facturas-proveedor/${params.supplierInvoiceId}`;

  await notifyInAppOnly({
    ctx: params.ctx,
    recipients,
    type: "PAYMENT_CONFIRMED",
    title: "Pago confirmado",
    body: `Se confirmó el pago de ${params.amountLabel} de ${invCode} desde ${params.accountName}.`,
    severity: "SUCCESS",
    linkedEntityType: "SUPPLIER_INVOICE",
    linkedEntityId: params.supplierInvoiceId,
    projectId: params.projectId,
    companyId: params.companyId,
    actionUrl,
    excludeUserId: params.ctx.actorUserId,
    alwaysCcOwnerAdmin: false, // already included via resolveNotificationAudience above
  });
}
