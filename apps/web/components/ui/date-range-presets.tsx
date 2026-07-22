"use client";

import { useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  computeDateRangePreset,
  type DateRangePresetId,
} from "@bloqer/utils";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Canonical temporality control (segmented pill) for date-range filtering.
 *
 * Standard control for quick date presets across the platform. Writes the
 * selected range into the URL (`fromKey`/`toKey`) and resets pagination.
 * Coexists with explicit "Desde/Hasta" inputs: presets just fill those dates,
 * so custom ranges keep working. When the current dates match no preset, no
 * pill is highlighted (custom range).
 *
 * Visual style matches the dashboard cash-flow period selector.
 * Calendar bounds use America/Argentina/Buenos_Aires (product TZ).
 */

const PRESETS: { id: DateRangePresetId; label: string }[] = [
  { id: "week", label: "Esta semana" },
  { id: "month", label: "Este mes" },
  { id: "d90", label: "Últimos 90 días" },
  { id: "ytd", label: "Este año" },
];

export type { DateRangePresetId };

export type DateRangePresetsProps = {
  /** URL param for range start. Defaults to "dateFrom". */
  fromKey?: string;
  /** URL param for range end. Defaults to "dateTo". */
  toKey?: string;
  /**
   * Preset assumed active when no dates are present in the URL (the page
   * default). Defaults to "d90" to match the movement ledger default range.
   * Pass `null` when the page has no implicit default range (e.g. all-time),
   * so no pill is highlighted until the user picks one.
   */
  defaultPreset?: DateRangePresetId | null;
  className?: string;
};

export function DateRangePresets({
  fromKey = "dateFrom",
  toKey = "dateTo",
  defaultPreset = "d90",
  className,
}: DateRangePresetsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const curFrom = sp.get(fromKey);
  const curTo = sp.get(toKey);

  const activeId = useMemo<DateRangePresetId | null>(() => {
    if (!curFrom && !curTo) return defaultPreset ?? null;
    for (const preset of PRESETS) {
      const range = computeDateRangePreset(preset.id);
      if (range.dateFrom === curFrom && range.dateTo === curTo) return preset.id;
    }
    return null;
  }, [curFrom, curTo, defaultPreset]);

  function selectPreset(id: DateRangePresetId) {
    const { dateFrom, dateTo } = computeDateRangePreset(id);
    const params = new URLSearchParams(sp.toString());
    params.set(fromKey, dateFrom);
    params.set(toKey, dateTo);
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div
      className={cn(
        "inline-flex flex-wrap rounded-lg border border-border/80 bg-muted/30 p-0.5",
        className,
      )}
      role="group"
      aria-label="Rango de fechas"
    >
      {PRESETS.map((preset) => (
        <Button
          key={preset.id}
          type="button"
          size="sm"
          variant="ghost"
          className={cn(
            "h-8 rounded-md px-3 text-xs font-medium",
            activeId === preset.id && "bg-background text-foreground shadow-sm",
          )}
          aria-pressed={activeId === preset.id}
          onClick={() => selectPreset(preset.id)}
        >
          {preset.label}
        </Button>
      ))}
    </div>
  );
}
