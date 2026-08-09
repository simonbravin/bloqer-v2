const LABELS: Record<string, string> = {
  DRAFT: "Borrador",
  IN_PROGRESS: "En progreso",
  CLOSED: "Cerrada",
  CANCELLED: "Cancelada",
};

export function bankReconciliationStatusLabel(status: string): string {
  return LABELS[status] ?? status;
}
