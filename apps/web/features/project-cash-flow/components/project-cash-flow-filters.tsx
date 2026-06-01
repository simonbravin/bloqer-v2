"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const PERIOD_OPTIONS = [
  { value: "month", label: "Por mes" },
  { value: "week", label: "Por semana" },
  { value: "day", label: "Por día" },
] as const;

type CashFlowPeriod = (typeof PERIOD_OPTIONS)[number]["value"];

function parseCashFlowPeriod(value: string | null, fallback: CashFlowPeriod): CashFlowPeriod {
  if (value === "day" || value === "week" || value === "month") return value;
  return fallback;
}

export function ProjectCashFlowFilters({
  appliedDateFrom,
  appliedDateTo,
  appliedPeriod,
}: {
  appliedDateFrom: string;
  appliedDateTo: string;
  appliedPeriod: CashFlowPeriod;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  function update(key: string, value: string) {
    const params = new URLSearchParams(sp.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`${pathname}?${params.toString()}`);
  }

  const dateFrom = sp.get("dateFrom") ?? appliedDateFrom;
  const dateTo = sp.get("dateTo") ?? appliedDateTo;
  const period = parseCashFlowPeriod(sp.get("period"), appliedPeriod);

  return (
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
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Agrupación</Label>
        <Select value={period} onValueChange={(v) => update("period", v)}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERIOD_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => router.push(pathname)}
        className="self-end"
      >
        Limpiar
      </Button>
    </div>
  );
}
