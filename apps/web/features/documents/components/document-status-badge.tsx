const STATUS_LABELS: Record<string, string> = {
  UPLOADING: "Subiendo",
  ACTIVE:    "Activo",
  ARCHIVED:  "Archivado",
  DELETED:   "Eliminado",
};

const STATUS_COLORS: Record<string, string> = {
  UPLOADING: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  ACTIVE:    "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  ARCHIVED:  "bg-muted text-muted-foreground",
  DELETED:   "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

export function DocumentStatusBadge({ status }: { status: string }) {
  const label = STATUS_LABELS[status] ?? status;
  const color = STATUS_COLORS[status] ?? STATUS_COLORS.ACTIVE;
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${color}`}>
      {label}
    </span>
  );
}
