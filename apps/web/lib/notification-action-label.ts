import type { NotificationListItem } from "@bloqer/services";

/** Short CTA copy for in-app notification deep links (Spanish UI). */
export function notificationActionLinkLabel(
  type: NotificationListItem["type"],
  actionUrl: string | null,
): string {
  switch (type) {
    case "PAYABLE_READY_TO_PAY":
      return actionUrl?.includes("/pagar") ? "Registrar pago" : "Ver cuenta por pagar";
    case "PAYMENT_CONFIRMED":
      return "Ver factura";
    case "PURCHASE_ORDER_PENDING_APPROVAL":
    case "PURCHASE_ORDER_RETURNED":
    case "PURCHASE_ORDER_APPROVED":
    case "PURCHASE_ORDER_CONFIRMED":
      return "Ver orden de compra";
    case "PURCHASE_REQUEST_SUBMITTED":
      return "Ver solicitud";
    case "PROCUREMENT_SLA_REMINDER":
      return "Revisar pendientes";
    case "RECEIVABLE_OVERDUE":
      return "Ver cobranza";
    case "PAYABLE_OVERDUE":
      return "Ver cuenta por pagar";
    default:
      return "Abrir detalle";
  }
}
