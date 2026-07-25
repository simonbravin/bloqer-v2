"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { computeDateRangePreset, toIsoDateInTimeZone } from "@bloqer/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { DateRangePresets } from "@/components/ui/date-range-presets";

type Props = {
  /** When true, only shows asOfDate (ESP). */
  asOf?: boolean;
  preserveParams?: string[];
};

export function AccountingReportFilters({ asOf = false, preserveParams = ["empresa"] }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  function update(key: string, value: string) {
    const params = new URLSearchParams(sp.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  }

  function clearFilters() {
    const params = new URLSearchParams();
    for (const key of preserveParams) {
      const v = sp.get(key);
      if (v) params.set(key, v);
    }
    router.push(params.size ? `${pathname}?${params.toString()}` : pathname);
  }

  if (asOf) {
    const today = toIsoDateInTimeZone(new Date());
    const asOfDate = sp.get("asOfDate") ?? today;
    return (
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Al día</Label>
          <Input
            type="date"
            value={asOfDate}
            onChange={(e) => update("asOfDate", e.target.value)}
            className="w-40"
          />
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
          Limpiar
        </Button>
      </div>
    );
  }

  const defaults = computeDateRangePreset("month");
  const dateFrom = sp.get("dateFrom") ?? defaults.dateFrom;
  const dateTo = sp.get("dateTo") ?? defaults.dateTo;

  return (
    <div className="space-y-3">
      <DateRangePresets defaultPreset="month" />
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Desde</Label>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => update("dateFrom", e.target.value)}
            className="w-36"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Hasta</Label>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => update("dateTo", e.target.value)}
            className="w-36"
          />
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
          Limpiar
        </Button>
      </div>
    </div>
  );
}
