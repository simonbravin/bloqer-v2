"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { computeDateRangePreset } from "@bloqer/utils";
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
import { CurrencyFilterSelect } from "@/components/ui/currency-select";
import { DateRangePresets } from "@/components/ui/date-range-presets";

const TYPE_OPTIONS = [
  { value: "_all", label: "Todos los tipos" },
  { value: "INFLOW", label: "Ingreso" },
  { value: "OUTFLOW", label: "Egreso" },
  { value: "TRANSFER_IN", label: "Transferencia entrada" },
  { value: "TRANSFER_OUT", label: "Transferencia salida" },
  { value: "ADJUSTMENT", label: "Ajuste" },
];

const SOURCE_OPTIONS = [
  { value: "_all", label: "Todos los orígenes" },
  { value: "COLLECTION", label: "Cobranza" },
  { value: "PAYMENT", label: "Pago" },
  { value: "INTERNAL_TRANSFER", label: "Transferencia interna" },
  { value: "OPENING_BALANCE", label: "Saldo inicial" },
  { value: "MANUAL_ADJUSTMENT", label: "Ingreso manual de caja" },
];

const SCOPE_OPTIONS = [
  { value: "_all", label: "Todos los alcances" },
  { value: "corporate", label: "Solo empresa" },
  { value: "project", label: "Solo obra" },
];

export type MovementFilterProjectOption = { id: string; name: string };

export type MovementFiltersProps = {
  preserveParams?: string[];
  /** Treasury report: corporate AP filter. Finance transacciones: scope + project. */
  variant?: "treasury" | "finance";
  projects?: MovementFilterProjectOption[];
};

export function MovementFilters({
  preserveParams = [],
  variant = "treasury",
  projects = [],
}: MovementFiltersProps) {
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

  function updateScope(value: string) {
    const params = new URLSearchParams(sp.toString());
    params.delete("scope");
    params.delete("projectId");
    params.delete("page");
    if (value && value !== "_all") params.set("scope", value);
    router.push(`${pathname}?${params.toString()}`);
  }

  function updateProject(value: string) {
    const params = new URLSearchParams(sp.toString());
    params.delete("page");
    if (value && value !== "_all") {
      params.set("projectId", value);
      params.delete("scope");
    } else {
      params.delete("projectId");
    }
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

  const scopeValue = sp.get("projectId") ? "_all" : (sp.get("scope") ?? "_all");
  const internalTransfersValue =
    variant === "finance"
      ? sp.get("includeInternalTransfers") === "true"
        ? "true"
        : "false"
      : (sp.get("includeInternalTransfers") ?? "_all");

  // Finance applies a 90-day default server-side when URL has no dates; mirror that
  // in the inputs so presets and Desde/Hasta stay in sync (controlled values).
  const financeDefaults = variant === "finance" ? computeDateRangePreset("d90") : null;
  const dateFrom = sp.get("dateFrom") ?? financeDefaults?.dateFrom ?? "";
  const dateTo = sp.get("dateTo") ?? financeDefaults?.dateTo ?? "";

  return (
    <div className="space-y-3">
      <DateRangePresets defaultPreset={variant === "finance" ? "d90" : null} />
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
        {variant === "finance" && (
          <>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Alcance</Label>
              <Select value={scopeValue} onValueChange={updateScope}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SCOPE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {projects.length > 0 && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Proyecto</Label>
                <Select
                  value={sp.get("projectId") ?? "_all"}
                  onValueChange={updateProject}
                >
                  <SelectTrigger className="w-52">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_all">Todos los proyectos</SelectItem>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </>
        )}
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Moneda</Label>
          <CurrencyFilterSelect
            value={sp.get("currency") ?? ""}
            onValueChange={(v) => update("currency", v)}
            triggerClassName="w-[14rem]"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Tipo</Label>
          <Select
            value={sp.get("type") ?? "_all"}
            onValueChange={(v) => update("type", v === "_all" ? "" : v)}
          >
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TYPE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
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
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SOURCE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Transf. internas</Label>
          <Select
            value={internalTransfersValue}
            onValueChange={(v) =>
              update(
                "includeInternalTransfers",
                variant === "finance"
                  ? v === "true"
                    ? "true"
                    : "false"
                  : v === "_all"
                    ? ""
                    : v,
              )
            }
          >
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {variant === "treasury" ? (
                <>
                  <SelectItem value="_all">Incluir todas</SelectItem>
                  <SelectItem value="false">Excluir internas</SelectItem>
                </>
              ) : (
                <>
                  <SelectItem value="false">Excluir internas</SelectItem>
                  <SelectItem value="true">Incluir internas</SelectItem>
                </>
              )}
            </SelectContent>
          </Select>
        </div>
        {variant === "treasury" && (
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Pagos AP empresa</Label>
            <Select
              value={sp.get("corporateApPayments") ?? "_all"}
              onValueChange={(v) => update("corporateApPayments", v === "_all" ? "" : v)}
            >
              <SelectTrigger className="w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">Todos los pagos</SelectItem>
                <SelectItem value="true">Solo corporativos (sin obra)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
        <Button variant="ghost" size="sm" onClick={clearFilters} className="self-end">
          Limpiar
        </Button>
      </div>
    </div>
  );
}
