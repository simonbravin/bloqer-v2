const STATUS_COLORS: Record<string, string> = {
  DRAFT: "#94a3b8",
  SUBMITTED: "#3b82f6",
  APPROVED: "#22c55e",
  CANCELLED: "#64748b",
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Borrador",
  SUBMITTED: "Enviado",
  APPROVED: "Aprobado",
  CANCELLED: "Cancelado",
};

export type JobsiteLogCalendarEntry = {
  id: string;
  logDate: string;
  status: string;
  label: string;
  color: string;
};

function toLogDateKey(logDate: string | Date): string {
  if (typeof logDate === "string") return logDate.slice(0, 10);
  const y = logDate.getUTCFullYear();
  const m = String(logDate.getUTCMonth() + 1).padStart(2, "0");
  const d = String(logDate.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function mapJobsiteLogToCalendarEntry(log: {
  id: string;
  logDate: string | Date;
  status: string;
  title: string | null;
  workFront: string | null;
}): JobsiteLogCalendarEntry {
  const label = log.title ?? log.workFront ?? "Parte de obra";
  return {
    id: log.id,
    logDate: toLogDateKey(log.logDate),
    status: log.status,
    label,
    color: STATUS_COLORS[log.status] ?? "#64748b",
  };
}

export { STATUS_LABELS, STATUS_COLORS };
