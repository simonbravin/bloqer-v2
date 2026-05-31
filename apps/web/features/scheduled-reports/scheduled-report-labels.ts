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

export const EMAIL_DELIVERY_STATUS_LABEL: Record<EmailDeliveryStatus, string> = {
  PENDING: "Pendiente",
  SENT: "Enviado",
  SKIPPED: "Omitido",
  FAILED: "Fallido",
};

export function runStatusBadgeVariant(
  status: ScheduledReportRunStatus | null | undefined,
): "default" | "secondary" | "destructive" | "outline" {
  if (!status) return "outline";
  if (status === "SUCCESS") return "default";
  if (status === "FAILED") return "destructive";
  return "secondary";
}

export function deliveryStatusBadgeVariant(
  status: EmailDeliveryStatus,
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "SENT") return "default";
  if (status === "FAILED") return "destructive";
  return "secondary";
}
