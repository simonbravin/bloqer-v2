import type { EmailDeliveryStatus, LinkedEntityType, NotificationSeverity, NotificationType, Prisma } from "@bloqer/database";
import { prisma } from "@bloqer/database";
import { can, type PermissionAction, type PermissionModule } from "@bloqer/domain";
import { listNegativeStockBalancesForTenant } from "../inventory/stock-balance.service";
import { hasOpenObligationBalance, isObligationOverdue } from "../finance/obligation-date";
import { ServiceContext, ServiceError } from "../types";
import { createSystemNotification } from "./notification.service";

/** Rolling window to avoid duplicate operational alerts for the same entity + recipient. */
const DEDUP_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** In-app notification types produced by operational alert jobs (Phase 8B). */
export const OPERATIONAL_NOTIFICATION_TYPES = [
  "RECEIVABLE_OVERDUE",
  "PAYABLE_OVERDUE",
  "NEGATIVE_STOCK",
  "CERTIFICATION_APPROVED_WITHOUT_INVOICE",
  "STALE_DOCUMENT_UPLOAD",
] as const satisfies readonly NotificationType[];

export type OperationalNotificationType = (typeof OPERATIONAL_NOTIFICATION_TYPES)[number];

const ACTIVITY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export type OperationalAlertRunSummary = {
  checkedCount: number;
  createdCount: number;
  skippedCount: number;
  errors: string[];
};

function emptySummary(): OperationalAlertRunSummary {
  return { checkedCount: 0, createdCount: 0, skippedCount: 0, errors: [] };
}

/**
 * Active memberships in the tenant whose combined roles satisfy `can(roles, action, module)`.
 */
export async function findActiveUsersForPermission(
  tenantId: string,
  action: PermissionAction,
  module: PermissionModule,
): Promise<string[]> {
  const memberships = await prisma.userMembership.findMany({
    where: { tenantId, status: "ACTIVE" },
    select: { userId: true, roles: true },
  });
  const out: string[] = [];
  for (const m of memberships) {
    if (can(m.roles, action, module)) out.push(m.userId);
  }
  return [...new Set(out)];
}

/** OWNER or ADMIN active memberships (fallback recipients). */
export async function findActiveOwnerAdminUserIds(tenantId: string): Promise<string[]> {
  const rows = await prisma.userMembership.findMany({
    where: {
      tenantId,
      status: "ACTIVE",
      OR: [{ roles: { has: "OWNER" } }, { roles: { has: "ADMIN" } }],
    },
    select: { userId: true },
  });
  return [...new Set(rows.map((r) => r.userId))];
}

async function hasActiveMembership(tenantId: string, userId: string): Promise<boolean> {
  const m = await prisma.userMembership.findFirst({
    where: { tenantId, userId, status: "ACTIVE" },
    select: { id: true },
  });
  return Boolean(m);
}

async function hasRecentDuplicate(params: {
  tenantId: string;
  type: NotificationType;
  linkedEntityType: LinkedEntityType | null;
  linkedEntityId: string | null;
  recipientUserId: string;
}): Promise<boolean> {
  const since = new Date(Date.now() - DEDUP_WINDOW_MS);
  const found = await prisma.notification.findFirst({
    where: {
      tenantId: params.tenantId,
      type: params.type,
      linkedEntityType: params.linkedEntityType,
      linkedEntityId: params.linkedEntityId,
      recipientUserId: params.recipientUserId,
      status: { not: "ARCHIVED" },
      createdAt: { gte: since },
    },
    select: { id: true },
  });
  return Boolean(found);
}

async function tryCreateAlert(
  input: {
    tenantId: string;
    companyId?: string | null;
    recipientUserId: string;
    type: NotificationType;
    title: string;
    body: string;
    severity: NotificationSeverity;
    linkedEntityType: LinkedEntityType | null;
    linkedEntityId: string | null;
    projectId: string | null;
    actionUrl: string | null;
    metadata?: Prisma.JsonObject | null;
  },
  summary: OperationalAlertRunSummary,
): Promise<void> {
  try {
    const dup = await hasRecentDuplicate({
      tenantId: input.tenantId,
      type: input.type,
      linkedEntityType: input.linkedEntityType,
      linkedEntityId: input.linkedEntityId,
      recipientUserId: input.recipientUserId,
    });
    if (dup) {
      summary.skippedCount += 1;
      return;
    }
    await createSystemNotification(input);
    summary.createdCount += 1;
  } catch (e) {
    summary.errors.push(e instanceof Error ? e.message : String(e));
  }
}

function mergeUniqueUserIds(...lists: string[][]): string[] {
  return [...new Set(lists.flat())];
}

// ─── Public runners (invoke manually or from future jobs) ────────────────────

export async function runOverdueReceivablesAlert(ctx: ServiceContext): Promise<OperationalAlertRunSummary> {
  const summary = emptySummary();
  const recipients = await findActiveUsersForPermission(ctx.tenantId, "VIEW", "AR");

  const rows = await prisma.receivable.findMany({
    where: {
      tenantId: ctx.tenantId,
      status: { in: ["OPEN", "PARTIAL", "OVERDUE"] },
    },
    select: {
      id: true,
      projectId: true,
      companyId: true,
      originalAmount: true,
      paidAmount: true,
      dueDate: true,
      clientContact: { select: { legalName: true, fantasyName: true } },
      salesInvoiceId: true,
    },
  });

  for (const r of rows) {
    const balanceDue = r.originalAmount.minus(r.paidAmount);
    if (!hasOpenObligationBalance(balanceDue)) continue;
    if (!isObligationOverdue(r.dueDate)) continue;

    summary.checkedCount += 1;
    const clientName = r.clientContact.fantasyName ?? r.clientContact.legalName;
    const body = `Cliente: ${clientName}. Saldo vencido: ${balanceDue.toString()} (venc. ${r.dueDate.toISOString().slice(0, 10)}).`;

    if (recipients.length === 0) continue;

    const receivableActionUrl = r.projectId
      ? `/proyectos/${r.projectId}/cuentas-por-cobrar/${r.id}`
      : `/finanzas/cuentas-por-cobrar/${r.id}`;

    for (const uid of recipients) {
      await tryCreateAlert(
        {
          tenantId: ctx.tenantId,
          companyId: r.companyId,
          recipientUserId: uid,
          type: "RECEIVABLE_OVERDUE",
          title: "Cuenta por cobrar vencida",
          body,
          severity: "WARNING",
          linkedEntityType: "SALES_INVOICE",
          linkedEntityId: r.salesInvoiceId,
          projectId: r.projectId,
          actionUrl: receivableActionUrl,
          metadata: { receivableId: r.id },
        },
        summary,
      );
    }
  }

  return summary;
}

export async function runOverduePayablesAlert(ctx: ServiceContext): Promise<OperationalAlertRunSummary> {
  const summary = emptySummary();
  const recipients = await findActiveUsersForPermission(ctx.tenantId, "VIEW", "AP");

  const rows = await prisma.payable.findMany({
    where: {
      tenantId: ctx.tenantId,
      status: { in: ["OPEN", "PARTIAL", "OVERDUE"] },
    },
    select: {
      id: true,
      projectId: true,
      companyId: true,
      originalAmount: true,
      paidAmount: true,
      dueDate: true,
      supplierContact: { select: { legalName: true, fantasyName: true } },
      supplierInvoiceId: true,
    },
  });

  for (const p of rows) {
    const balanceDue = p.originalAmount.minus(p.paidAmount);
    if (!hasOpenObligationBalance(balanceDue)) continue;
    if (!isObligationOverdue(p.dueDate)) continue;

    summary.checkedCount += 1;
    const supplierName = p.supplierContact.fantasyName ?? p.supplierContact.legalName;
    const body = `Proveedor: ${supplierName}. Saldo vencido: ${balanceDue.toString()} (venc. ${p.dueDate.toISOString().slice(0, 10)}).`;

    if (recipients.length === 0) continue;

    const payableActionUrl = p.projectId
      ? `/proyectos/${p.projectId}/cuentas-por-pagar/${p.id}`
      : `/finanzas/cuentas-por-pagar/${p.id}`;

    for (const uid of recipients) {
      await tryCreateAlert(
        {
          tenantId: ctx.tenantId,
          companyId: p.companyId,
          recipientUserId: uid,
          type: "PAYABLE_OVERDUE",
          title: "Cuenta por pagar vencida",
          body,
          severity: "WARNING",
          linkedEntityType: "SUPPLIER_INVOICE",
          linkedEntityId: p.supplierInvoiceId,
          projectId: p.projectId,
          actionUrl: payableActionUrl,
          metadata: { payableId: p.id },
        },
        summary,
      );
    }
  }

  return summary;
}

function negativeStockLinkedEntityId(row: { productId: string; warehouseId: string; projectId: string | null; wbsNodeId: string | null }): string {
  return `negstock:${row.productId}:${row.warehouseId}:${row.projectId ?? "_"}:${row.wbsNodeId ?? "_"}`;
}

export async function runNegativeStockAlert(ctx: ServiceContext): Promise<OperationalAlertRunSummary> {
  const summary = emptySummary();
  const recipients = await findActiveUsersForPermission(ctx.tenantId, "VIEW", "INVENTORY");

  const negatives = await listNegativeStockBalancesForTenant({ tenantId: ctx.tenantId });

  for (const row of negatives) {
    summary.checkedCount += 1;
    const linkedId = negativeStockLinkedEntityId(row);
    const body = `Producto ${row.productId}, depósito ${row.warehouseId}. Cantidad: ${row.totalQuantity}.`;

    if (recipients.length === 0) continue;

    for (const uid of recipients) {
      await tryCreateAlert(
        {
          tenantId: ctx.tenantId,
          recipientUserId: uid,
          type: "NEGATIVE_STOCK",
          title: "Stock negativo detectado",
          body,
          severity: "ERROR",
          linkedEntityType: "OTHER",
          linkedEntityId: linkedId,
          projectId: row.projectId,
          actionUrl: "/inventario/reportes/stock",
          metadata: {
            productId: row.productId,
            warehouseId: row.warehouseId,
            projectId: row.projectId,
            wbsNodeId: row.wbsNodeId,
          },
        },
        summary,
      );
    }
  }

  return summary;
}

export async function runApprovedCertificationsWithoutInvoiceAlert(ctx: ServiceContext): Promise<OperationalAlertRunSummary> {
  const summary = emptySummary();
  const arRecipients = await findActiveUsersForPermission(ctx.tenantId, "VIEW", "AR");
  const certRecipients = await findActiveUsersForPermission(ctx.tenantId, "VIEW", "CERTIFICATIONS");
  const recipients = mergeUniqueUserIds(arRecipients, certRecipients);

  const rows = await prisma.certification.findMany({
    where: {
      tenantId: ctx.tenantId,
      status: "APPROVED",
      salesInvoices: { none: { status: "ISSUED" } },
    },
    select: { id: true, projectId: true, companyId: true, number: true },
  });

  for (const c of rows) {
    summary.checkedCount += 1;
    const body = `Certificación n.º ${c.number} aprobada sin factura de venta emitida.`;

    if (recipients.length === 0) continue;

    for (const uid of recipients) {
      await tryCreateAlert(
        {
          tenantId: ctx.tenantId,
          companyId: c.companyId,
          recipientUserId: uid,
          type: "CERTIFICATION_APPROVED_WITHOUT_INVOICE",
          title: "Certificación aprobada sin factura",
          body,
          severity: "WARNING",
          linkedEntityType: "CERTIFICATION",
          linkedEntityId: c.id,
          projectId: c.projectId,
          actionUrl: `/proyectos/${c.projectId}/certificaciones/${c.id}`,
          metadata: { certificationNumber: c.number },
        },
        summary,
      );
    }
  }

  return summary;
}

const STALE_UPLOAD_MS = 60 * 60 * 1000;

export async function runStaleUploadingDocumentsAlert(ctx: ServiceContext): Promise<OperationalAlertRunSummary> {
  const summary = emptySummary();
  const threshold = new Date(Date.now() - STALE_UPLOAD_MS);

  const docs = await prisma.documentAttachment.findMany({
    where: {
      tenantId: ctx.tenantId,
      status: "UPLOADING",
      createdAt: { lt: threshold },
    },
    select: {
      id: true,
      projectId: true,
      companyId: true,
      originalFileName: true,
      uploadedBy: true,
    },
  });

  const ownerAdmins = await findActiveOwnerAdminUserIds(ctx.tenantId);

  for (const d of docs) {
    summary.checkedCount += 1;
    const uploader = d.uploadedBy?.trim();
    let recipientIds: string[] = [];
    if (uploader && (await hasActiveMembership(ctx.tenantId, uploader))) {
      recipientIds = [uploader];
    } else {
      recipientIds = ownerAdmins;
    }
    if (recipientIds.length === 0) continue;

    const actionUrl = d.projectId ? `/proyectos/${d.projectId}/documentos/${d.id}` : null;
    const body = `El archivo «${d.originalFileName}» sigue en estado de carga (iniciado hace más de 1 h).`;

    for (const uid of recipientIds) {
      await tryCreateAlert(
        {
          tenantId: ctx.tenantId,
          companyId: d.companyId,
          recipientUserId: uid,
          type: "STALE_DOCUMENT_UPLOAD",
          title: "Carga de documento pendiente",
          body,
          severity: "WARNING",
          linkedEntityType: "OTHER",
          linkedEntityId: d.id,
          projectId: d.projectId,
          actionUrl,
          metadata: { documentId: d.id },
        },
        summary,
      );
    }
  }

  return summary;
}

export type OperationalAlertsLastActivity = {
  /** ISO timestamp of the newest operational alert notification in the tenant, if any. */
  lastNotificationAt: string | null;
  /** Count of operational alert notifications created in the last 7 days. */
  notificationsLast7Days: number;
  byType: Array<{
    type: OperationalNotificationType;
    count: number;
    lastAt: string;
  }>;
  lastEmailAt: string | null;
  lastEmailStatus: EmailDeliveryStatus | null;
};

/**
 * Lightweight “last activity” for ops — aggregates existing Notification + EmailDeliveryLog rows.
 * No new tables or job history; OWNER/ADMIN only.
 */
export async function getOperationalAlertsLastActivity(
  ctx: ServiceContext,
): Promise<OperationalAlertsLastActivity> {
  if (!ctx.roles.some((r) => r === "OWNER" || r === "ADMIN")) {
    throw new ServiceError("FORBIDDEN", "Solo OWNER o ADMIN pueden ver actividad de alertas");
  }

  const types = [...OPERATIONAL_NOTIFICATION_TYPES];
  const since = new Date(Date.now() - ACTIVITY_WINDOW_MS);

  const [latest, grouped, lastEmail] = await Promise.all([
    prisma.notification.findFirst({
      where: { tenantId: ctx.tenantId, type: { in: types } },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    prisma.notification.groupBy({
      by: ["type"],
      where: {
        tenantId: ctx.tenantId,
        type: { in: types },
        createdAt: { gte: since },
      },
      _count: { _all: true },
      _max: { createdAt: true },
    }),
    prisma.emailDeliveryLog.findFirst({
      where: { tenantId: ctx.tenantId, emailType: "OPERATIONAL_ALERT" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, status: true },
    }),
  ]);

  const byType = grouped
    .filter((g): g is typeof g & { type: OperationalNotificationType } =>
      (OPERATIONAL_NOTIFICATION_TYPES as readonly string[]).includes(g.type),
    )
    .map((g) => ({
      type: g.type,
      count: g._count._all,
      lastAt: (g._max.createdAt ?? since).toISOString(),
    }))
    .sort((a, b) => b.count - a.count);

  return {
    lastNotificationAt: latest?.createdAt.toISOString() ?? null,
    notificationsLast7Days: byType.reduce((n, r) => n + r.count, 0),
    byType,
    lastEmailAt: lastEmail?.createdAt.toISOString() ?? null,
    lastEmailStatus: lastEmail?.status ?? null,
  };
}
