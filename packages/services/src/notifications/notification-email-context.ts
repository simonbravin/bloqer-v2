import type { LinkedEntityType, NotificationType, Prisma } from "@bloqer/database";
import { prisma } from "@bloqer/database";
import { formatDate } from "@bloqer/utils";
import type { EmailContextField } from "@bloqer/email";
import { serializeMoneyDecimal, serializeQtyDecimal } from "../finance/money-decimal";
import { resolveUserDisplayNames, userDisplayNameFromMap } from "../user/resolve-user-display-names";

const MAX_ITEMS = 8;
const MAX_NOTES = 280;
const MAX_ITEM_DESC = 160;

/** Prisma `@db.Date` is UTC midnight; format in UTC so AR servers don't shift the day. */
function formatEmailCalendarDate(value: Date): string {
  return formatDate(value, { timeZone: "UTC" });
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
    case "ACCOUNTING_DRAFTS_PENDING":
      return "Ver asientos";
    case "NEGATIVE_STOCK":
      return "Ver inventario";
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

async function loadUserLabels(userIds: Array<string | null | undefined>): Promise<Map<string, string>> {
  const ids = [...new Set(userIds.filter((id): id is string => typeof id === "string" && id.length > 0))];
  if (ids.length === 0) return new Map();
  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, email: true },
  });
  const map = new Map<string, string>();
  for (const u of users) {
    const label = formatUserLabel(u.name, u.email);
    if (label) map.set(u.id, label);
  }
  const fallback = await resolveUserDisplayNames(ids);
  for (const id of ids) {
    if (!map.has(id)) {
      const fb = userDisplayNameFromMap(fallback, id);
      if (fb) map.set(id, fb);
    }
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
          where: { id: params.projectId, tenantId: params.tenantId },
          select: { code: true, name: true },
        })
      : Promise.resolve(null),
    loadUserLabels([params.requestedByUserId, params.actorUserId]),
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

async function appendPurchaseRequestFields(
  tenantId: string,
  purchaseRequestId: string,
  fields: EmailContextField[],
  items: string[],
): Promise<void> {
  const pr = await prisma.purchaseRequest.findFirst({
    where: { id: purchaseRequestId, tenantId },
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
  const names = await loadUserLabels([pr.requestedByUserId, pr.createdBy, pr.updatedBy]);
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
  tenantId: string,
  purchaseOrderId: string,
  fields: EmailContextField[],
  items: string[],
): Promise<void> {
  const po = await prisma.purchaseOrder.findFirst({
    where: { id: purchaseOrderId, tenantId },
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
  const names = await loadUserLabels([
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
  tenantId: string,
  salesInvoiceId: string,
  fields: EmailContextField[],
): Promise<void> {
  const inv = await prisma.salesInvoice.findFirst({
    where: { id: salesInvoiceId, tenantId },
    select: {
      number: true,
      invoiceLetter: true,
      currency: true,
      totalAmount: true,
      dueDate: true,
      issueDate: true,
      createdBy: true,
      clientContact: { select: { legalName: true, fantasyName: true } },
      receivable: { select: { originalAmount: true, paidAmount: true, dueDate: true } },
    },
  });
  if (!inv) return;
  const letter = inv.invoiceLetter ? ` ${inv.invoiceLetter}` : "";
  pushField(fields, "Código", `${padDoc("FAC", inv.number, 5)}${letter}`);
  pushField(fields, "Cliente", contactLabel(inv.clientContact));
  pushField(fields, "Total", moneyLabel(inv.totalAmount, inv.currency));
  if (inv.receivable) {
    const balance = inv.receivable.originalAmount.minus(inv.receivable.paidAmount);
    pushField(fields, "Saldo", moneyLabel(balance, inv.currency));
    pushField(fields, "Vencimiento", formatEmailCalendarDate(inv.receivable.dueDate));
  } else {
    pushField(fields, "Emisión", formatEmailCalendarDate(inv.issueDate));
    pushField(fields, "Vencimiento", formatEmailCalendarDate(inv.dueDate));
  }
  const names = await loadUserLabels([inv.createdBy]);
  pushField(fields, "Emitida por", inv.createdBy ? names.get(inv.createdBy) : null);
}

async function appendSupplierInvoiceFields(
  tenantId: string,
  supplierInvoiceId: string,
  fields: EmailContextField[],
): Promise<void> {
  const inv = await prisma.supplierInvoice.findFirst({
    where: { id: supplierInvoiceId, tenantId },
    select: {
      number: true,
      invoiceLetter: true,
      currency: true,
      totalAmount: true,
      dueDate: true,
      issueDate: true,
      createdBy: true,
      purchaseOrder: { select: { number: true } },
      supplierContact: { select: { legalName: true, fantasyName: true } },
      payable: { select: { originalAmount: true, paidAmount: true, dueDate: true } },
    },
  });
  if (!inv) return;
  const letter = inv.invoiceLetter ? ` ${inv.invoiceLetter}` : "";
  pushField(fields, "Código", `${padDoc("FP", inv.number, 5)}${letter}`);
  pushField(fields, "Proveedor", contactLabel(inv.supplierContact));
  if (inv.purchaseOrder) {
    pushField(fields, "Orden", padDoc("OC", inv.purchaseOrder.number, 3));
  }
  pushField(fields, "Total", moneyLabel(inv.totalAmount, inv.currency));
  if (inv.payable) {
    const balance = inv.payable.originalAmount.minus(inv.payable.paidAmount);
    pushField(fields, "Saldo", moneyLabel(balance, inv.currency));
    pushField(fields, "Vencimiento", formatEmailCalendarDate(inv.payable.dueDate));
  } else {
    pushField(fields, "Emisión", formatEmailCalendarDate(inv.issueDate));
    pushField(fields, "Vencimiento", formatEmailCalendarDate(inv.dueDate));
  }
  const names = await loadUserLabels([inv.createdBy]);
  pushField(fields, "Cargada por", inv.createdBy ? names.get(inv.createdBy) : null);
}

async function appendCertificationFields(
  tenantId: string,
  certificationId: string,
  fields: EmailContextField[],
): Promise<void> {
  const cert = await prisma.certification.findFirst({
    where: { id: certificationId, tenantId },
    select: {
      number: true,
      periodStart: true,
      periodEnd: true,
      totalAmount: true,
      createdBy: true,
      updatedBy: true,
    },
  });
  if (!cert) return;
  pushField(fields, "Código", padDoc("CERT", cert.number, 3));
  pushField(fields, "Período", `${formatEmailCalendarDate(cert.periodStart)} → ${formatEmailCalendarDate(cert.periodEnd)}`);
  pushField(fields, "Total", moneyLabel(cert.totalAmount, "ARS"));
  const names = await loadUserLabels([cert.createdBy, cert.updatedBy]);
  pushField(fields, "Creada por", cert.createdBy ? names.get(cert.createdBy) : null);
  if (cert.updatedBy && cert.updatedBy !== cert.createdBy) {
    pushField(fields, "Actualizada por", names.get(cert.updatedBy));
  }
}

async function appendJobsiteLogFields(
  tenantId: string,
  jobsiteLogId: string,
  fields: EmailContextField[],
): Promise<void> {
  const log = await prisma.jobsiteLog.findFirst({
    where: { id: jobsiteLogId, tenantId },
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
  const names = await loadUserLabels([log.createdBy]);
  pushField(fields, "Autor", log.createdBy ? names.get(log.createdBy) : null);
  if (log.returnNotes?.trim()) {
    pushField(fields, "Motivo de devolución", truncatePlainText(log.returnNotes, MAX_NOTES));
  }
}

async function appendPurchaseReceiptFields(
  tenantId: string,
  receiptId: string,
  fields: EmailContextField[],
): Promise<void> {
  const rec = await prisma.purchaseReceipt.findFirst({
    where: { id: receiptId, tenantId },
    select: {
      receiptDate: true,
      createdBy: true,
      warehouse: { select: { name: true } },
      supplierContact: { select: { legalName: true, fantasyName: true } },
      purchaseOrder: { select: { number: true } },
    },
  });
  if (!rec) return;
  pushField(fields, "Fecha", formatEmailCalendarDate(rec.receiptDate));
  pushField(fields, "Proveedor", contactLabel(rec.supplierContact));
  pushField(fields, "Orden", padDoc("OC", rec.purchaseOrder.number, 3));
  pushField(fields, "Depósito", rec.warehouse?.name);
  const names = await loadUserLabels([rec.createdBy]);
  pushField(fields, "Registrada por", rec.createdBy ? names.get(rec.createdBy) : null);
}

async function appendDocumentFields(
  tenantId: string,
  documentId: string,
  fields: EmailContextField[],
): Promise<void> {
  const doc = await prisma.documentAttachment.findFirst({
    where: { id: documentId, tenantId },
    select: { originalFileName: true, category: true, uploadedBy: true },
  });
  if (!doc) return;
  pushField(fields, "Archivo", doc.originalFileName);
  pushField(fields, "Categoría", DOCUMENT_CATEGORY_LABEL_ES[doc.category] ?? doc.category);
  const names = await loadUserLabels([doc.uploadedBy]);
  pushField(fields, "Subido por", names.get(doc.uploadedBy));
}

async function appendNegativeStockFields(
  tenantId: string,
  meta: Prisma.JsonValue | null | undefined,
  fields: EmailContextField[],
): Promise<void> {
  const productId = metaString(meta, "productId");
  const warehouseId = metaString(meta, "warehouseId");
  if (!productId && !warehouseId) return;
  const [product, warehouse] = await Promise.all([
    productId
      ? prisma.product.findFirst({
          where: { id: productId, tenantId },
          select: { sku: true, name: true, unit: true },
        })
      : Promise.resolve(null),
    warehouseId
      ? prisma.warehouse.findFirst({
          where: { id: warehouseId, tenantId },
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
  tenantId: string,
  linkedEntityType: LinkedEntityType | null,
  linkedEntityId: string | null,
  fields: EmailContextField[],
  items: string[],
): Promise<void> {
  if (!linkedEntityType || !linkedEntityId) return;
  switch (linkedEntityType) {
    case "PURCHASE_REQUEST":
      await appendPurchaseRequestFields(tenantId, linkedEntityId, fields, items);
      break;
    case "PURCHASE_ORDER":
      await appendPurchaseOrderFields(tenantId, linkedEntityId, fields, items);
      break;
    case "SALES_INVOICE":
      await appendSalesInvoiceFields(tenantId, linkedEntityId, fields);
      break;
    case "SUPPLIER_INVOICE":
      await appendSupplierInvoiceFields(tenantId, linkedEntityId, fields);
      break;
    case "CERTIFICATION":
      await appendCertificationFields(tenantId, linkedEntityId, fields);
      break;
    case "JOBSITE_LOG":
      await appendJobsiteLogFields(tenantId, linkedEntityId, fields);
      break;
    case "PURCHASE_RECEIPT":
      await appendPurchaseReceiptFields(tenantId, linkedEntityId, fields);
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
}): Promise<NotificationEmailResolvedContext> {
  const identity = await loadNotificationIdentityFacts({
    tenantId: params.tenantId,
    companyId: params.companyId,
    projectId: params.projectId,
  });
  const fields = buildBaseContextFields(identity);
  const items: string[] = [];

  try {
    await appendLinkedEntityFields(
      params.tenantId,
      params.linkedEntityType,
      params.linkedEntityId,
      fields,
      items,
    );
    const documentId = metaString(params.metadata, "documentId");
    if (documentId) {
      await appendDocumentFields(params.tenantId, documentId, fields);
    }
    if (params.notificationType === "NEGATIVE_STOCK" || metaString(params.metadata, "productId")) {
      await appendNegativeStockFields(params.tenantId, params.metadata ?? null, fields);
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
