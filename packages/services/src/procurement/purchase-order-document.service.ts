import { readPurchaseOrderDocumentParties, type PurchaseOrderStatus } from "@bloqer/database";
import { formatDbDate, formatGroupedDecimal, serializeMoney } from "@bloqer/utils";
import { isCrossCompany } from "../company-scope";
import { ServiceError, type ServiceContext } from "../types";
import { getPurchaseOrderById } from "./purchase-order.service";

export type PurchaseOrderDocument = {
  code: string;
  statusLabel: string;
  notice: string | null;
  issueDate: string;
  expectedDeliveryDate: string | null;
  currency: string;
  company: { name: string; fiscalId: string | null; address: string | null };
  supplier: { name: string; fiscalId: string | null; address: string | null };
  project: { label: string; address: string | null };
  lines: Array<{
    description: string;
    quantity: string;
    unit: string;
    unitPrice: string;
    discountPct: string;
    taxRate: string;
    lineTotal: string;
  }>;
  subtotal: string;
  taxAmount: string;
  iibbPerceptionRate: string;
  iibbPerceptionAmount: string;
  totalAmount: string;
};

const STATUS_LABELS: Record<PurchaseOrderStatus, string> = {
  DRAFT: "Borrador",
  SUBMITTED: "Pendiente de aprobación",
  APPROVED: "Aprobada internamente",
  CONFIRMED: "Confirmada",
  PARTIALLY_RECEIVED: "Parcialmente recibida",
  RECEIVED: "Recibida",
  CANCELLED: "Anulada",
};

const STATUS_NOTICES: Partial<Record<PurchaseOrderStatus, string>> = {
  DRAFT: "BORRADOR — Orden sin confirmar.",
  SUBMITTED: "PENDIENTE DE APROBACIÓN — Orden sin confirmar.",
  APPROVED: "APROBADA INTERNAMENTE — Pendiente de confirmación.",
  CANCELLED: "ANULADA — Documento sin vigencia.",
};

function address(parts: Array<string | null>): string | null {
  return parts.map((part) => part?.trim()).filter(Boolean).join(", ") || null;
}

/** Keep the stored quantity/unit-price/rate precision; never calculate money in the PDF. */
function decimalDetail(value: string): string {
  return formatGroupedDecimal(value, 4).replace(/(,\d{2})0{2}$/, "$1");
}

const money = (value: string) => formatGroupedDecimal(serializeMoney(value), 2);

/**
 * Read-only, explicit commercial projection. Notes, budget references, APU/EDT,
 * variance reasons, approval actors, FX and internal IDs never enter the PDF DTO.
 */
export async function buildPurchaseOrderDocument(
  purchaseOrderId: string,
  projectId: string,
  ctx: ServiceContext,
): Promise<{ companyId: string; document: PurchaseOrderDocument }> {
  // Reuse PROCUREMENT gate, role capability, tenant/company and project ACL.
  const order = await getPurchaseOrderById(purchaseOrderId, ctx);
  if (order.tenantId !== ctx.tenantId || isCrossCompany(order.companyId, ctx)) {
    throw new ServiceError("FORBIDDEN", "La orden no pertenece al contexto autorizado");
  }
  if (order.projectId !== projectId) {
    throw new ServiceError("NOT_FOUND", "Orden de compra no encontrada en esta obra");
  }
  const parties = await readPurchaseOrderDocumentParties({
    id: order.id,
    tenantId: ctx.tenantId,
    companyId: order.companyId,
    projectId,
    supplierContactId: order.supplierContactId,
  });
  if (!parties) {
    throw new ServiceError("CONFLICT", "No se pudieron comprobar los datos de la empresa, obra y proveedor de la orden");
  }
  const { company, supplierContact: supplier, project } = parties;
  return {
    companyId: order.companyId,
    document: {
      code: order.code,
      statusLabel: STATUS_LABELS[order.status],
      notice: STATUS_NOTICES[order.status] ?? null,
      issueDate: formatDbDate(order.issueDate),
      expectedDeliveryDate: order.expectedDeliveryDate ? formatDbDate(order.expectedDeliveryDate) : null,
      currency: order.currency,
      company: {
        name: company.legalName?.trim() || company.name,
        fiscalId: company.fiscalId,
        address: address([company.address, company.city, company.country]),
      },
      supplier: {
        name: supplier.legalName,
        fiscalId: supplier.taxId,
        address: address([supplier.address, supplier.city, supplier.province, supplier.country]),
      },
      project: {
        label: `${project.code} · ${project.name}`,
        address: address([project.address, project.city, project.province, project.country]),
      },
      lines: order.lines.map((line) => ({
        description: line.description,
        quantity: decimalDetail(line.quantity),
        unit: line.unit,
        unitPrice: decimalDetail(line.unitPrice),
        discountPct: decimalDetail(line.discountPct),
        taxRate: decimalDetail(line.taxRate),
        lineTotal: money(line.lineTotal),
      })),
      subtotal: money(order.subtotal),
      taxAmount: money(order.taxAmount),
      iibbPerceptionRate: decimalDetail(order.iibbPerceptionRate),
      iibbPerceptionAmount: money(order.iibbPerceptionAmount),
      totalAmount: money(order.totalAmount),
    },
  };
}
