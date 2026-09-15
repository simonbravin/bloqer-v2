/**
 * Client-safe labels for Pendientes / compras stages.
 * Keep free of Prisma / server-only so web UI can import via
 * `@bloqer/services/field-pending-labels`.
 */

export type FieldPendingComprasStageSource =
  | "PURCHASE_REQUEST"
  | "PURCHASE_ORDER"
  | "PURCHASE_ORDER_CONFIRM"
  | "PURCHASE_ORDER_RECEIPT"
  | "PURCHASE_ORDER_INVOICE";

export const FIELD_PENDING_COMPRAS_STAGE_LABEL: Record<FieldPendingComprasStageSource, string> = {
  PURCHASE_REQUEST: "Cotizar",
  PURCHASE_ORDER: "Aprobación",
  PURCHASE_ORDER_CONFIRM: "Confirmar",
  PURCHASE_ORDER_RECEIPT: "Recibir",
  PURCHASE_ORDER_INVOICE: "Facturar",
};

export function fieldPendingComprasStageLabel(source: string): string | null {
  return (
    FIELD_PENDING_COMPRAS_STAGE_LABEL[source as FieldPendingComprasStageSource] ?? null
  );
}
