import { formatUnitPriceFromString } from "@/lib/format-money";
import { budgetUnitLabel } from "@/lib/budget-units";
import type { BudgetRefKind } from "@bloqer/services/purchase-variance-pure";

export function PoLineBudgetRef({
  unitCost,
  unit,
  refKind,
  suggestedApu,
  compact = false,
  currency,
  purchaseCurrency,
}: {
  unitCost?: string | null;
  unit?: string | null;
  refKind?: BudgetRefKind | null;
  suggestedApu?: { description: string; unit: string; unitCost: string } | null;
  compact?: boolean;
  currency?: string | null;
  /** Informative only; services decide whether a deviation may be calculated. */
  purchaseCurrency?: string | null;
}) {
  const hintClass = compact
    ? "text-[11px] text-muted-foreground leading-snug"
    : "mt-0.5 text-[11px] text-muted-foreground leading-snug";
  const unitLabel = unit ? budgetUnitLabel(unit) || unit : null;
  const currencyLabel = currency?.trim() || "moneda no disponible";
  const comparisonNote = purchaseCurrency && currency !== purchaseCurrency
    ? currency
      ? `Referencia en ${currency} y cotización en ${purchaseCurrency}: desvío no calculable; no se aplica conversión automática.`
      : `Moneda de referencia no disponible; no se puede comparar con la cotización en ${purchaseCurrency}.`
    : null;
  const comparisonHint = comparisonNote ? <p className={hintClass} role="status">{comparisonNote}</p> : null;

  if (unitCost) {
    return (
      <div>
        <span className="tabular-nums">
          {formatUnitPriceFromString(unitCost)}
          {` ${currencyLabel}`}
          {unitLabel ? ` / ${unitLabel}` : ""}
        </span>
        {comparisonHint}
      </div>
    );
  }

  if (refKind === "GLOBAL_PARTIDA") {
    return (
      <div>
        <span className="text-muted-foreground">—</span>
        <p className={hintClass}>
          Partida en global · no es un $/u
          {suggestedApu
            ? `. APU: ${suggestedApu.description} · ${formatUnitPriceFromString(suggestedApu.unitCost)} ${currencyLabel} / ${budgetUnitLabel(suggestedApu.unit) || suggestedApu.unit}`
            : ""}
        </p>
        {comparisonHint}
      </div>
    );
  }

  return (
    <div>
      <span className="text-muted-foreground">—</span>
      {suggestedApu ? (
        <p className={hintClass}>
          APU: {suggestedApu.description} · {formatUnitPriceFromString(suggestedApu.unitCost)} {currencyLabel} /{" "}
          {budgetUnitLabel(suggestedApu.unit) || suggestedApu.unit}
        </p>
      ) : null}
      {comparisonHint}
    </div>
  );
}
