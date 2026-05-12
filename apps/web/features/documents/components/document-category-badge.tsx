const CATEGORY_LABELS: Record<string, string> = {
  CONTRACT:        "Contrato",
  PLAN:            "Plano",
  PERMIT:          "Permiso",
  TECHNICAL:       "Técnico",
  PHOTO:           "Foto",
  INVOICE:         "Factura",
  RECEIPT:         "Remito",
  CERTIFICATE:     "Certificado",
  REPORT:          "Informe",
  JOBSITE_EVIDENCE:"Evidencia obra",
  OTHER:           "Otro",
};

const CATEGORY_COLORS: Record<string, string> = {
  CONTRACT:        "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  PLAN:            "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  PERMIT:          "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  TECHNICAL:       "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400",
  PHOTO:           "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400",
  INVOICE:         "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  RECEIPT:         "bg-lime-100 text-lime-700 dark:bg-lime-900/30 dark:text-lime-400",
  CERTIFICATE:     "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  REPORT:          "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
  JOBSITE_EVIDENCE:"bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  OTHER:           "bg-muted text-muted-foreground",
};

export function DocumentCategoryBadge({ category }: { category: string }) {
  const label = CATEGORY_LABELS[category] ?? category;
  const color = CATEGORY_COLORS[category] ?? CATEGORY_COLORS.OTHER;
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${color}`}>
      {label}
    </span>
  );
}

export { CATEGORY_LABELS };
