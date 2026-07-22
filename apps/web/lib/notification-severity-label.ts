const SEVERITY_LABEL_ES: Record<string, string> = {
  INFO: "Info",
  SUCCESS: "Éxito",
  WARNING: "Aviso",
  ERROR: "Error",
};

/** UI label (es-AR) for notification severity enum. */
export function notificationSeverityLabelEs(severity: string): string {
  return SEVERITY_LABEL_ES[severity] ?? severity;
}
