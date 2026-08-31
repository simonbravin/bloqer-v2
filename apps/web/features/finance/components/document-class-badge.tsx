import { cn } from "@/lib/utils";
import type { FinancialDocumentClassFamily } from "@bloqer/domain";
import { Badge } from "@/components/ui/badge";

const FAMILY_CLASS: Record<FinancialDocumentClassFamily, string> = {
  sale: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
  income:
    "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
  purchase:
    "border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-200",
  direct:
    "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
  overhead:
    "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-200",
  payment:
    "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200",
  cash: "border-teal-200 bg-teal-50 text-teal-800 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-200",
};

export type DocumentClassBadgeProps = {
  classLabel: string;
  classFamily?: string | null;
  className?: string;
};

/** Compact badge for derived financial document class ([D-102]). */
export function DocumentClassBadge({
  classLabel,
  classFamily,
  className,
}: DocumentClassBadgeProps) {
  const family = (classFamily ?? "overhead") as FinancialDocumentClassFamily;
  const tone = FAMILY_CLASS[family] ?? FAMILY_CLASS.overhead;
  return (
    <Badge
      variant="outline"
      className={cn("font-normal", tone, className)}
      title="Clase derivada (no se elige a mano)"
    >
      {classLabel}
    </Badge>
  );
}

/** Hint shown on create forms: “Se registrará como: …”. */
export function DocumentClassCreateHint({
  classLabel,
  classFamily,
  hint,
}: {
  classLabel: string;
  classFamily?: string | null;
  hint?: string | null;
}) {
  return (
    <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground">Se registrará como:</span>
        <DocumentClassBadge classLabel={classLabel} classFamily={classFamily} />
      </div>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
