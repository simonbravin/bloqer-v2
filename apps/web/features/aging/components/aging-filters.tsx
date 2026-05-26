"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { CurrencyFilterSelect } from "@/components/ui/currency-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AgingBucket } from "@bloqer/services";

const BUCKET_OPTIONS: { value: AgingBucket | ""; label: string }[] = [
  { value: "",        label: "Todos los vencimientos" },
  { value: "current", label: "Al día" },
  { value: "1_30",    label: "1–30 días" },
  { value: "31_60",   label: "31–60 días" },
  { value: "61_90",   label: "61–90 días" },
  { value: "90_plus", label: "+90 días" },
];

export function AgingFilters() {
  const router     = useRouter();
  const pathname   = usePathname();
  const sp         = useSearchParams();

  function update(key: string, value: string) {
    const params = new URLSearchParams(sp.toString());
    if (value) params.set(key, value); else params.delete(key);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-[200px] flex-1">
        <Label className="text-xs text-muted-foreground mb-1 block">Buscar</Label>
        <Input
          placeholder="Cliente / factura / proyecto"
          defaultValue={sp.get("search") ?? ""}
          onBlur={(e) => update("search", e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") update("search", (e.target as HTMLInputElement).value); }}
        />
      </div>

      <div className="min-w-[180px]">
        <Label className="text-xs text-muted-foreground mb-1 block">Moneda</Label>
        <CurrencyFilterSelect
          value={sp.get("currency") ?? ""}
          onValueChange={(v) => update("currency", v)}
        />
      </div>

      <div className="min-w-[160px]">
        <Label className="text-xs text-muted-foreground mb-1 block">Vencimiento</Label>
        <Select value={sp.get("bucket") ?? "_all"} onValueChange={(v) => update("bucket", v === "_all" ? "" : v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {BUCKET_OPTIONS.map((o) => (
              <SelectItem key={o.value || "_all"} value={o.value || "_all"}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="min-w-[160px]">
        <Label className="text-xs text-muted-foreground mb-1 block">Al día</Label>
        <Input
          type="date"
          defaultValue={sp.get("asOfDate") ?? ""}
          onBlur={(e) => update("asOfDate", e.target.value)}
          onChange={(e) => update("asOfDate", e.target.value)}
        />
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
