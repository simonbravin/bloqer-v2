"use client";

import { useMemo } from "react";
import type { MaterialsFieldRow } from "@bloqer/services/materials-field";
import {
  filterAndSortMaterialsFieldRows,
  limitMaterialsFieldRows,
  materialsFieldWindow,
  parseMaterialsFieldFilter,
  summarizeMaterialsFieldKpis,
  type MaterialsFieldFilterId,
} from "@bloqer/services/materials-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { MaterialFieldCard } from "./material-field-card";

const CHIPS: { id: MaterialsFieldFilterId; label: string }[] = [
  { id: "shortfall", label: "Faltantes" },
  { id: "week", label: "Esta semana" },
  { id: "next_14_days", label: "Próximos 14 días" },
  { id: "ordered", label: "Pedidos" },
  { id: "pending_receipt", label: "Por recibir" },
  { id: "all", label: "Todos" },
];

const EMPTY: Record<MaterialsFieldFilterId, string> = {
  shortfall: "No hay materiales con faltantes.",
  week: "No hay materiales necesarios esta semana.",
  next_14_days: "No hay materiales en los próximos 14 días.",
  ordered: "No hay materiales pedidos.",
  pending_receipt: "No hay materiales por recibir.",
  all: "Todavía no hay necesidades de materiales para esta obra.",
};

export function MaterialsFieldView({
  projectId,
  rows,
  canRequest,
  fieldParam,
  searchQuery,
  onSearchQueryChange,
  onSelect,
  onFilterChange,
  queryMs,
}: {
  projectId: string;
  rows: MaterialsFieldRow[];
  canRequest: boolean;
  fieldParam: string | null;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  onSelect: (row: MaterialsFieldRow) => void;
  onFilterChange: (filter: MaterialsFieldFilterId) => void;
  queryMs?: number;
}) {
  const filter = parseMaterialsFieldFilter(fieldParam) ?? "shortfall";
  const window = useMemo(() => materialsFieldWindow(), []);
  const kpis = useMemo(() => summarizeMaterialsFieldKpis(rows, window), [rows, window]);
  const matched = useMemo(
    () => filterAndSortMaterialsFieldRows(rows, filter, window, searchQuery),
    [rows, filter, window, searchQuery],
  );
  const { visible, truncated, matchedCount } = limitMaterialsFieldRows(matched);
  const emptyAll = rows.length === 0;

  return (
    <div
      className="space-y-4"
      data-testid="materials-field-view"
      data-query-ms={queryMs}
      data-materials-source="field"
    >
      <p className="text-sm text-muted-foreground">Materiales de obra</p>
      <div className="grid grid-cols-4 gap-2" data-testid="materials-field-kpis">
        <FieldKpi
          label="Faltantes"
          value={kpis.shortfall}
          tone={kpis.shortfall > 0 ? "danger" : undefined}
          active={filter === "shortfall"}
          onClick={() => onFilterChange("shortfall")}
        />
        <FieldKpi
          label="Esta semana"
          value={kpis.week}
          active={filter === "week"}
          onClick={() => onFilterChange("week")}
        />
        <FieldKpi
          label="Pedidos"
          value={kpis.ordered}
          active={filter === "ordered"}
          onClick={() => onFilterChange("ordered")}
        />
        <FieldKpi
          label="Por recibir"
          value={kpis.pendingReceipt}
          active={filter === "pending_receipt"}
          onClick={() => onFilterChange("pending_receipt")}
        />
      </div>

      <div
        className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        data-testid="materials-field-chips"
      >
        {CHIPS.map((chip) => (
          <Button
            key={chip.id}
            type="button"
            size="sm"
            variant={filter === chip.id ? "default" : "outline"}
            className="min-h-11 shrink-0"
            data-testid={`materials-field-chip-${chip.id}`}
            aria-pressed={filter === chip.id}
            onClick={() => onFilterChange(chip.id)}
          >
            {chip.label}
          </Button>
        ))}
      </div>

      <Input
        value={searchQuery}
        onChange={(e) => onSearchQueryChange(e.target.value)}
        placeholder="Buscar material"
        aria-label="Buscar material"
        className="min-h-11"
        data-testid="materials-field-search"
      />

      {visible.length === 0 ? (
        <div
          className="rounded-lg border bg-card px-4 py-6 text-center"
          data-testid="materials-field-empty"
        >
          <p className="text-sm text-muted-foreground">
            {searchQuery.trim()
              ? "No hay materiales que coincidan con la búsqueda."
              : emptyAll
                ? EMPTY.all
                : EMPTY[filter]}
          </p>
          {filter !== "all" && !searchQuery.trim() ? (
            <Button
              type="button"
              variant="outline"
              className="mt-4 min-h-11"
              data-testid="materials-field-ver-todos"
              onClick={() => onFilterChange("all")}
            >
              Ver todos
            </Button>
          ) : null}
        </div>
      ) : (
        <ul className="space-y-3">
          {visible.map((item) => (
            <li key={item.rowKey}>
              <MaterialFieldCard
                projectId={projectId}
                row={item}
                canRequest={canRequest}
                onSelect={onSelect}
              />
            </li>
          ))}
        </ul>
      )}

      {truncated ? (
        <p className="text-xs text-muted-foreground">
          Mostrando {visible.length} de {matchedCount} materiales. Acotá con filtros o búsqueda.
        </p>
      ) : null}
    </div>
  );
}

function FieldKpi({
  label,
  value,
  tone,
  active,
  onClick,
}: {
  label: string;
  value: number;
  tone?: "danger";
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-lg border bg-card px-1 py-2 text-center min-h-11",
        active && "border-primary",
      )}
    >
      <p
        className={cn(
          "text-lg font-semibold tabular-nums",
          tone === "danger" && value > 0 && "text-destructive",
        )}
      >
        {value}
      </p>
      <p className="text-[10px] leading-tight text-muted-foreground">{label}</p>
    </button>
  );
}
