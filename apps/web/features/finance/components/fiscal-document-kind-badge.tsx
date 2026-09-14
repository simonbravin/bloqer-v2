import { cn } from "@/lib/utils";
import { fiscalDocumentKindLabel, type FiscalDocumentKindCode } from "@bloqer/domain";
import { Badge } from "@/components/ui/badge";

const KIND_CLASS: Record<FiscalDocumentKindCode, string> = {
  INVOICE:
    "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-200",
  CREDIT_NOTE:
    "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200",
  DEBIT_NOTE:
    "border-orange-200 bg-orange-50 text-orange-900 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-200",
};

export type FiscalDocumentKindBadgeProps = {
  documentKind: string | null | undefined;
  className?: string;
};

/** Badge for persisted fiscal voucher kind ([D-115]) — distinct from Clase ([D-102]). */
export function FiscalDocumentKindBadge({
  documentKind,
  className,
}: FiscalDocumentKindBadgeProps) {
  const kind: FiscalDocumentKindCode =
    documentKind === "CREDIT_NOTE" || documentKind === "DEBIT_NOTE" || documentKind === "INVOICE"
      ? documentKind
      : "INVOICE";
  return (
    <Badge
      variant="outline"
      className={cn("font-normal", KIND_CLASS[kind], className)}
      title="Tipo de documento"
    >
      {fiscalDocumentKindLabel(kind)}
    </Badge>
  );
}
