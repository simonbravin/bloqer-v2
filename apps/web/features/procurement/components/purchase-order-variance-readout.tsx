import { cn } from "@/lib/utils";
import { formatRatePctWithSymbol, isZeroRatePct, variancePctTone } from "@/lib/format-money";

const TONE_CLASS = {
  success: "text-emerald-600 dark:text-emerald-400",
  danger: "text-destructive",
  muted: "text-muted-foreground",
} as const;

function extraHint(
  tier: string | null | undefined,
  refKind?: string | null,
): string | null {
  if (tier === "UNIT_MISMATCH") return "Unidad distinta";
  if (tier === "NO_BUDGET_BASELINE") return "Sin referencial";
  if (tier === "NONE" && refKind === "GLOBAL_PARTIDA") return "Sin $/u comparable";
  return null;
}

/** Colored % vs budget + optional justification. Never dumps internal tier codes. */
export function PurchaseOrderVarianceReadout({
  variancePct,
  varianceTier,
  justification,
  refKind,
  compact = false,
}: {
  variancePct?: string | null;
  varianceTier?: string | null;
  justification?: string | null;
  refKind?: string | null;
  compact?: boolean;
}) {
  const hint = extraHint(varianceTier, refKind);
  const hasPct = variancePct != null && variancePct !== "" && !isZeroRatePct(variancePct);
  const note = justification?.trim() || null;
  if (!hasPct && !hint && !note) {
    if (compact) return null;
    return <span className="text-muted-foreground">—</span>;
  }
  const tone = hasPct ? variancePctTone(variancePct) : "muted";
  const noteClass = compact ? "text-[11px] text-muted-foreground" : "mt-0.5 text-[11px] text-muted-foreground line-clamp-2";

  return (
    <div className="space-y-0.5">
      {hasPct ? (
        <span className={cn("tabular-nums font-medium", TONE_CLASS[tone])}>
          {formatRatePctWithSymbol(variancePct)}
        </span>
      ) : hint ? (
        <span className="text-muted-foreground">{hint}</span>
      ) : null}
      {hasPct && hint ? <p className={noteClass}>{hint}</p> : null}
      {note ? <p className={noteClass}>{note}</p> : null}
    </div>
  );
}
