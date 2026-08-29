"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const TREND_MONTH_CHIPS = [
  { months: 1, label: "Este mes" },
  { months: 3, label: "3 meses" },
  { months: 6, label: "6 meses" },
  { months: 12, label: "12 meses" },
] as const;

/** URL `?months=` wins so the chip updates before the RSC payload arrives. */
export function readTrendMonthsParam(raw: string | null, fallback: number): number {
  const n = Number(raw);
  return n === 1 || n === 3 || n === 6 || n === 12 ? n : fallback;
}

export function MonthlyTrendRangeToggle({
  months,
  onChange,
  className,
}: {
  months: number;
  onChange: (months: number) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex max-w-full overflow-x-auto rounded-lg border border-border/80 bg-muted/30 p-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
      role="group"
      aria-label="Rango de tendencia"
    >
      {TREND_MONTH_CHIPS.map((opt) => {
        const active = months === opt.months;
        return (
          <Button
            key={opt.months}
            type="button"
            size="sm"
            variant="ghost"
            className={cn(
              "h-8 shrink-0 rounded-md px-2.5 text-xs font-medium sm:px-3",
              active && "bg-background text-foreground shadow-sm",
            )}
            aria-pressed={active}
            onClick={() => onChange(opt.months)}
          >
            {opt.label}
          </Button>
        );
      })}
    </div>
  );
}
