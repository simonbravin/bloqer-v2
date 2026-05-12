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

const TYPE_OPTIONS = [
  { value: "_all",        label: "Todos los tipos" },
  { value: "IN",          label: "Ingreso" },
  { value: "OUT",         label: "Egreso" },
  { value: "TRANSFER_IN", label: "Transf. entrada" },
  { value: "TRANSFER_OUT",label: "Transf. salida" },
  { value: "ADJUSTMENT",  label: "Ajuste" },
];

const SOURCE_OPTIONS = [
  { value: "_all",             label: "Todos los orígenes" },
  { value: "PURCHASE_RECEIPT", label: "Recepción de compra" },
  { value: "CONSUMPTION",      label: "Consumo" },
  { value: "TRANSFER",         label: "Transferencia" },
  { value: "ADJUSTMENT",       label: "Ajuste" },
  { value: "OPENING_BALANCE",  label: "Saldo inicial" },
];

interface StockReportFiltersProps {
  mode: "balance" | "movements";
}

export function StockReportFilters({ mode }: StockReportFiltersProps) {
  const router   = useRouter();
  const pathname = usePathname();
  const sp       = useSearchParams();

  function update(key: string, value: string) {
    const params = new URLSearchParams(sp.toString());
    if (value) params.set(key, value); else params.delete(key);
    router.push(`${pathname}?${params.toString()}`);
  }

  if (mode === "balance") {
    return (
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Stock cero</Label>
          <Select
            value={sp.get("includeZeroStock") ?? "_hide"}
            onValueChange={(v) => update("includeZeroStock", v === "_hide" ? "" : v)}
          >
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_hide">Ocultar stock cero</SelectItem>
              <SelectItem value="true">Incluir stock cero</SelectItem>
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
        <Label className="text-xs text-muted-foreground">Tipo</Label>
        <Select
          value={sp.get("movementType") ?? "_all"}
          onValueChange={(v) => update("movementType", v === "_all" ? "" : v)}
        >
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            {TYPE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Origen</Label>
        <Select
          value={sp.get("sourceType") ?? "_all"}
          onValueChange={(v) => update("sourceType", v === "_all" ? "" : v)}
        >
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            {SOURCE_OPTIONS.map((o) => (
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
