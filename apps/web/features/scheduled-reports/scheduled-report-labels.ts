import type { ScheduledReportRunStatus, ScheduledReportStatus } from "@bloqer/database";
import type { EmailDeliveryStatus } from "@bloqer/database";

export const SCHEDULED_REPORT_STATUS_LABEL: Record<ScheduledReportStatus, string> = {
  ACTIVE: "Activo",
  PAUSED: "Pausado",
  DELETED: "Eliminado",
};

export const SCHEDULED_REPORT_FREQUENCY_LABEL: Record<string, string> = {
  DAILY: "Diario",
  WEEKLY: "Semanal",
  MONTHLY: "Mensual",
};

export const SCHEDULED_REPORT_RUN_STATUS_LABEL: Record<ScheduledReportRunStatus, string> = {
  SUCCESS: "Correcto",
  PARTIAL: "Parcial",
  FAILED: "Fallido",
  SKIPPED: "Omitido",
};

/** Short tooltip / help under run badges — ops should not need server logs. */
export const SCHEDULED_REPORT_RUN_STATUS_HINT: Record<ScheduledReportRunStatus, string> = {
  SUCCESS: "Todos los envíos de la corrida se completaron.",
  PARTIAL: "Algunos destinatarios se enviaron y otros fallaron u omitieron.",
  FAILED: "La corrida no pudo entregar el reporte (error de generación o de envío).",
  SKIPPED:
    "La corrida no envió mails (p. ej. Resend no configurado, sin destinatarios, envío pausado o destinatarios ya procesados).",
};

export const EMAIL_DELIVERY_STATUS_LABEL: Record<EmailDeliveryStatus, string> = {
  PENDING: "Pendiente",
  SENT: "Enviado",
  SKIPPED: "Omitido",
  FAILED: "Fallido",
};

/** Clarifies SKIPPED (config) vs FAILED (error) for ops. */
export const EMAIL_DELIVERY_STATUS_HINT: Record<EmailDeliveryStatus, string> = {
  PENDING: "El intento quedó registrado y aún no tiene resultado final.",
  SENT: "El proveedor aceptó el envío.",
  SKIPPED:
    "No se intentó enviar (p. ej. Resend apagado, email inválido o destinatario sin casilla). No es un fallo del proveedor.",
  FAILED: "Se intentó enviar y el proveedor o la validación devolvieron error.",
};

export function runStatusBadgeVariant(
  status: ScheduledReportRunStatus | null | undefined,
): "default" | "secondary" | "destructive" | "outline" {
  if (!status) return "outline";
  if (status === "SUCCESS") return "default";
  if (status === "FAILED") return "destructive";
  if (status === "SKIPPED") return "outline";
  return "secondary";
}

export function deliveryStatusBadgeVariant(
  status: EmailDeliveryStatus,
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "SENT") return "default";
  if (status === "FAILED") return "destructive";
  return "secondary";
}
