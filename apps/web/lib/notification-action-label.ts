import type { NotificationListItem } from "@bloqer/services";
import { actionLabelForNotification } from "@bloqer/services";

/** Short CTA copy for in-app notification deep links (Spanish UI). */
export function notificationActionLinkLabel(
  type: NotificationListItem["type"],
  actionUrl: string | null,
  linkedEntityType: NotificationListItem["linkedEntityType"] = null,
): string {
  if (type === "PAYABLE_READY_TO_PAY") {
    return actionUrl?.includes("/pagar") ? "Registrar pago" : "Ver cuenta por pagar";
  }
  if (type === "RECEIVABLE_READY_TO_COLLECT") {
    return actionUrl?.includes("/cobrar") ? "Registrar cobranza" : "Ver cuenta por cobrar";
  }
  if (type === "PROCUREMENT_SLA_REMINDER") {
    return "Revisar pendientes";
  }
  return actionLabelForNotification(type, linkedEntityType, actionUrl);
}
