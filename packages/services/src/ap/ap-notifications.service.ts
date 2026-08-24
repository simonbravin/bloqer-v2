import type { NotificationType } from "@bloqer/database";
import { prisma } from "@bloqer/database";
import { createSystemNotification } from "../notifications/notification.service";
import { sendNotificationEmailAsSystem } from "../notifications/notification-email.service";
import {
  resolveNotificationAudience,
  type NotificationPermissionTarget,
} from "../notifications/notification-audience.service";
import { getCompanyProcurementSettings } from "../procurement/company-procurement-settings.service";
import {
  formatNotificationIdentityBody,
  loadNotificationIdentityFacts,
} from "../notifications/notification-email-context";
import { formatNotificationTitle, formatSupplierInvoiceCode } from "../notifications/notification-copy";
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

async function resolveApPaymentEmailEnabled(
  companyId: string,
  ctx: ServiceContext,
): Promise<boolean> {
  try {
    const settings = await getCompanyProcurementSettings(companyId, ctx);
    return settings.apPaymentNotificationChannel === "IN_APP_AND_EMAIL";
  } catch {
    // Fail open to email+in-app ([D-070] default) so a settings glitch does not silence alerts.
    return true;
  }
}

async function notifyApPaymentWorkflow(params: {
  ctx: ServiceContext;
  recipients?: string[];
  permissionTargets?: NotificationPermissionTarget[];
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
    permissionTargets: params.permissionTargets,
    excludeUserId: params.excludeUserId,
    alwaysCcOwnerAdmin: params.alwaysCcOwnerAdmin ?? true,
  });

  const sendEmail = await resolveApPaymentEmailEnabled(params.companyId, params.ctx);

  for (const recipientUserId of unique) {
    try {
      const { id: notificationId } = await createSystemNotification({
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
      // [D-070] Email only when company channel is IN_APP_AND_EMAIL; best-effort.
      if (sendEmail) {
        await sendNotificationEmailAsSystem(notificationId, params.ctx).catch(() => undefined);
      }
    } catch {
      /* best-effort — never abort payment / issue flows */
    }
  }
}

/**
 * After a project supplier invoice is ISSUED → payable OPEN: alert finance/treasury + OWNER/ADMIN.
 * Channel: company `apPaymentNotificationChannel` ([D-070]).
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
  const invCode = formatSupplierInvoiceCode(params.invoiceNumber);
  const ocPart = params.purchaseOrderCode
    ? ` vinculada a ${params.purchaseOrderCode}`
    : params.purchaseOrderId
      ? " vinculada a una OC"
      : "";
  // Deep-link to pay form ([D-069]): finance should act, not land on OC detail.
  const actionUrl = `/proyectos/${params.projectId}/cuentas-por-pagar/${params.payableId}/pagar`;
  const facts = await loadNotificationIdentityFacts({
    tenantId: params.ctx.tenantId,
    companyId: params.companyId,
    projectId: params.projectId,
    actorUserId: params.ctx.actorUserId,
  });

  await notifyApPaymentWorkflow({
    ctx: params.ctx,
    recipients,
    type: "PAYABLE_READY_TO_PAY",
    title: formatNotificationTitle("Listo para pagar", invCode),
    body: formatNotificationIdentityBody(
      `La factura ${invCode}${ocPart} (${params.amountLabel}) tiene CxP abierta. Elegí la cuenta de tesorería y registrá el pago.`,
      facts,
    ),
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
 * After Payment CONFIRMED: notify procurement (+ OWNER/ADMIN CC). Channel [D-070].
 */
export async function notifyPaymentConfirmed(params: {
  ctx: ServiceContext;
  supplierInvoiceId: string;
  projectId: string | null;
  companyId: string;
  invoiceNumber: number;
  amountLabel: string;
  accountName: string;
}): Promise<void> {
  const invCode = formatSupplierInvoiceCode(params.invoiceNumber);
  const actionUrl = params.projectId
    ? `/proyectos/${params.projectId}/facturas-proveedor/${params.supplierInvoiceId}`
    : `/finanzas/facturas-proveedor/${params.supplierInvoiceId}`;
  const facts = await loadNotificationIdentityFacts({
    tenantId: params.ctx.tenantId,
    companyId: params.companyId,
    projectId: params.projectId,
    actorUserId: params.ctx.actorUserId,
  });

  await notifyApPaymentWorkflow({
    ctx: params.ctx,
    permissionTargets: [{ action: "EDIT", module: "PROCUREMENT" }],
    type: "PAYMENT_CONFIRMED",
    title: formatNotificationTitle("Pago confirmado", invCode),
    body: formatNotificationIdentityBody(
      `Se confirmó el pago de ${params.amountLabel} de ${invCode} desde ${params.accountName}.`,
      facts,
    ),
    severity: "SUCCESS",
    linkedEntityType: "SUPPLIER_INVOICE",
    linkedEntityId: params.supplierInvoiceId,
    projectId: params.projectId,
    companyId: params.companyId,
    actionUrl,
    excludeUserId: params.ctx.actorUserId,
    alwaysCcOwnerAdmin: true,
  });
}
