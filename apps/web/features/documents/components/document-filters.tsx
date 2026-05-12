"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const CATEGORY_OPTIONS = [
  { value: "_all",             label: "Todas las categorías" },
  { value: "CONTRACT",         label: "Contrato" },
  { value: "PLAN",             label: "Plano" },
  { value: "PERMIT",           label: "Permiso" },
  { value: "TECHNICAL",        label: "Técnico" },
  { value: "PHOTO",            label: "Foto" },
  { value: "INVOICE",          label: "Factura" },
  { value: "RECEIPT",          label: "Remito" },
  { value: "CERTIFICATE",      label: "Certificado" },
  { value: "REPORT",           label: "Informe" },
  { value: "JOBSITE_EVIDENCE", label: "Evidencia obra" },
  { value: "OTHER",            label: "Otro" },
];

const STATUS_OPTIONS = [
  { value: "ACTIVE",   label: "Activos" },
  { value: "ARCHIVED", label: "Archivados" },
];

export function DocumentFilters() {
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
      <div className="space-y-1 flex-1 min-w-40">
        <Label className="text-xs text-muted-foreground">Buscar</Label>
        <Input
          placeholder="Nombre o descripción..."
          defaultValue={sp.get("search") ?? ""}
          onChange={(e) => update("search", e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Categoría</Label>
        <Select
          value={sp.get("category") ?? "_all"}
          onValueChange={(v) => update("category", v === "_all" ? "" : v)}
        >
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            {CATEGORY_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Estado</Label>
        <Select
          value={sp.get("status") ?? "ACTIVE"}
          onValueChange={(v) => update("status", v)}
        >
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((o) => (
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
