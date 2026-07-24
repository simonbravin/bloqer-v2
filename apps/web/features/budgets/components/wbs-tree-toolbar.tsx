"use client";

import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { WbsViewBase, WbsViewDetail, WbsViewMode } from "../lib/wbs-view-mode";

export type { WbsViewMode } from "../lib/wbs-view-mode";

function Segment<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { id: T; label: string; disabled?: boolean }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border bg-muted/40 p-0.5">
      {options.map((opt) => (
        <Button
          key={opt.id}
          type="button"
          size="sm"
          variant="ghost"
          disabled={opt.disabled}
          className={cn(
            "h-8 rounded-md px-2.5 text-xs font-medium",
            value === opt.id &&
              "bg-primary text-primary-foreground shadow-sm hover:bg-primary hover:text-primary-foreground",
          )}
          onClick={() => onChange(opt.id)}
        >
          {opt.label}
        </Button>
      ))}
    </div>
  );
}

function ToggleChip({
  pressed,
  label,
  title,
  onClick,
}: {
  pressed: boolean;
  label: string;
  title: string;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      title={title}
      className={cn(
        "h-8 rounded-md border px-2.5 text-xs font-medium",
        pressed &&
          "border-primary bg-primary text-primary-foreground shadow-sm hover:bg-primary hover:text-primary-foreground",
      )}
      onClick={onClick}
      aria-pressed={pressed}
    >
      {label}
    </Button>
  );
}

interface WbsTreeToolbarProps {
  viewMode: WbsViewMode;
  onPatchViewMode: (patch: Partial<WbsViewMode>) => void;
  search: string;
  onSearchChange: (value: string) => void;
}

export function WbsTreeToolbar({
  viewMode,
  onPatchViewMode,
  search,
  onSearchChange,
}: WbsTreeToolbarProps) {
  return (
    <div className="flex flex-col gap-3 border-b border-border/60 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <Segment<WbsViewBase>
          value={viewMode.base}
          onChange={(base) => onPatchViewMode({ base })}
          options={[
            { id: "cost", label: "Costo" },
            { id: "sale", label: "Venta" },
          ]}
        />
        <Segment<WbsViewDetail>
          value={viewMode.base === "sale" ? "compact" : viewMode.detail}
          onChange={(detail) => onPatchViewMode({ detail })}
          options={[
            { id: "compact", label: "Compacto" },
            {
              id: "breakdown",
              label: "Desglose",
              disabled: viewMode.base === "sale",
            },
          ]}
        />
        <ToggleChip
          pressed={viewMode.showUnit}
          label="Unitario"
          title="Mostrar columnas unitarias además de los totales (siempre visibles)"
          onClick={() => onPatchViewMode({ showUnit: !viewMode.showUnit })}
        />
        <ToggleChip
          pressed={viewMode.showIncidence}
          label="Incidencia"
          title={
            viewMode.base === "sale"
              ? "Mostrar % de incidencia sobre el total de venta"
              : "Mostrar % de incidencia sobre el costo directo total"
          }
          onClick={() => onPatchViewMode({ showIncidence: !viewMode.showIncidence })}
        />
      </div>

      <div className="relative w-full sm:max-w-md">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Buscar por código, nombre, descripción o insumo APU..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>
    </div>
  );
}
