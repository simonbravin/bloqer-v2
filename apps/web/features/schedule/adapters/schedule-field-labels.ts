export const FIELD_STATUS_LABELS: Record<string, string> = {
  PLANNED: "Planificada",
  IN_PROGRESS: "En curso",
  BLOCKED: "Bloqueada",
  COMPLETED: "Completada",
  CANCELLED: "Anulada",
};

export function formatProgressPctLabel(raw: string | null | undefined): string | null {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  if (Number.isNaN(n)) return null;
  return String(Math.round(n));
}

/** UI fragment: `45%` or em dash — never `—%`. */
export function formatProgressPctDisplay(raw: string | null | undefined): string {
  const n = formatProgressPctLabel(raw);
  return n == null ? "—" : `${n}%`;
}
