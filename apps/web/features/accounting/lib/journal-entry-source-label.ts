import type { JournalEntrySourceType } from "@bloqer/database";

const sourceLabels: Record<JournalEntrySourceType, string> = {
  MANUAL: "Manual",
  SALES_INVOICE: "Factura de venta",
  SALES_CREDIT_NOTE: "Nota de crédito de venta",
  SALES_DEBIT_NOTE: "Nota de débito de venta",
  COLLECTION: "Cobranza",
  SUPPLIER_INVOICE: "Factura de proveedor",
  SUPPLIER_CREDIT_NOTE: "Nota de crédito de proveedor",
  SUPPLIER_DEBIT_NOTE: "Nota de débito de proveedor",
  PAYMENT: "Pago a proveedor",
  INTERNAL_TRANSFER: "Transferencia interna",
  STOCK_MOVEMENT: "Movimiento de stock",
  ADJUSTMENT: "Ajuste",
  TREASURY_INFLOW: "Ingreso de tesorería",
  TREASURY_OUTFLOW: "Egreso de tesorería",
};

export function journalEntrySourceLabel(source: string, reversesEntryId?: string | null) {
  return reversesEntryId ? "Reversa de asiento" : sourceLabels[source as JournalEntrySourceType] ?? "Otro origen";
}
