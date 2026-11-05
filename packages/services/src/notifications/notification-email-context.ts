import type { LinkedEntityType, NotificationType, Prisma } from "@bloqer/database";
import { prisma } from "@bloqer/database";
import { formatDbDate } from "@bloqer/utils";
import { computeObligationBalanceDue, normalizeObligationBalanceDue } from "../finance/obligation-balance";
import type { EmailContextField } from "@bloqer/email";
import { serializeMoneyDecimal, serializeQtyDecimal } from "../finance/money-decimal";

const MAX_ITEMS = 8;
const MAX_NOTES = 280;
const MAX_ITEM_DESC = 160;

/** Prisma `@db.Date` is UTC midnight — formatDbDate keeps the calendar day stable. */
function formatEmailCalendarDate(value: Date): string {
  return formatDbDate(value);
}

const DOCUMENT_CATEGORY_LABEL_ES: Record<string, string> = {
  CONTRACT: "Contrato",
  PLAN: "Plano",
  PERMIT: "Permiso",
  TECHNICAL: "Técnico",
  PHOTO: "Foto",
  INVOICE: "Factura",
  RECEIPT: "Remito",
  CERTIFICATE: "Certificado",
  REPORT: "Informe",
  JOBSITE_EVIDENCE: "Evidencia obra",
  BUDGET: "Presupuesto",
  QUOTE: "Cotización",
  OTHER: "Otro",
};

const IDENTITY_APPENDIX_LINE = /^(Organización|Empresa|Proyecto|Solicitante|Enviada por): /;

/**
 * First paragraph of an in-app body, without the identity block appended by
 * {@link formatNotificationIdentityBody}. Emails already render that as a table.
 */
export function notificationLeadBody(body: string): string {
  const trimmed = body.trim();
  const parts = trimmed.split("\n\n");
  if (parts.length < 2) return trimmed;
  const restLines = parts
    .slice(1)
    .join("\n\n")
    .split("\n")
    .filter((line) => line.length > 0);
  if (restLines.length > 0 && restLines.every((line) => IDENTITY_APPENDIX_LINE.test(line))) {
    return parts[0]!.trim();
  }
  return trimmed;
}

export type NotificationEmailResolvedContext = {
  organizationName: string | null;
  contextFields: EmailContextField[];
  items: string[];
  itemsHeading: string;
  actionLabel: string;
};

export type NotificationIdentityFacts = {
  organizationName: string | null;
  companyName: string | null;
  projectLabel: string | null;
  requestedByName: string | null;
  actorName: string | null;
};

export function formatProjectLabel(code: string, name: string): string {
  const c = code.trim();
  const n = name.trim();
  if (c && n) return `${c} · ${n}`;
  return n || c;
}

export function formatUserLabel(name: string | null | undefined, email: string | null | undefined): string | null {
  const n = name?.trim() || "";
  const e = email?.trim() || "";
  if (n && e && n !== e) return `${n} (${e})`;
  return n || e || null;
}

export function formatQtyDisplay(qty: string, unit: string): string {
  const trimmedQty = qty.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
  const u = unit.trim();
  return u ? `${trimmedQty} ${u}` : trimmedQty;
}

export function formatLineItem(qty: string, unit: string, description: string): string {
  const desc = description.trim().slice(0, MAX_ITEM_DESC);
  return `${formatQtyDisplay(qty, unit)} — ${desc}`;
}

export function truncatePlainText(value: string, max: number): string {
  const collapsed = value.replace(/\s+/g, " ").trim();
  if (collapsed.length <= max) return collapsed;
  return `${collapsed.slice(0, max - 1).trimEnd()}…`;
}

function contactLabel(c: { legalName: string; fantasyName: string | null } | null | undefined): string | null {
  if (!c) return null;
  return (c.fantasyName ?? c.legalName).trim() || null;
}

function moneyLabel(amount: { toString(): string }, currency: string): string {
  return `${serializeMoneyDecimal(amount)} ${currency}`;
}

function padDoc(prefix: string, number: number, width: number): string {
  return `${prefix}-${String(number).padStart(width, "0")}`;
}

export function actionLabelForLinkedEntity(type: LinkedEntityType | null): string {
  switch (type) {
    case "PURCHASE_REQUEST":
      return "Ver solicitud";
    case "PURCHASE_ORDER":
      return "Ver orden";
    case "PURCHASE_RECEIPT":
      return "Ver recepción";
    case "PROCUREMENT_QUOTE":
      return "Ver cotización";
    case "SALES_INVOICE":
    case "SUPPLIER_INVOICE":
      return "Ver factura";
    case "CERTIFICATION":
    case "SUBCONTRACT_CERTIFICATION":
      return "Ver certificación";
    case "JOBSITE_LOG":
      return "Ver parte de obra";
    case "SUBCONTRACT":
      return "Ver subcontrato";
    case "BUDGET":
      return "Ver presupuesto";
    case "WAREHOUSE_TRANSFER":
      return "Ver transferencia";
    default:
      return "Abrir en Bloqer";
  }
}

export function actionLabelForNotification(
  type: NotificationType | null | undefined,
  linked: LinkedEntityType | null,
  actionUrl?: string | null,
): string {
  switch (type) {
    case "PAYABLE_READY_TO_PAY":
      return "Registrar pago";
    case "RECEIVABLE_READY_TO_COLLECT":
      return "Registrar cobranza";
    case "PAYABLE_OVERDUE":
      return "Ver cuenta por pagar";
    case "RECEIVABLE_OVERDUE":
      return "Ver cuenta por cobrar";
    case "ACCOUNTING_DRAFTS_PENDING":
      return "Ver asientos";
    case "NEGATIVE_STOCK":
      return "Ver inventario";
    case "PROCUREMENT_SLA_REMINDER":
      return "Revisar compras demoradas";
    case "STALE_DOCUMENT_UPLOAD":
    case "DOCUMENT_UPLOAD_CONFIRMED":
      return documentUploadActionLabel(linked, actionUrl);
    case "JOBSITE_LOG_RETURNED":
      return "Corregir parte";
    case "JOBSITE_LOG_SUBMITTED":
      return "Revisar parte";
    case "JOBSITE_LOG_APPROVED":
      return "Ver parte";
    case "PURCHASE_REQUEST_SUBMITTED":
      return "Cotizar solicitud";
    case "PURCHASE_REQUEST_RETURNED":
      return "Ver solicitud";
    case "PURCHASE_ORDER_PENDING_APPROVAL":
      return "Revisar orden";
    case "PURCHASE_ORDER_APPROVED":
      // Informees (origen) keep the OC detail URL; confirmers deep-link to the same ficha.
      return "Confirmar orden";
    case "PURCHASE_ORDER_RETURNED":
      return "Corregir orden";
    case "PURCHASE_ORDER_CONFIRMED":
      // Receivers get …/recepciones/nueva; informees get the OC detail.
      return actionUrl?.includes("/recepciones/nueva") ? "Registrar recepción" : "Ver orden";
    case "PURCHASE_ORDER_DELIVERY_OVERDUE":
      return "Registrar recepción";
    case "PURCHASE_REQUEST_NEEDED_BY_OVERDUE":
      return "Ver solicitud";
    case "PURCHASE_ORDER_RECEIVED_WITHOUT_INVOICE":
      return "Registrar factura";
    default:
      return actionLabelForLinkedEntity(linked);
  }
}

/** CTA must describe the destination: project uploads open `/documentos/…`, not the parent invoice. */
function documentUploadActionLabel(
  linked: LinkedEntityType | null,
  actionUrl?: string | null,
): string {
  const url = actionUrl?.trim() ?? "";
  if (!url || /\/documentos(\/|$)/.test(url)) {
    return "Ver documento";
  }
  if (linked && linked !== "OTHER" && linked !== "PROJECT" && linked !== "SCHEDULED_REPORT") {
    return actionLabelForLinkedEntity(linked);
  }
  return "Ver documento";
}

function factLine(label: string, value: string | null | undefined): string | null {
  const v = value?.trim();
  if (!v) return null;
  return `${label}: ${v}`;
}

/** Lead sentence + identity facts for in-app copy (campana / inbox). */
export function formatNotificationIdentityBody(lead: string, facts: NotificationIdentityFacts): string {
  const company =
    facts.companyName && facts.companyName !== facts.organizationName ? facts.companyName : null;
  const actor =
    facts.actorName && facts.actorName !== facts.requestedByName ? facts.actorName : null;
  const lines = [
    lead.trim(),
    factLine("Organización", facts.organizationName),
    factLine("Empresa", company),
    factLine("Proyecto", facts.projectLabel),
    factLine("Solicitante", facts.requestedByName),
    factLine("Enviada por", actor),
  ].filter((line): line is string => Boolean(line));

  if (lines.length === 1) return lines[0]!;
  return `${lines[0]}\n\n${lines.slice(1).join("\n")}`;
}

function pushField(fields: EmailContextField[], label: string, value: string | null | undefined): void {
  const v = value?.trim();
  if (!v) return;
  fields.push({ label, value: v });
}

export function buildBaseContextFields(params: {
  organizationName: string | null;
  companyName: string | null;
  projectLabel: string | null;
}): EmailContextField[] {
  const fields: EmailContextField[] = [];
  pushField(fields, "Organización", params.organizationName);
  if (params.companyName && params.companyName !== params.organizationName) {
    pushField(fields, "Empresa", params.companyName);
  }
  pushField(fields, "Proyecto", params.projectLabel);
  return fields;
}

async function loadUserLabels(tenantId: string, userIds: Array<string | null | undefined>): Promise<Map<string, string>> {
  const ids = [...new Set(userIds.filter((id): id is string => typeof id === "string" && id.length > 0))];
  if (ids.length === 0) return new Map();
  const users = await prisma.user.findMany({
    where: { id: { in: ids }, memberships: { some: { tenantId } } },
    select: { id: true, name: true, email: true },
  });
  const map = new Map<string, string>();
  for (const u of users) {
    const label = formatUserLabel(u.name, u.email);
    if (label) map.set(u.id, label);
  }
  return map;
}

export async function loadNotificationIdentityFacts(params: {
  tenantId: string;
  companyId: string | null;
  projectId: string | null;
  requestedByUserId?: string | null;
  actorUserId?: string | null;
}): Promise<NotificationIdentityFacts> {
  const [tenant, company, project, nameById] = await Promise.all([
    prisma.tenant.findFirst({
      where: { id: params.tenantId },
      select: { name: true },
    }),
    params.companyId
      ? prisma.company.findFirst({
          where: { id: params.companyId, tenantId: params.tenantId },
          select: { name: true },
        })
      : Promise.resolve(null),
    params.projectId
      ? prisma.project.findFirst({
          where: {
            id: params.projectId,
            tenantId: params.tenantId,
            ...(params.companyId ? { OR: [{ companyId: params.companyId }, { companyId: null }] } : {}),
          },
          select: { code: true, name: true },
        })
      : Promise.resolve(null),
    loadUserLabels(params.tenantId, [params.requestedByUserId, params.actorUserId]),
  ]);
  return {
    organizationName: tenant?.name.trim() || null,
    companyName: company?.name.trim() || null,
    projectLabel: project ? formatProjectLabel(project.code, project.name) : null,
    requestedByName: params.requestedByUserId ? nameById.get(params.requestedByUserId) ?? null : null,
    actorName: params.actorUserId ? nameById.get(params.actorUserId) ?? null : null,
  };
}

function metaRecord(meta: Prisma.JsonValue | null | undefined): Record<string, unknown> | null {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
  return meta as Record<string, unknown>;
}

function metaString(meta: Prisma.JsonValue | null | undefined, key: string): string | null {
  const v = metaRecord(meta)?.[key];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

type NotificationSourceScope = { tenantId: string; companyId?: string; projectId: string | null };

type ScopedSource = { tenantId: string; companyId: string; projectId: string | null };

function sameSourceScope(source: ScopedSource, linked: ScopedSource): boolean {
  return source.tenantId === linked.tenantId && source.companyId === linked.companyId &&
    source.projectId === linked.projectId;
}

const scopedSourceSelect = { tenantId: true, companyId: true, projectId: true } as const;
const obligationSelect = {
  ...scopedSourceSelect, currency: true, originalAmount: true, paidAmount: true, creditedAmount: true, dueDate: true,
} as const;

async function appendPurchaseRequestFields(
  scope: NotificationSourceScope,
  purchaseRequestId: string,
  fields: EmailContextField[],
  items: string[],
): Promise<void> {
  if (!scope.projectId) return;
  const pr = await prisma.purchaseRequest.findFirst({
    where: { ...scope, projectId: scope.projectId, id: purchaseRequestId },
    select: {
      number: true,
      requestedByUserId: true,
      createdBy: true,
      updatedBy: true,
      neededByDate: true,
      notes: true,
      lines: {
        select: { quantity: true, unit: true, description: true },
        orderBy: { sortOrder: "asc" },
        take: MAX_ITEMS,
      },
      _count: { select: { lines: true } },
    },
  });
  if (!pr) return;

  pushField(fields, "Código", padDoc("SC", pr.number, 3));
  const names = await loadUserLabels(scope.tenantId, [pr.requestedByUserId, pr.createdBy, pr.updatedBy]);
  const requestedBy = pr.requestedByUserId ? names.get(pr.requestedByUserId) : null;
  const submittedBy = pr.updatedBy ? names.get(pr.updatedBy) : pr.createdBy ? names.get(pr.createdBy) : null;
  pushField(fields, "Solicitante", requestedBy);
  if (submittedBy && submittedBy !== requestedBy) {
    pushField(fields, "Enviada por", submittedBy);
  }
  if (pr.neededByDate) {
    pushField(fields, "Fecha requerida", formatEmailCalendarDate(pr.neededByDate));
  }
  if (pr.notes?.trim()) {
    pushField(fields, "Notas", truncatePlainText(pr.notes, MAX_NOTES));
  }

  for (const line of pr.lines) {
    items.push(formatLineItem(serializeQtyDecimal(line.quantity), line.unit, line.description));
  }
  const extra = pr._count.lines - pr.lines.length;
  if (extra > 0) {
    items.push(`… y ${extra} ítem${extra === 1 ? "" : "s"} más`);
  }
}

async function appendPurchaseOrderFields(
  scope: NotificationSourceScope,
  purchaseOrderId: string,
  fields: EmailContextField[],
  items: string[],
): Promise<void> {
  if (!scope.projectId) return;
  const po = await prisma.purchaseOrder.findFirst({
    where: {
      ...scope, projectId: scope.projectId, id: purchaseOrderId,
      supplierContact: { tenantId: scope.tenantId },
    },
    select: {
      number: true,
      currency: true,
      totalAmount: true,
      originRequestedByUserId: true,
      createdBy: true,
      approvedByUserId: true,
      confirmedByUserId: true,
      returnReason: true,
      expectedDeliveryDate: true,
      supplierContact: { select: { legalName: true, fantasyName: true } },
      lines: {
        select: { quantity: true, unit: true, description: true },
        orderBy: { sortOrder: "asc" },
        take: MAX_ITEMS,
      },
      _count: { select: { lines: true } },
    },
  });
  if (!po) return;

  pushField(fields, "Código", padDoc("OC", po.number, 3));
  pushField(fields, "Proveedor", contactLabel(po.supplierContact));
  pushField(fields, "Total", moneyLabel(po.totalAmount, po.currency));
  const names = await loadUserLabels(scope.tenantId, [
    po.originRequestedByUserId,
    po.createdBy,
    po.approvedByUserId,
    po.confirmedByUserId,
  ]);
  const originLabel = po.originRequestedByUserId ? names.get(po.originRequestedByUserId) ?? null : null;
  const createdLabel = po.createdBy ? names.get(po.createdBy) ?? null : null;
  pushField(fields, "Solicitante", originLabel);
  if (createdLabel && createdLabel !== originLabel) {
    pushField(fields, "Creada por", createdLabel);
  }
  pushField(fields, "Aprobada por", po.approvedByUserId ? names.get(po.approvedByUserId) : null);
  pushField(fields, "Confirmada por", po.confirmedByUserId ? names.get(po.confirmedByUserId) : null);
  if (po.expectedDeliveryDate) {
    pushField(fields, "Entrega estimada", formatEmailCalendarDate(po.expectedDeliveryDate));
  }
  if (po.returnReason?.trim()) {
    pushField(fields, "Motivo de devolución", truncatePlainText(po.returnReason, MAX_NOTES));
  }

  for (const line of po.lines) {
    items.push(formatLineItem(serializeQtyDecimal(line.quantity), line.unit, line.description));
  }
  const extra = po._count.lines - po.lines.length;
  if (extra > 0) {
    items.push(`… y ${extra} ítem${extra === 1 ? "" : "s"} más`);
  }
}

async function appendSalesInvoiceFields(
  scope: NotificationSourceScope,
  salesInvoiceId: string,
  fields: EmailContextField[],
): Promise<void> {
  const inv = await prisma.salesInvoice.findFirst({
    where: { ...scope, id: salesInvoiceId, clientContact: { tenantId: scope.tenantId } },
    select: {
      ...scopedSourceSelect,
      number: true,
      invoiceLetter: true,
      currency: true,
      totalAmount: true,
      dueDate: true,
      issueDate: true,
      createdBy: true,
      clientContact: { select: { legalName: true, fantasyName: true } },
      clientContactId: true,
      receivable: { select: { ...obligationSelect, clientContactId: true } },
    },
  });
  if (!inv) return;
  const letter = inv.invoiceLetter ? ` ${inv.invoiceLetter}` : "";
  pushField(fields, "Código", `${padDoc("FAC", inv.number, 5)}${letter}`);
  pushField(fields, "Cliente", contactLabel(inv.clientContact));
  pushField(fields, "Total", moneyLabel(inv.totalAmount, inv.currency));
  if (inv.receivable && sameSourceScope(inv, inv.receivable) &&
    inv.clientContactId === inv.receivable.clientContactId && inv.currency === inv.receivable.currency) {
    const balance = normalizeObligationBalanceDue(computeObligationBalanceDue(inv.receivable.originalAmount, inv.receivable.paidAmount, inv.receivable.creditedAmount));
    pushField(fields, "Saldo", moneyLabel(balance, inv.currency));
    pushField(fields, "Vencimiento", formatEmailCalendarDate(inv.receivable.dueDate));
  } else {
    pushField(fields, "Emisión", formatEmailCalendarDate(inv.issueDate));
    pushField(fields, "Vencimiento", formatEmailCalendarDate(inv.dueDate));
  }
  const names = await loadUserLabels(scope.tenantId, [inv.createdBy]);
  pushField(fields, "Emitida por", inv.createdBy ? names.get(inv.createdBy) : null);
}

async function appendSupplierInvoiceFields(
  scope: NotificationSourceScope,
  supplierInvoiceId: string,
  fields: EmailContextField[],
): Promise<void> {
  const inv = await prisma.supplierInvoice.findFirst({
    where: { ...scope, id: supplierInvoiceId, supplierContact: { tenantId: scope.tenantId } },
    select: {
      ...scopedSourceSelect,
      number: true,
      invoiceLetter: true,
      currency: true,
      totalAmount: true,
      dueDate: true,
      issueDate: true,
      createdBy: true,
      supplierContactId: true,
      purchaseOrder: { select: { ...scopedSourceSelect, number: true, supplierContactId: true } },
      supplierContact: { select: { legalName: true, fantasyName: true } },
      payable: { select: { ...obligationSelect, supplierContactId: true } },
    },
  });
  if (!inv) return;
  const letter = inv.invoiceLetter ? ` ${inv.invoiceLetter}` : "";
  pushField(fields, "Código", `${padDoc("FP", inv.number, 5)}${letter}`);
  pushField(fields, "Proveedor", contactLabel(inv.supplierContact));
  if (inv.purchaseOrder && sameSourceScope(inv, inv.purchaseOrder) &&
    inv.supplierContactId === inv.purchaseOrder.supplierContactId) {
    pushField(fields, "Orden", padDoc("OC", inv.purchaseOrder.number, 3));
  }
  pushField(fields, "Total", moneyLabel(inv.totalAmount, inv.currency));
  if (inv.payable && sameSourceScope(inv, inv.payable) &&
    inv.supplierContactId === inv.payable.supplierContactId && inv.currency === inv.payable.currency) {
    const balance = normalizeObligationBalanceDue(computeObligationBalanceDue(inv.payable.originalAmount, inv.payable.paidAmount, inv.payable.creditedAmount));
    pushField(fields, "Saldo", moneyLabel(balance, inv.currency));
    pushField(fields, "Vencimiento", formatEmailCalendarDate(inv.payable.dueDate));
  } else {
    pushField(fields, "Emisión", formatEmailCalendarDate(inv.issueDate));
    pushField(fields, "Vencimiento", formatEmailCalendarDate(inv.dueDate));
  }
  const names = await loadUserLabels(scope.tenantId, [inv.createdBy]);
  pushField(fields, "Cargada por", inv.createdBy ? names.get(inv.createdBy) : null);
}

async function appendCertificationFields(
  scope: NotificationSourceScope,
  certificationId: string,
  fields: EmailContextField[],
): Promise<void> {
  if (!scope.projectId) return;
  const cert = await prisma.certification.findFirst({
    where: {
      tenantId: scope.tenantId, projectId: scope.projectId, id: certificationId,
      ...(scope.companyId ? { OR: [{ companyId: scope.companyId }, { companyId: null }] } : {}),
      budget: {
        tenantId: scope.tenantId,
        projectId: scope.projectId,
        ...(scope.companyId ? { OR: [{ companyId: scope.companyId }, { companyId: null }] } : {}),
      },
    },
    select: {
      number: true,
      periodStart: true,
      periodEnd: true,
      totalAmount: true,
      companyId: true,
      budget: { select: { currency: true, companyId: true } },
      createdBy: true,
      updatedBy: true,
    },
  });
  if (!cert || (cert.companyId && cert.budget.companyId && cert.companyId !== cert.budget.companyId)) return;
  pushField(fields, "Código", padDoc("CERT", cert.number, 3));
  pushField(fields, "Período", `${formatEmailCalendarDate(cert.periodStart)} → ${formatEmailCalendarDate(cert.periodEnd)}`);
  pushField(fields, "Total", moneyLabel(cert.totalAmount, cert.budget.currency));
  const names = await loadUserLabels(scope.tenantId, [cert.createdBy, cert.updatedBy]);
  pushField(fields, "Creada por", cert.createdBy ? names.get(cert.createdBy) : null);
  if (cert.updatedBy && cert.updatedBy !== cert.createdBy) {
    pushField(fields, "Actualizada por", names.get(cert.updatedBy));
  }
}

async function appendJobsiteLogFields(
  scope: NotificationSourceScope,
  jobsiteLogId: string,
  fields: EmailContextField[],
): Promise<void> {
  if (!scope.projectId) return;
  const log = await prisma.jobsiteLog.findFirst({
    where: { ...scope, projectId: scope.projectId, id: jobsiteLogId },
    select: {
      logDate: true,
      title: true,
      workFront: true,
      shift: true,
      returnNotes: true,
      createdBy: true,
    },
  });
  if (!log) return;
  pushField(fields, "Fecha", formatEmailCalendarDate(log.logDate));
  pushField(fields, "Título", log.title);
  pushField(fields, "Frente", log.workFront);
  pushField(fields, "Turno", log.shift);
  const names = await loadUserLabels(scope.tenantId, [log.createdBy]);
  pushField(fields, "Autor", log.createdBy ? names.get(log.createdBy) : null);
  if (log.returnNotes?.trim()) {
    pushField(fields, "Motivo de devolución", truncatePlainText(log.returnNotes, MAX_NOTES));
  }
}

async function appendPurchaseReceiptFields(
  scope: NotificationSourceScope,
  receiptId: string,
  fields: EmailContextField[],
): Promise<void> {
  if (!scope.projectId) return;
  const rec = await prisma.purchaseReceipt.findFirst({
    where: {
      ...scope, projectId: scope.projectId, id: receiptId,
      purchaseOrder: { ...scope, projectId: scope.projectId },
      supplierContact: { tenantId: scope.tenantId },
    },
    select: {
      companyId: true,
      receiptDate: true,
      createdBy: true,
      warehouse: { select: { ...scopedSourceSelect, name: true } },
      supplierContact: { select: { legalName: true, fantasyName: true } },
      purchaseOrder: { select: { number: true, companyId: true } },
    },
  });
  if (!rec || rec.companyId !== rec.purchaseOrder.companyId) return;
  pushField(fields, "Fecha", formatEmailCalendarDate(rec.receiptDate));
  pushField(fields, "Proveedor", contactLabel(rec.supplierContact));
  pushField(fields, "Orden", padDoc("OC", rec.purchaseOrder.number, 3));
  if (rec.warehouse?.tenantId === scope.tenantId && rec.warehouse.companyId === rec.companyId &&
    (!rec.warehouse.projectId || rec.warehouse.projectId === scope.projectId)) {
    pushField(fields, "Depósito", rec.warehouse.name);
  }
  const names = await loadUserLabels(scope.tenantId, [rec.createdBy]);
  pushField(fields, "Registrada por", rec.createdBy ? names.get(rec.createdBy) : null);
}

async function appendDocumentFields(
  scope: NotificationSourceScope,
  documentId: string,
  fields: EmailContextField[],
): Promise<void> {
  const doc = await prisma.documentAttachment.findFirst({
    where: {
      id: documentId, tenantId: scope.tenantId, projectId: scope.projectId,
      ...(scope.companyId ? { OR: [{ companyId: scope.companyId }, { companyId: null }] } : {}),
    },
    select: { originalFileName: true, category: true, uploadedBy: true },
  });
  if (!doc) return;
  pushField(fields, "Archivo", doc.originalFileName);
  pushField(fields, "Categoría", DOCUMENT_CATEGORY_LABEL_ES[doc.category] ?? doc.category);
  const names = await loadUserLabels(scope.tenantId, [doc.uploadedBy]);
  pushField(fields, "Subido por", names.get(doc.uploadedBy));
}

async function appendNegativeStockFields(
  scope: NotificationSourceScope,
  meta: Prisma.JsonValue | null | undefined,
  fields: EmailContextField[],
): Promise<void> {
  const productId = metaString(meta, "productId");
  const warehouseId = metaString(meta, "warehouseId");
  if (!productId && !warehouseId) return;
  const [product, warehouse] = await Promise.all([
    productId
      ? prisma.product.findFirst({
          where: {
            id: productId, tenantId: scope.tenantId,
            ...(scope.companyId ? { OR: [{ companyId: scope.companyId }, { companyId: null }] } : {}),
          },
          select: { sku: true, name: true, unit: true },
        })
      : Promise.resolve(null),
    warehouseId
      ? prisma.warehouse.findFirst({
          where: { id: warehouseId, tenantId: scope.tenantId, companyId: scope.companyId },
          select: { name: true },
        })
      : Promise.resolve(null),
  ]);
  if (product) {
    pushField(fields, "Producto", product.sku ? `${product.sku} — ${product.name}` : product.name);
    pushField(fields, "Unidad", product.unit);
  }
  pushField(fields, "Depósito", warehouse?.name);
}

async function appendLinkedEntityFields(
  scope: NotificationSourceScope,
  linkedEntityType: LinkedEntityType | null,
  linkedEntityId: string | null,
  fields: EmailContextField[],
  items: string[],
): Promise<void> {
  if (!linkedEntityType || !linkedEntityId) return;
  switch (linkedEntityType) {
    case "PURCHASE_REQUEST":
      await appendPurchaseRequestFields(scope, linkedEntityId, fields, items);
      break;
    case "PURCHASE_ORDER":
      await appendPurchaseOrderFields(scope, linkedEntityId, fields, items);
      break;
    case "SALES_INVOICE":
      await appendSalesInvoiceFields(scope, linkedEntityId, fields);
      break;
    case "SUPPLIER_INVOICE":
      await appendSupplierInvoiceFields(scope, linkedEntityId, fields);
      break;
    case "CERTIFICATION":
      await appendCertificationFields(scope, linkedEntityId, fields);
      break;
    case "JOBSITE_LOG":
      await appendJobsiteLogFields(scope, linkedEntityId, fields);
      break;
    case "PURCHASE_RECEIPT":
      await appendPurchaseReceiptFields(scope, linkedEntityId, fields);
      break;
    default:
      break;
  }
}

/**
 * Loads tenant / company / project / entity facts for transactional emails.
 * Best-effort: missing rows simply omit fields (never throw).
 */
export async function resolveNotificationEmailContext(params: {
  tenantId: string;
  companyId: string | null;
  projectId: string | null;
  linkedEntityType: LinkedEntityType | null;
  linkedEntityId: string | null;
  notificationType?: NotificationType | null;
  metadata?: Prisma.JsonValue | null;
  actionUrl?: string | null;
  recipientCompanyId?: string | null;
}): Promise<NotificationEmailResolvedContext> {
  const identity = await loadNotificationIdentityFacts({
    tenantId: params.tenantId,
    companyId: params.companyId,
    projectId: params.projectId,
  });
  const fields = buildBaseContextFields(identity);
  const items: string[] = [];
  const scope: NotificationSourceScope = {
    tenantId: params.tenantId,
    companyId: params.companyId ?? params.recipientCompanyId ?? undefined,
    projectId: params.projectId,
  };

  try {
    await appendLinkedEntityFields(
      scope,
      params.linkedEntityType,
      params.linkedEntityId,
      fields,
      items,
    );
    const documentId = metaString(params.metadata, "documentId");
    if (documentId && (params.notificationType === "DOCUMENT_UPLOAD_CONFIRMED" ||
      params.notificationType === "STALE_DOCUMENT_UPLOAD")) {
      await appendDocumentFields(scope, documentId, fields);
    }
    if (params.notificationType === "NEGATIVE_STOCK") {
      await appendNegativeStockFields(scope, params.metadata ?? null, fields);
    }
    if (params.notificationType === "ACCOUNTING_DRAFTS_PENDING") {
      pushField(fields, "Cola", "Asientos contables en borrador");
    }
  } catch {
    /* best-effort extra fields */
  }

  return {
    organizationName: identity.organizationName,
    contextFields: fields,
    items,
    itemsHeading: "Ítems",
    actionLabel: actionLabelForNotification(params.notificationType, params.linkedEntityType, params.actionUrl),
  };
}
