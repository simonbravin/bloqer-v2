const LINKED_ENTITY_LABELS: Record<string, string> = {
  PROJECT: "la obra",
  BUDGET: "un presupuesto",
  CERTIFICATION: "una certificación",
  SALES_INVOICE: "una factura de venta",
  SUPPLIER_INVOICE: "una factura de proveedor",
  PURCHASE_ORDER: "una orden de compra",
  PURCHASE_RECEIPT: "una recepción",
  PURCHASE_REQUEST: "una solicitud de compra",
  PROCUREMENT_QUOTE: "una cotización",
  SUBCONTRACT: "un subcontrato",
  SUBCONTRACT_CERTIFICATION: "una certificación de subcontrato",
  JOBSITE_LOG: "un parte de libro de obra",
  WAREHOUSE_TRANSFER: "un traslado de depósito",
  SCHEDULED_REPORT: "un reporte programado",
  OTHER: "otro documento operativo",
};

export function linkedEntityTypeLabelEs(linkedEntityType: string | null | undefined): string | null {
  if (!linkedEntityType || linkedEntityType === "PROJECT") return null;
  return LINKED_ENTITY_LABELS[linkedEntityType] ?? "otro documento operativo";
}

export function linkedDocumentDeleteBlockedReason(
  linkedEntityType: string | null | undefined,
): string | undefined {
  const label = linkedEntityTypeLabelEs(linkedEntityType);
  if (!label) return undefined;
  return `Este archivo está ligado a ${label} y no se puede eliminar. Archiválo si no querés verlo.`;
}
