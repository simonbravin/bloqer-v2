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
  { value: "week",  label: "Por semana" },
  { value: "day",   label: "Por día" },
];

export function ProjectCashFlowFilters() {
  const router   = useRouter();
  const pathname = usePathname();
  const sp       = useSearchParams();

  function update(key: string, value: string) {
    const params = new URLSearchParams(sp.toString());
    if (value) params.set(key, value); else params.delete(key);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Desde</Label>
        <Input
          type="date"
          defaultValue={sp.get("dateFrom") ?? ""}
          onChange={(e) => update("dateFrom", e.target.value)}
          className="w-36"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Hasta</Label>
        <Input
          type="date"
          defaultValue={sp.get("dateTo") ?? ""}
          onChange={(e) => update("dateTo", e.target.value)}
          className="w-36"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Período</Label>
        <Select
          value={sp.get("period") ?? "month"}
          onValueChange={(v) => update("period", v === "month" ? "" : v)}
        >
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            {PERIOD_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
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
