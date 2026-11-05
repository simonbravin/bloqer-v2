import type {
  EmailDeliveryStatus,
  LinkedEntityType,
  NotificationSeverity,
  NotificationType,
  Prisma,
} from "@bloqer/database";
import { prisma } from "@bloqer/database";
import { can } from "@bloqer/domain";
import { canViewCompanyAp } from "../ap/ap-access";
import { canViewCompanyAr } from "../ar/ar-access";
import { companyScopeFilter } from "../company-scope";
import { canViewDocumentByLink, documentMatchesScope, documentScopeInProject, requireDocumentParent } from "../documents/document-link-scope";
import { serializeMoneyDecimal, serializeQtyDecimal } from "../finance/money-decimal";
import { listNegativeStockBalancesForTenant } from "../inventory/stock-balance.service";
import { hasOpenObligationBalance, isObligationOverdue } from "../finance/obligation-date";
import { scheduledReportEmailCompanyScope } from "../scheduled-reports/scheduled-report-execution.service";
import { ServiceContext, ServiceError } from "../types";
import { filterNotificationAudienceForScope, resolveNotificationAudience } from "./notification-audience.service";
import { createOperationalNotificationOnce, notificationAccessWhere } from "./notification.service";
import { sendOperationalAlertEmailAsSystem } from "./notification-email.service";
import {
  resolveDocumentNotificationEntityLabel,
  staleDocumentUploadCopy,
} from "./notification-copy";
import { computeObligationBalanceDue } from "../finance/obligation-balance";

/** Re-export recipient helpers for existing call sites. */
export {
  findActiveOwnerAdminUserIds,
  findActiveUsersForPermission,
} from "./notification-audience.service";

/** In-app notification types produced by operational alert jobs (Phase 8B + [D-094] + [D-097]). */
export const OPERATIONAL_NOTIFICATION_TYPES = [
  "RECEIVABLE_OVERDUE",
  "PAYABLE_OVERDUE",
  "NEGATIVE_STOCK",
  "CERTIFICATION_APPROVED_WITHOUT_INVOICE",
  "STALE_DOCUMENT_UPLOAD",
  "PROCUREMENT_SLA_REMINDER",
  "PURCHASE_ORDER_DELIVERY_OVERDUE",
  "PURCHASE_REQUEST_NEEDED_BY_OVERDUE",
  "PURCHASE_ORDER_RECEIVED_WITHOUT_INVOICE",
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

function alertProjectScope(ctx: ServiceContext) {
  return { tenantId: ctx.tenantId, ...companyScopeFilter(ctx) };
}

function optionalAlertProjectScope(ctx: ServiceContext) {
  return { AND: [{ OR: [{ projectId: null }, { project: alertProjectScope(ctx) }] }] };
}

async function tryCreateAlert(
  ctx: ServiceContext,
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
    const created = await createOperationalNotificationOnce(input);
    if (!created) {
      summary.skippedCount += 1;
      return;
    }
    // Best-effort operational email (never abort the run for delivery issues).
    // Tagged as OPERATIONAL_ALERT so it shows up in the activity card email metrics.
    await sendOperationalAlertEmailAsSystem(created.id, ctx).catch(() => undefined);
    summary.createdCount += 1;
  } catch {
    summary.errors.push("No se pudo registrar una alerta.");
  }
}

// ─── Public runners (invoke manually or from future jobs) ────────────────────

export async function runOverdueReceivablesAlert(
  ctx: ServiceContext,
): Promise<OperationalAlertRunSummary> {
  const summary = emptySummary();
  const recipients = await resolveNotificationAudience({
    tenantId: ctx.tenantId,
    permissionTargets: [{ action: "VIEW", module: "AR" }],
  });

  const rows = await prisma.receivable.findMany({
    where: {
      tenantId: ctx.tenantId,
      ...(ctx.companyId ? { companyId: ctx.companyId } : {}),
      ...optionalAlertProjectScope(ctx),
      status: { in: ["OPEN", "PARTIAL", "OVERDUE"] },
      clientContact: { tenantId: ctx.tenantId },
      salesInvoice: { tenantId: ctx.tenantId, status: "ISSUED" },
    },
    select: {
      id: true,
      status: true,
      projectId: true,
      companyId: true,
      originalAmount: true,
      paidAmount: true,
      creditedAmount: true,
      dueDate: true,
      clientContactId: true,
      clientContact: { select: { legalName: true, fantasyName: true } },
      salesInvoiceId: true,
      salesInvoice: { select: { companyId: true, projectId: true, clientContactId: true } },
    },
  });

  for (const r of rows) {
    if (r.salesInvoice.companyId !== r.companyId || r.salesInvoice.projectId !== r.projectId ||
      r.salesInvoice.clientContactId !== r.clientContactId) continue;
    const balanceDue = computeObligationBalanceDue(r.originalAmount, r.paidAmount, r.creditedAmount);
    if (!hasOpenObligationBalance(balanceDue)) continue;
    if (!isObligationOverdue(r.dueDate)) continue;

    summary.checkedCount += 1;

    if (r.status === "OPEN" || r.status === "PARTIAL") {
      try {
        const changed = await prisma.receivable.updateMany({
          where: {
            id: r.id,
            tenantId: ctx.tenantId,
            companyId: r.companyId,
            projectId: r.projectId,
            dueDate: r.dueDate,
            originalAmount: r.originalAmount,
            paidAmount: r.paidAmount,
            creditedAmount: r.creditedAmount,
            status: { in: ["OPEN", "PARTIAL"] },
          },
          data: { status: "OVERDUE", updatedBy: ctx.actorUserId },
        });
        if (changed.count === 0) continue;
      } catch {
        summary.errors.push("No se pudo actualizar la cuenta por cobrar vencida.");
        continue;
      }
    }

    const clientName = r.clientContact.fantasyName ?? r.clientContact.legalName;
    const body = `Cliente: ${clientName}. Saldo vencido: ${serializeMoneyDecimal(balanceDue)} (venc. ${r.dueDate.toISOString().slice(0, 10)}).`;

    if (recipients.length === 0) continue;

    const receivableActionUrl = r.projectId
      ? `/proyectos/${r.projectId}/cuentas-por-cobrar/${r.id}`
      : `/finanzas/cuentas-por-cobrar/${r.id}`;

    const scopedRecipients = await filterNotificationAudienceForScope({
      tenantId: ctx.tenantId,
      companyId: r.companyId,
      projectId: r.projectId,
      candidateUserIds: recipients,
      canView: r.projectId ? (roles) => can(roles, "VIEW", "AR") : canViewCompanyAr,
    });
    for (const uid of scopedRecipients) {
      await tryCreateAlert(
        ctx,
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

export async function runOverduePayablesAlert(
  ctx: ServiceContext,
): Promise<OperationalAlertRunSummary> {
  const summary = emptySummary();
  const recipients = await resolveNotificationAudience({
    tenantId: ctx.tenantId,
    permissionTargets: [{ action: "VIEW", module: "AP" }],
  });

  const rows = await prisma.payable.findMany({
    where: {
      tenantId: ctx.tenantId,
      ...(ctx.companyId ? { companyId: ctx.companyId } : {}),
      ...optionalAlertProjectScope(ctx),
      status: { in: ["OPEN", "PARTIAL", "OVERDUE"] },
      supplierContact: { tenantId: ctx.tenantId },
      supplierInvoice: { tenantId: ctx.tenantId, status: "ISSUED" },
    },
    select: {
      id: true,
      status: true,
      projectId: true,
      companyId: true,
      originalAmount: true,
      paidAmount: true,
      creditedAmount: true,
      dueDate: true,
      supplierContactId: true,
      supplierContact: { select: { legalName: true, fantasyName: true } },
      supplierInvoiceId: true,
      supplierInvoice: { select: { companyId: true, projectId: true, supplierContactId: true } },
    },
  });

  for (const p of rows) {
    if (p.supplierInvoice.companyId !== p.companyId || p.supplierInvoice.projectId !== p.projectId ||
      p.supplierInvoice.supplierContactId !== p.supplierContactId) continue;
    const balanceDue = computeObligationBalanceDue(p.originalAmount, p.paidAmount, p.creditedAmount);
    if (!hasOpenObligationBalance(balanceDue)) continue;
    if (!isObligationOverdue(p.dueDate)) continue;

    summary.checkedCount += 1;

    if (p.status === "OPEN" || p.status === "PARTIAL") {
      try {
        const changed = await prisma.payable.updateMany({
          where: {
            id: p.id,
            tenantId: ctx.tenantId,
            companyId: p.companyId,
            projectId: p.projectId,
            dueDate: p.dueDate,
            originalAmount: p.originalAmount,
            paidAmount: p.paidAmount,
            creditedAmount: p.creditedAmount,
            status: { in: ["OPEN", "PARTIAL"] },
          },
          data: { status: "OVERDUE", updatedBy: ctx.actorUserId },
        });
        if (changed.count === 0) continue;
      } catch {
        summary.errors.push("No se pudo actualizar la cuenta por pagar vencida.");
        continue;
      }
    }

    const supplierName = p.supplierContact.fantasyName ?? p.supplierContact.legalName;
    const body = `Proveedor: ${supplierName}. Saldo vencido: ${serializeMoneyDecimal(balanceDue)} (venc. ${p.dueDate.toISOString().slice(0, 10)}).`;

    if (recipients.length === 0) continue;

    const payableActionUrl = p.projectId
      ? `/proyectos/${p.projectId}/cuentas-por-pagar/${p.id}`
      : `/finanzas/cuentas-por-pagar/${p.id}`;

    const scopedRecipients = await filterNotificationAudienceForScope({
      tenantId: ctx.tenantId,
      companyId: p.companyId,
      projectId: p.projectId,
      candidateUserIds: recipients,
      canView: p.projectId ? (roles) => can(roles, "VIEW", "AP") : canViewCompanyAp,
    });
    for (const uid of scopedRecipients) {
      await tryCreateAlert(
        ctx,
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

function negativeStockLinkedEntityId(row: {
  productId: string;
  warehouseId: string;
  projectId: string | null;
  wbsNodeId: string | null;
}): string {
  return `negstock:${row.productId}:${row.warehouseId}:${row.projectId ?? "_"}:${row.wbsNodeId ?? "_"}`;
}

export async function runNegativeStockAlert(
  ctx: ServiceContext,
): Promise<OperationalAlertRunSummary> {
  const summary = emptySummary();
  const recipients = await resolveNotificationAudience({
    tenantId: ctx.tenantId,
    permissionTargets: [{ action: "VIEW", module: "INVENTORY" }],
  });

  const negatives = (await listNegativeStockBalancesForTenant({ tenantId: ctx.tenantId })).filter(
    (row) => !ctx.companyId || row.companyId === ctx.companyId,
  );
  const productIds = [...new Set(negatives.map((row) => row.productId))];
  const warehouseIds = [...new Set(negatives.map((row) => row.warehouseId))];
  const [products, warehouses] = await Promise.all([
    productIds.length === 0
      ? Promise.resolve([])
      : prisma.product.findMany({
          where: { id: { in: productIds }, tenantId: ctx.tenantId },
          select: { id: true, sku: true, name: true },
        }),
    warehouseIds.length === 0
      ? Promise.resolve([])
      : prisma.warehouse.findMany({
          where: { id: { in: warehouseIds }, tenantId: ctx.tenantId },
          select: { id: true, name: true },
        }),
  ]);
  const productById = new Map(products.map((p) => [p.id, p]));
  const warehouseById = new Map(warehouses.map((w) => [w.id, w]));

  for (const row of negatives) {
    summary.checkedCount += 1;
    const linkedId = negativeStockLinkedEntityId(row);
    const product = productById.get(row.productId);
    const warehouse = warehouseById.get(row.warehouseId);
    const productLabel = product
      ? product.sku.trim()
        ? `${product.sku.trim()} — ${product.name}`
        : product.name
      : row.productId;
    const warehouseLabel = warehouse?.name.trim() || row.warehouseId;
    const body = `Producto ${productLabel}. Depósito ${warehouseLabel}. Cantidad: ${serializeQtyDecimal(row.totalQuantity)}.`;

    if (recipients.length === 0) continue;

    const scopedRecipients = await filterNotificationAudienceForScope({
      tenantId: ctx.tenantId,
      companyId: row.companyId,
      projectId: row.projectId,
      candidateUserIds: recipients,
      canView: (roles) => can(roles, "VIEW", "INVENTORY"),
    });
    for (const uid of scopedRecipients) {
      await tryCreateAlert(
        ctx,
        {
          tenantId: ctx.tenantId,
          recipientUserId: uid,
          type: "NEGATIVE_STOCK",
          companyId: row.companyId,
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

export async function runApprovedCertificationsWithoutInvoiceAlert(
  ctx: ServiceContext,
): Promise<OperationalAlertRunSummary> {
  const summary = emptySummary();
  const recipients = await resolveNotificationAudience({
    tenantId: ctx.tenantId,
    permissionTargets: [
      { action: "VIEW", module: "AR" },
      { action: "VIEW", module: "CERTIFICATIONS" },
    ],
  });

  const rows = await prisma.certification.findMany({
    where: {
      tenantId: ctx.tenantId,
      ...companyScopeFilter(ctx),
      project: alertProjectScope(ctx),
      status: "APPROVED",
    },
    select: {
      id: true,
      projectId: true,
      companyId: true,
      number: true,
      salesInvoices: {
        where: { tenantId: ctx.tenantId, status: "ISSUED", documentKind: "INVOICE" },
        select: { companyId: true, projectId: true },
      },
    },
  });

  for (const c of rows) {
    if (c.salesInvoices.some((invoice) => invoice.projectId === c.projectId &&
      (c.companyId === null || invoice.companyId === c.companyId))) continue;
    summary.checkedCount += 1;
    const body = `La certificación CERT-${String(c.number).padStart(3, "0")} está aprobada sin factura de venta emitida.`;

    if (recipients.length === 0) continue;

    const scopedRecipients = await filterNotificationAudienceForScope({
      tenantId: ctx.tenantId,
      companyId: c.companyId,
      projectId: c.projectId,
      candidateUserIds: recipients,
      canView: (roles) => can(roles, "VIEW", "AR") || can(roles, "VIEW", "CERTIFICATIONS"),
    });
    for (const uid of scopedRecipients) {
      await tryCreateAlert(
        ctx,
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

export async function runStaleUploadingDocumentsAlert(
  ctx: ServiceContext,
): Promise<OperationalAlertRunSummary> {
  const summary = emptySummary();
  const threshold = new Date(Date.now() - STALE_UPLOAD_MS);

  const docs = await prisma.documentAttachment.findMany({
    where: {
      tenantId: ctx.tenantId,
      ...companyScopeFilter(ctx),
      ...optionalAlertProjectScope(ctx),
      status: "UPLOADING",
      createdAt: { lt: threshold },
    },
    select: {
      id: true,
      tenantId: true,
      projectId: true,
      project: { select: { id: true, tenantId: true, companyId: true } },
      companyId: true,
      originalFileName: true,
      uploadedBy: true,
      linkedEntityType: true,
      linkedEntityId: true,
      category: true,
    },
  });

  for (const d of docs) {
    let companyId: string | null;
    try {
      const parent = d.linkedEntityType && d.linkedEntityType !== "PROJECT" && d.linkedEntityId
        ? await requireDocumentParent(d.linkedEntityType, d.linkedEntityId, ctx)
        : d.project && (
            (d.linkedEntityType === null && d.linkedEntityId === null) ||
            (d.linkedEntityType === "PROJECT" && d.linkedEntityId === d.project.id)
          )
          ? { ...d.project, projectId: d.project.id }
          : null;
      const target = parent && d.project ? documentScopeInProject(parent, d.project) : parent;
      if (!target || !documentMatchesScope(d, target, ctx)) continue;
      companyId = d.companyId ?? target.companyId;
    } catch (error) {
      if (error instanceof ServiceError && ["NOT_FOUND", "FORBIDDEN"].includes(error.code)) continue;
      throw error;
    }
    summary.checkedCount += 1;
    const uploader = d.uploadedBy?.trim();
    const recipientIds = await resolveNotificationAudience({
      tenantId: ctx.tenantId,
      primaryUserIds: uploader ? [uploader] : [],
    });
    if (recipientIds.length === 0) continue;

    const actionUrl = d.projectId ? `/proyectos/${d.projectId}/documentos/${d.id}` : null;
    const entityLabel = await resolveDocumentNotificationEntityLabel({
      tenantId: ctx.tenantId,
      linkedEntityType: d.linkedEntityType,
      linkedEntityId: d.linkedEntityId,
      projectId: d.projectId,
    });
    const { title, body } = staleDocumentUploadCopy({
      fileName: d.originalFileName,
      entityLabel,
      category: d.category,
    });

    const scopedRecipients = await filterNotificationAudienceForScope({
      tenantId: ctx.tenantId,
      companyId,
      projectId: d.projectId,
      candidateUserIds: recipientIds,
      canView: (roles) => canViewDocumentByLink(d.linkedEntityType, roles, d.projectId),
    });
    for (const uid of scopedRecipients) {
      await tryCreateAlert(
        ctx,
        {
          tenantId: ctx.tenantId,
          companyId,
          recipientUserId: uid,
          type: "STALE_DOCUMENT_UPLOAD",
          title,
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
  const [notificationScope, deliveryScope] = await Promise.all([
    notificationAccessWhere(ctx),
    scheduledReportEmailCompanyScope(ctx),
  ]);

  const [latest, grouped, lastEmail] = await Promise.all([
    prisma.notification.findFirst({
      where: { ...notificationScope, type: { in: types } },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    prisma.notification.groupBy({
      by: ["type"],
      where: {
        ...notificationScope,
        type: { in: types },
        createdAt: { gte: since },
      },
      _count: { _all: true },
      _max: { createdAt: true },
    }),
    prisma.emailDeliveryLog.findFirst({
      where: { tenantId: ctx.tenantId, ...deliveryScope, emailType: "OPERATIONAL_ALERT" },
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
