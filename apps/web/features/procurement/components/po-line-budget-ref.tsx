import { formatUnitPriceFromString } from "@/lib/format-money";
import { budgetUnitLabel } from "@/lib/budget-units";
import type { BudgetRefKind } from "@bloqer/services/purchase-variance-pure";

export function PoLineBudgetRef({
  unitCost,
  unit,
  refKind,
  suggestedApu,
  compact = false,
}: {
  unitCost?: string | null;
  unit?: string | null;
  refKind?: BudgetRefKind | null;
  suggestedApu?: { description: string; unit: string; unitCost: string } | null;
  compact?: boolean;
}) {
  const hintClass = compact
    ? "text-[11px] text-muted-foreground leading-snug"
    : "mt-0.5 text-[11px] text-muted-foreground leading-snug";
  const unitLabel = unit ? budgetUnitLabel(unit) || unit : null;

  if (unitCost) {
    return (
      <div>
        <span className="tabular-nums">
          {formatUnitPriceFromString(unitCost)}
          {unitLabel ? ` / ${unitLabel}` : ""}
        </span>
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
            ? `. APU: ${suggestedApu.description} · ${formatUnitPriceFromString(suggestedApu.unitCost)} / ${budgetUnitLabel(suggestedApu.unit) || suggestedApu.unit}`
            : ""}
        </p>
      </div>
    );
  }

  return (
    <div>
      <span className="text-muted-foreground">—</span>
      {suggestedApu ? (
        <p className={hintClass}>
          APU: {suggestedApu.description} · {formatUnitPriceFromString(suggestedApu.unitCost)} /{" "}
          {budgetUnitLabel(suggestedApu.unit) || suggestedApu.unit}
        </p>
      ) : null}
    </div>
  );
}
