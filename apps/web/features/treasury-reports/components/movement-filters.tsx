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
  { value: "INFLOW",      label: "Ingreso" },
  { value: "OUTFLOW",     label: "Egreso" },
  { value: "TRANSFER_IN", label: "Transferencia entrada" },
  { value: "TRANSFER_OUT",label: "Transferencia salida" },
  { value: "ADJUSTMENT",  label: "Ajuste" },
];

const SOURCE_OPTIONS = [
  { value: "_all",             label: "Todos los orígenes" },
  { value: "COLLECTION",       label: "Cobranza" },
  { value: "PAYMENT",          label: "Pago" },
  { value: "INTERNAL_TRANSFER",label: "Transferencia interna" },
  { value: "OPENING_BALANCE",  label: "Saldo inicial" },
  { value: "MANUAL_ADJUSTMENT",label: "Ajuste manual" },
];

export function MovementFilters() {
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
        <Label className="text-xs text-muted-foreground">Moneda</Label>
        <Input
          placeholder="ARS, USD…"
          defaultValue={sp.get("currency") ?? ""}
          onBlur={(e) => update("currency", e.target.value.toUpperCase())}
          onKeyDown={(e) => { if (e.key === "Enter") update("currency", (e.target as HTMLInputElement).value.toUpperCase()); }}
          className="w-24 uppercase"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Tipo</Label>
        <Select
          value={sp.get("type") ?? "_all"}
          onValueChange={(v) => update("type", v === "_all" ? "" : v)}
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
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Transf. internas</Label>
        <Select
          value={sp.get("includeInternalTransfers") ?? "_all"}
          onValueChange={(v) => update("includeInternalTransfers", v === "_all" ? "" : v)}
        >
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">Incluir todas</SelectItem>
            <SelectItem value="false">Excluir internas</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Pagos AP empresa</Label>
        <Select
          value={sp.get("corporateApPayments") ?? "_all"}
          onValueChange={(v) => update("corporateApPayments", v === "_all" ? "" : v)}
        >
          <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">Todos los pagos</SelectItem>
            <SelectItem value="true">Solo corporativos (sin obra)</SelectItem>
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
