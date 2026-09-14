import { Badge } from "@/components/ui/badge";
import type { AccountingMappingEventType } from "@bloqer/database";

const LABELS: Record<AccountingMappingEventType, string> = {
  COLLECTION_CONFIRMED:          "Cobranza confirmada",
  PAYMENT_CONFIRMED:             "Pago confirmado",
  TREASURY_INFLOW:               "Tesorería — ingreso",
  TREASURY_OUTFLOW:              "Tesorería — egreso",
  TREASURY_TRANSFER:             "Tesorería — transferencia",
  STOCK_CONSUMPTION:             "Inventario — consumo",
  MANUAL_CAPITAL_CONTRIBUTION:   "Aporte de capital (manual)",
  MANUAL_OWNER_LOAN:             "Préstamo de socio (manual)",
  SALES_INVOICE_ISSUED:          "Factura de venta emitida",
  SUPPLIER_INVOICE_ISSUED:       "Factura de proveedor emitida",
  SALES_CREDIT_NOTE_ISSUED:      "Nota de crédito de venta emitida",
  SALES_DEBIT_NOTE_ISSUED:       "Nota de débito de venta emitida",
  SUPPLIER_CREDIT_NOTE_ISSUED:   "Nota de crédito de proveedor emitida",
  SUPPLIER_DEBIT_NOTE_ISSUED:    "Nota de débito de proveedor emitida",
};

export function AccountingEventTypeBadge({ eventType }: { eventType: AccountingMappingEventType }) {
  return <Badge variant="secondary">{LABELS[eventType]}</Badge>;
}

export const ACCOUNTING_EVENT_TYPE_OPTIONS: { value: AccountingMappingEventType; label: string }[] = (
  Object.entries(LABELS) as [AccountingMappingEventType, string][]
).map(([value, label]) => ({ value, label }));
