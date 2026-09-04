import type { LinkedEntityType, NotificationType, Prisma } from "@bloqer/database";
import { prisma } from "@bloqer/database";
import { createSystemNotification } from "../notifications/notification.service";
import { sendOperationalAlertEmailAsSystem } from "../notifications/notification-email.service";
import {
  findActiveOwnerAdminUserIds,
  resolveNotificationAudience,
  type NotificationPermissionTarget,
} from "../notifications/notification-audience.service";
import {
  formatNotificationIdentityBody,
  loadNotificationIdentityFacts,
} from "../notifications/notification-email-context";
import { formatNotificationTitle } from "../notifications/notification-copy";
import { getCompanyProcurementSettings } from "./company-procurement-settings.service";
import type { ServiceContext } from "../types";

/**
 * Procurement overdue alerts ([D-097]).
 *
 * Three daily runners feed the operational alerts cron:
 *  - PURCHASE_ORDER_DELIVERY_OVERDUE ([BR-PUR-018])
 *  - PURCHASE_REQUEST_NEEDED_BY_OVERDUE ([BR-PUR-019])
 *  - PURCHASE_ORDER_RECEIVED_WITHOUT_INVOICE ([BR-PUR-020])
 *
 * All follow the same shape as `runProcurementSlaReminders`: per-tenant, per-company opt-out
 * from `CompanyProcurementSettings`, 7-day dedup window per (type, entity, recipient).
 */

const DEDUP_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Who can register a receipt (mirror of PO_RECEIPT_AUDIENCE in procurement-notifications). */
const PO_RECEIPT_AUDIENCE: NotificationPermissionTarget[] = [
  { action: "EDIT", module: "PURCHASE_ORDERS" },
  { action: "EDIT", module: "PROCUREMENT" },
  { action: "EDIT", module: "INVENTORY" },
];

/** Who can shepherd an SC forward (approvers of PR / PO). */
const PR_APPROVER_AUDIENCE: NotificationPermissionTarget[] = [
  { action: "APPROVE", module: "PURCHASE_REQUESTS" },
  { action: "APPROVE", module: "PURCHASE_ORDERS" },
  { action: "EDIT", module: "PROCUREMENT" },
];

/** Who can register a supplier invoice / manage AP. */
const AP_AUDIENCE: NotificationPermissionTarget[] = [
  { action: "EDIT", module: "AP" },
  { action: "APPROVE", module: "AP" },
];

export type ProcurementOverdueRunSummary = {
  checkedCount: number;
  createdCount: number;
  skippedCount: number;
};

function emptySummary(): ProcurementOverdueRunSummary {
  return { checkedCount: 0, createdCount: 0, skippedCount: 0 };
}

/** UTC midnight of a reference (today by default), aligned to Prisma @db.Date semantics. */
export function todayUtcDate(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** Whole days elapsed between `reference` and today (UTC midnights). Never negative. */
export function daysOverdue(reference: Date, now: Date = new Date()): number {
  const today = todayUtcDate(now).getTime();
  const ref = new Date(
    Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), reference.getUTCDate()),
  ).getTime();
  return Math.max(0, Math.floor((today - ref) / DAY_MS));
}

async function hasRecentDuplicate(params: {
  tenantId: string;
  type: NotificationType;
  linkedEntityType: LinkedEntityType;
  linkedEntityId: string;
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

async function fanOut(params: {
  ctx: ServiceContext;
  candidates: string[];
  tenantId: string;
  companyId: string | null;
  projectId: string | null;
  type: NotificationType;
  linkedEntityType: LinkedEntityType;
  linkedEntityId: string;
  title: string;
  body: string;
  severity: "INFO" | "WARNING" | "SUCCESS";
  actionUrl: string;
  metadata?: Prisma.JsonObject | null;
  summary: ProcurementOverdueRunSummary;
}): Promise<void> {
  for (const recipientUserId of params.candidates) {
    const dup = await hasRecentDuplicate({
      tenantId: params.tenantId,
      type: params.type,
      linkedEntityType: params.linkedEntityType,
      linkedEntityId: params.linkedEntityId,
      recipientUserId,
    });
    if (dup) {
      params.summary.skippedCount += 1;
      continue;
    }
    try {
      const { id: notificationId } = await createSystemNotification({
        tenantId: params.tenantId,
        companyId: params.companyId ?? null,
        recipientUserId,
        type: params.type,
        title: params.title,
        body: params.body,
        severity: params.severity,
        linkedEntityType: params.linkedEntityType,
        linkedEntityId: params.linkedEntityId,
        projectId: params.projectId,
        actionUrl: params.actionUrl,
        metadata: params.metadata ?? undefined,
      });
      // Best-effort operational email (D-050 / BR-PUR-015 / D-097). Tagged as
      // OPERATIONAL_ALERT so it aparece en el activity card + `/notificaciones/emails`.
      await sendOperationalAlertEmailAsSystem(notificationId, params.ctx).catch(() => undefined);
      params.summary.createdCount += 1;
    } catch {
      /* best-effort per recipient */
    }
  }
}

// ─── A. PO delivery overdue ─────────────────────────────────────────────────

/**
 * PO status IN (CONFIRMED, PARTIALLY_RECEIVED) AND expectedDeliveryDate < today − graceDays.
 * Audience: PO_RECEIPT_AUDIENCE + CC OWNER/ADMIN. Dedup 7d.
 */
export async function runPurchaseOrderDeliveryOverdueAlert(
  ctx: ServiceContext,
): Promise<ProcurementOverdueRunSummary> {
  const summary = emptySummary();
  const owners = await findActiveOwnerAdminUserIds(ctx.tenantId);

  const companies = await prisma.company.findMany({
    where: { tenantId: ctx.tenantId, status: "ACTIVE" },
    select: { id: true },
  });

  for (const company of companies) {
    const settings = await getCompanyProcurementSettings(company.id, ctx);
    if (!settings.deliveryAlertsEnabled) continue;
    const cutoff = new Date(
      todayUtcDate().getTime() - settings.deliveryOverdueGraceDays * DAY_MS,
    );

    const pos = await prisma.purchaseOrder.findMany({
      where: {
        tenantId: ctx.tenantId,
        companyId: company.id,
        status: { in: ["CONFIRMED", "PARTIALLY_RECEIVED"] },
        expectedDeliveryDate: { lt: cutoff },
      },
      select: {
        id: true,
        number: true,
        projectId: true,
        companyId: true,
        status: true,
        expectedDeliveryDate: true,
        supplierContact: { select: { fantasyName: true, legalName: true } },
      },
    });

    if (pos.length === 0) continue;

    const audience = await resolveNotificationAudience({
      tenantId: ctx.tenantId,
      permissionTargets: PO_RECEIPT_AUDIENCE,
      alwaysCcOwnerAdmin: true,
    });
    const candidates = [...new Set([...audience, ...owners])];
    if (candidates.length === 0) continue;

    for (const po of pos) {
      summary.checkedCount += 1;
      const code = `OC-${String(po.number).padStart(3, "0")}`;
      const overdue = daysOverdue(po.expectedDeliveryDate!);
      const supplierName =
        po.supplierContact.fantasyName ?? po.supplierContact.legalName;
      const partial = po.status === "PARTIALLY_RECEIVED" ? " (parcialmente recibida)" : "";
      const facts = await loadNotificationIdentityFacts({
        tenantId: ctx.tenantId,
        companyId: po.companyId,
        projectId: po.projectId,
      });
      await fanOut({
        ctx,
        candidates,
        tenantId: ctx.tenantId,
        companyId: po.companyId,
        projectId: po.projectId,
        type: "PURCHASE_ORDER_DELIVERY_OVERDUE",
        linkedEntityType: "PURCHASE_ORDER",
        linkedEntityId: po.id,
        title: formatNotificationTitle("Entrega vencida", code),
        body: formatNotificationIdentityBody(
          `La orden ${code}${partial} tiene entrega prevista vencida hace ${overdue} día(s). Proveedor: ${supplierName}. Confirmá recepción o coordiná con el proveedor.`,
          facts,
        ),
        severity: "WARNING",
        actionUrl: `/proyectos/${po.projectId}/ordenes-compra/${po.id}/recepciones/nueva`,
        metadata: { overdueDays: overdue },
        summary,
      });
    }
  }

  return summary;
}

// ─── B. PR needed-by overdue ────────────────────────────────────────────────

/**
 * PR status IN (SUBMITTED, QUOTE_SELECTED) AND neededByDate < today − graceDays AND no PO in
 * CONFIRMED/PARTIALLY_RECEIVED/RECEIVED for the PR.
 * Audience: PR_APPROVER_AUDIENCE + CC OWNER/ADMIN. Dedup 7d.
 */
export async function runPurchaseRequestNeededByOverdueAlert(
  ctx: ServiceContext,
): Promise<ProcurementOverdueRunSummary> {
  const summary = emptySummary();
  const owners = await findActiveOwnerAdminUserIds(ctx.tenantId);

  const companies = await prisma.company.findMany({
    where: { tenantId: ctx.tenantId, status: "ACTIVE" },
    select: { id: true },
  });

  for (const company of companies) {
    const settings = await getCompanyProcurementSettings(company.id, ctx);
    if (!settings.neededByAlertsEnabled) continue;
    const cutoff = new Date(
      todayUtcDate().getTime() - settings.neededByOverdueGraceDays * DAY_MS,
    );

    const prs = await prisma.purchaseRequest.findMany({
      where: {
        tenantId: ctx.tenantId,
        companyId: company.id,
        status: { in: ["SUBMITTED", "QUOTE_SELECTED"] },
        neededByDate: { lt: cutoff },
      },
      select: {
        id: true,
        number: true,
        projectId: true,
        companyId: true,
        neededByDate: true,
        lines: { select: { awardedPurchaseOrderId: true } },
        purchaseOrders: {
          where: { status: { not: "CANCELLED" } },
          select: { id: true, status: true },
        },
      },
    });

    if (prs.length === 0) continue;

    const audience = await resolveNotificationAudience({
      tenantId: ctx.tenantId,
      permissionTargets: PR_APPROVER_AUDIENCE,
      alwaysCcOwnerAdmin: true,
    });
    const candidates = [...new Set([...audience, ...owners])];
    if (candidates.length === 0) continue;

    for (const pr of prs) {
      const totalLines = pr.lines.length;
      const activePoIds = new Set(pr.purchaseOrders.map((p) => p.id));
      // Only awards pointing at non-cancelled OCs count (stale cache after Anular).
      const awardedLines = pr.lines.filter(
        (l) => l.awardedPurchaseOrderId != null && activePoIds.has(l.awardedPurchaseOrderId),
      );
      const fullyAwarded = totalLines > 0 && awardedLines.length === totalLines;
      const awardedPoIds = new Set(
        awardedLines.map((l) => l.awardedPurchaseOrderId!).filter(Boolean),
      );
      const allAwardedConfirmed =
        fullyAwarded &&
        [...awardedPoIds].every((poId) => {
          const po = pr.purchaseOrders.find((p) => p.id === poId);
          return (
            po != null &&
            (po.status === "CONFIRMED" ||
              po.status === "PARTIALLY_RECEIVED" ||
              po.status === "RECEIVED")
          );
        });
      // Alert until full coverage AND every awarded OC is CONFIRMED+ ([BR-PUR-019]/[BR-PUR-024]).
      if (allAwardedConfirmed) continue;

      summary.checkedCount += 1;
      const code = `SC-${String(pr.number).padStart(3, "0")}`;
      const overdue = daysOverdue(pr.neededByDate!);
      const facts = await loadNotificationIdentityFacts({
        tenantId: ctx.tenantId,
        companyId: pr.companyId,
        projectId: pr.projectId,
      });
      await fanOut({
        ctx,
        candidates,
        tenantId: ctx.tenantId,
        companyId: pr.companyId,
        projectId: pr.projectId,
        type: "PURCHASE_REQUEST_NEEDED_BY_OVERDUE",
        linkedEntityType: "PURCHASE_REQUEST",
        linkedEntityId: pr.id,
        title: formatNotificationTitle("Solicitud vencida", code),
        body: formatNotificationIdentityBody(
          fullyAwarded
            ? `La solicitud ${code} tiene fecha requerida vencida hace ${overdue} día(s) y todavía hay órdenes sin confirmar. Priorizá la compra.`
            : `La solicitud ${code} tiene fecha requerida vencida hace ${overdue} día(s) y todavía hay ítems sin adjudicar u OC sin confirmar. Priorizá cotización o compra.`,
          facts,
        ),
        severity: "WARNING",
        actionUrl: `/proyectos/${pr.projectId}/solicitudes-compra/${pr.id}`,
        metadata: { overdueDays: overdue },
        summary,
      });
    }
  }

  return summary;
}

// ─── C. PO received without invoice ─────────────────────────────────────────

/**
 * PO status IN (PARTIALLY_RECEIVED, RECEIVED), earliest confirmed receipt ≥ SLA days ago, and no
 * SupplierInvoice in ISSUED linked to the PO.
 * Audience: AP_AUDIENCE + CC OWNER/ADMIN. Dedup 7d.
 */
export async function runPurchaseOrderReceivedWithoutInvoiceAlert(
  ctx: ServiceContext,
): Promise<ProcurementOverdueRunSummary> {
  const summary = emptySummary();
  const owners = await findActiveOwnerAdminUserIds(ctx.tenantId);

  const companies = await prisma.company.findMany({
    where: { tenantId: ctx.tenantId, status: "ACTIVE" },
    select: { id: true },
  });

  for (const company of companies) {
    const settings = await getCompanyProcurementSettings(company.id, ctx);
    if (!settings.receiptToInvoiceAlertsEnabled) continue;
    const cutoff = new Date(
      todayUtcDate().getTime() - settings.receiptToInvoiceSlaDays * DAY_MS,
    );

    // Load POs with at least one CONFIRMED receipt older than the SLA cutoff and no ISSUED invoice.
    const pos = await prisma.purchaseOrder.findMany({
      where: {
        tenantId: ctx.tenantId,
        companyId: company.id,
        status: { in: ["PARTIALLY_RECEIVED", "RECEIVED"] },
        receipts: {
          some: {
            status: "CONFIRMED",
            receiptDate: { lte: cutoff },
          },
        },
        supplierInvoices: {
          none: { status: "ISSUED" },
        },
      },
      select: {
        id: true,
        number: true,
        projectId: true,
        companyId: true,
        status: true,
        supplierContact: { select: { fantasyName: true, legalName: true } },
        receipts: {
          where: { status: "CONFIRMED" },
          orderBy: { receiptDate: "asc" },
          take: 1,
          select: { receiptDate: true },
        },
      },
    });

    if (pos.length === 0) continue;

    const audience = await resolveNotificationAudience({
      tenantId: ctx.tenantId,
      permissionTargets: AP_AUDIENCE,
      alwaysCcOwnerAdmin: true,
    });
    const candidates = [...new Set([...audience, ...owners])];
    if (candidates.length === 0) continue;

    for (const po of pos) {
      const firstReceipt = po.receipts[0]?.receiptDate;
      if (!firstReceipt) continue;
      summary.checkedCount += 1;
      const code = `OC-${String(po.number).padStart(3, "0")}`;
      const overdue = daysOverdue(firstReceipt);
      const supplierName =
        po.supplierContact.fantasyName ?? po.supplierContact.legalName;
      const partial = po.status === "PARTIALLY_RECEIVED" ? " (parcialmente)" : "";
      const facts = await loadNotificationIdentityFacts({
        tenantId: ctx.tenantId,
        companyId: po.companyId,
        projectId: po.projectId,
      });
      await fanOut({
        ctx,
        candidates,
        tenantId: ctx.tenantId,
        companyId: po.companyId,
        projectId: po.projectId,
        type: "PURCHASE_ORDER_RECEIVED_WITHOUT_INVOICE",
        linkedEntityType: "PURCHASE_ORDER",
        linkedEntityId: po.id,
        title: formatNotificationTitle("OC recibida sin factura", code),
        body: formatNotificationIdentityBody(
          `La orden ${code} fue recibida${partial} hace ${overdue} día(s) y todavía no tiene factura del proveedor registrada. Proveedor: ${supplierName}.`,
          facts,
        ),
        severity: "WARNING",
        actionUrl: `/proyectos/${po.projectId}/ordenes-compra/${po.id}`,
        metadata: { overdueDays: overdue, firstReceiptDate: firstReceipt.toISOString().slice(0, 10) },
        summary,
      });
    }
  }

  return summary;
}
