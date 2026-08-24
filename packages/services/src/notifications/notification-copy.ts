import type { LinkedEntityType } from "@bloqer/database";
import { prisma } from "@bloqer/database";
import { formatDate } from "@bloqer/utils";
import { formatProjectLabel, truncatePlainText } from "./notification-email-context";

const TITLE_MAX = 80;

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

export function padNotificationDoc(prefix: string, number: number, width: number): string {
  return `${prefix}-${String(number).padStart(width, "0")}`;
}

export function formatNotificationTitle(eventLabel: string, entityLabel?: string | null): string {
  const event = eventLabel.replace(/\s+/g, " ").trim();
  const entity = entityLabel?.replace(/\s+/g, " ").trim() || "";
  if (!event) return "";
  if (!entity) return truncatePlainText(event, TITLE_MAX);
  return truncatePlainText(`${event} · ${entity}`, TITLE_MAX);
}

export function formatJobsiteLogDate(logDate: Date): string {
  return formatDate(logDate, { timeZone: "UTC", fallback: "" });
}

export function formatJobsiteLogLabel(logDate: Date): string {
  const date = formatJobsiteLogDate(logDate);
  return date ? `Parte ${date}` : "Parte";
}

export function formatSupplierInvoiceCode(number: number): string {
  return padNotificationDoc("FP", number, 5);
}

export function formatSalesInvoiceCode(number: number): string {
  return padNotificationDoc("FAC", number, 5);
}

export function formatCertificationCode(number: number): string {
  return padNotificationDoc("CERT", number, 3);
}

export function formatPurchaseOrderCode(number: number): string {
  return padNotificationDoc("OC", number, 3);
}

export function formatPurchaseRequestCode(number: number): string {
  return padNotificationDoc("SC", number, 3);
}

export function formatSubcontractCode(number: number): string {
  return `Subcontrato ${padNotificationDoc("SC", number, 3)}`;
}

export function formatSubcontractCertificationCode(number: number): string {
  return padNotificationDoc("CERT-SC", number, 3);
}

/** Short Spanish noun for a linked entity (campana / título). */
export function linkedEntityKindLabelEs(type: LinkedEntityType | null | undefined): string | null {
  switch (type) {
    case "SALES_INVOICE":
    case "SUPPLIER_INVOICE":
      return "Factura";
    case "JOBSITE_LOG":
      return "Parte";
    case "CERTIFICATION":
      return "Certificación";
    case "SUBCONTRACT_CERTIFICATION":
      return "Certificación de subcontrato";
    case "PURCHASE_ORDER":
      return "OC";
    case "PURCHASE_REQUEST":
      return "Solicitud";
    case "PURCHASE_RECEIPT":
      return "Recepción";
    case "PROCUREMENT_QUOTE":
      return "Cotización";
    case "SUBCONTRACT":
      return "Subcontrato";
    case "BUDGET":
      return "Presupuesto";
    case "PROJECT":
      return "Proyecto";
    case "WAREHOUSE_TRANSFER":
      return "Transferencia";
    default:
      return null;
  }
}

function kindLabel(type: LinkedEntityType, fallback: string): string {
  return linkedEntityKindLabelEs(type) ?? fallback;
}

export function documentCategoryLabelEs(category: string | null | undefined): string | null {
  const key = category?.trim();
  if (!key || key === "OTHER") return null;
  return DOCUMENT_CATEGORY_LABEL_ES[key] ?? null;
}

function documentTitleRef(params: { entityLabel: string | null; category?: string | null; fileName: string }): string {
  return params.entityLabel ?? documentCategoryLabelEs(params.category) ?? params.fileName;
}

export function documentUploadConfirmedCopy(params: {
  fileName: string;
  entityLabel: string | null;
  category?: string | null;
}): { title: string; body: string } {
  const fileName = params.fileName.trim() || "archivo";
  const title = formatNotificationTitle("Documento listo", documentTitleRef({ ...params, fileName }));
  const fileLine = `El archivo «${fileName}» se subió correctamente.`;
  const body = params.entityLabel ? `${fileLine} Vinculado a ${params.entityLabel}.` : fileLine;
  return { title, body };
}

export function staleDocumentUploadCopy(params: {
  fileName: string;
  entityLabel: string | null;
  category?: string | null;
}): { title: string; body: string } {
  const fileName = params.fileName.trim() || "archivo";
  const title = formatNotificationTitle("Carga de documento pendiente", documentTitleRef({ ...params, fileName }));
  const fileLine = `El archivo «${fileName}» sigue en estado de carga (iniciado hace más de 1 h).`;
  const body = params.entityLabel ? `${fileLine} Vinculado a ${params.entityLabel}.` : fileLine;
  return { title, body };
}

function contactLabel(c: { legalName: string; fantasyName: string | null } | null | undefined): string | null {
  if (!c) return null;
  return (c.fantasyName ?? c.legalName).trim() || null;
}

/**
 * Short Spanish label for a linked domain entity (codes match the rest of the product).
 * Best-effort: missing rows or query errors return null.
 */
export async function resolveLinkedEntityLabel(params: {
  tenantId: string;
  linkedEntityType: LinkedEntityType | null | undefined;
  linkedEntityId: string | null | undefined;
}): Promise<string | null> {
  const type = params.linkedEntityType;
  const id = params.linkedEntityId?.trim();
  if (!type || !id) return null;

  try {
    switch (type) {
      case "SALES_INVOICE": {
        const inv = await prisma.salesInvoice.findFirst({
          where: { id, tenantId: params.tenantId },
          select: { number: true },
        });
        return inv ? `${kindLabel("SALES_INVOICE", "Factura")} ${formatSalesInvoiceCode(inv.number)}` : null;
      }
      case "SUPPLIER_INVOICE": {
        const inv = await prisma.supplierInvoice.findFirst({
          where: { id, tenantId: params.tenantId },
          select: { number: true },
        });
        return inv ? `${kindLabel("SUPPLIER_INVOICE", "Factura")} ${formatSupplierInvoiceCode(inv.number)}` : null;
      }
      case "CERTIFICATION": {
        const cert = await prisma.certification.findFirst({
          where: { id, tenantId: params.tenantId },
          select: { number: true },
        });
        return cert ? formatCertificationCode(cert.number) : null;
      }
      case "JOBSITE_LOG": {
        const log = await prisma.jobsiteLog.findFirst({
          where: { id, tenantId: params.tenantId },
          select: { logDate: true },
        });
        return log ? formatJobsiteLogLabel(log.logDate) : null;
      }
      case "PURCHASE_ORDER": {
        const po = await prisma.purchaseOrder.findFirst({
          where: { id, tenantId: params.tenantId },
          select: { number: true },
        });
        return po ? formatPurchaseOrderCode(po.number) : null;
      }
      case "PURCHASE_REQUEST": {
        const pr = await prisma.purchaseRequest.findFirst({
          where: { id, tenantId: params.tenantId },
          select: { number: true },
        });
        return pr ? formatPurchaseRequestCode(pr.number) : null;
      }
      case "PURCHASE_RECEIPT": {
        const rec = await prisma.purchaseReceipt.findFirst({
          where: { id, tenantId: params.tenantId },
          select: {
            receiptDate: true,
            purchaseOrder: { select: { number: true } },
          },
        });
        if (!rec) return null;
        const kind = kindLabel("PURCHASE_RECEIPT", "Recepción");
        return rec.purchaseOrder
          ? `${kind} ${formatPurchaseOrderCode(rec.purchaseOrder.number)}`
          : `${kind} ${formatJobsiteLogDate(rec.receiptDate)}`.trim();
      }
      case "PROCUREMENT_QUOTE": {
        const quote = await prisma.procurementQuote.findFirst({
          where: { id, tenantId: params.tenantId },
          select: {
            purchaseRequest: { select: { number: true } },
            supplierContact: { select: { legalName: true, fantasyName: true } },
          },
        });
        if (!quote) return null;
        const supplier = contactLabel(quote.supplierContact);
        const sc = formatPurchaseRequestCode(quote.purchaseRequest.number);
        const kind = kindLabel("PROCUREMENT_QUOTE", "Cotización");
        return supplier ? `${kind} ${supplier} · ${sc}` : `${kind} ${sc}`;
      }
      case "SUBCONTRACT": {
        const sc = await prisma.subcontract.findFirst({
          where: { id, tenantId: params.tenantId },
          select: { number: true },
        });
        return sc ? formatSubcontractCode(sc.number) : null;
      }
      case "SUBCONTRACT_CERTIFICATION": {
        const cert = await prisma.subcontractCertification.findFirst({
          where: { id, tenantId: params.tenantId },
          select: { number: true },
        });
        return cert ? formatSubcontractCertificationCode(cert.number) : null;
      }
      case "BUDGET": {
        const budget = await prisma.budget.findFirst({
          where: { id, tenantId: params.tenantId },
          select: { name: true, versionNumber: true },
        });
        if (!budget) return null;
        const name = budget.name.trim();
        return name || `Presupuesto v${budget.versionNumber}`;
      }
      case "PROJECT": {
        const project = await prisma.project.findFirst({
          where: { id, tenantId: params.tenantId },
          select: { code: true, name: true },
        });
        return project ? formatProjectLabel(project.code, project.name) : null;
      }
      case "WAREHOUSE_TRANSFER": {
        const tr = await prisma.warehouseTransfer.findFirst({
          where: { id, tenantId: params.tenantId },
          select: { number: true },
        });
        const kind = kindLabel("WAREHOUSE_TRANSFER", "Transferencia");
        return tr ? `${kind} ${tr.number}` : null;
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
}

/** Linked entity first; otherwise project code · name. Filename is a caller fallback. */
export async function resolveDocumentNotificationEntityLabel(params: {
  tenantId: string;
  linkedEntityType: LinkedEntityType | null | undefined;
  linkedEntityId: string | null | undefined;
  projectId?: string | null;
}): Promise<string | null> {
  const linked = await resolveLinkedEntityLabel({
    tenantId: params.tenantId,
    linkedEntityType: params.linkedEntityType,
    linkedEntityId: params.linkedEntityId,
  });
  if (linked) return linked;

  const projectId = params.projectId?.trim();
  if (!projectId) return null;
  try {
    const project = await prisma.project.findFirst({
      where: { id: projectId, tenantId: params.tenantId },
      select: { code: true, name: true },
    });
    return project ? formatProjectLabel(project.code, project.name) : null;
  } catch {
    return null;
  }
}
