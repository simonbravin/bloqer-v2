"use client";

import { useMemo } from "react";
import type { PayablesFieldRow } from "@bloqer/services/payables-field";
import {
  filterAndSortPayablesFieldRows,
  limitPayablesFieldRows,
  parsePayablesFieldFilter,
  payablesFieldTodayIso,
  summarizePayablesFieldKpis,
  type PayablesFieldFilterId,
} from "@bloqer/services/payables-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { PayableFieldCard } from "./payable-field-card";

const CHIPS: { id: PayablesFieldFilterId; label: string }[] = [
  { id: "pending", label: "Pendientes" },
  { id: "overdue", label: "Vencidas" },
  { id: "upcoming", label: "Próximas" },
  { id: "paid", label: "Pagadas" },
];

const EMPTY: Record<PayablesFieldFilterId, string> = {
  pending: "No hay cuentas con saldo pendiente.",
  overdue: "No hay cuentas vencidas.",
  upcoming: "No hay cuentas próximas a vencer.",
  paid: "No hay cuentas pagadas.",
};

export function PayablesFieldView({
  rows,
  hrefPrefix,
  fieldParam,
  searchQuery,
  onSearchQueryChange,
  onFilterChange,
  queryMs,
}: {
  rows: PayablesFieldRow[];
  hrefPrefix: string;
  fieldParam: string | null;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  onFilterChange: (filter: PayablesFieldFilterId) => void;
  queryMs?: number;
}) {
  const filter = parsePayablesFieldFilter(fieldParam) ?? "pending";
  const todayIso = useMemo(() => payablesFieldTodayIso(), []);
  const kpis = useMemo(() => summarizePayablesFieldKpis(rows, todayIso), [rows, todayIso]);
  const matched = useMemo(
    () => filterAndSortPayablesFieldRows(rows, filter, todayIso, searchQuery),
    [rows, filter, todayIso, searchQuery],
  );
  const { visible, truncated, matchedCount } = limitPayablesFieldRows(matched);
  const emptyAll = rows.length === 0;

  return (
    <div
      className="space-y-4"
      data-testid="payables-field-view"
      data-query-ms={queryMs}
      data-payables-source="field"
    >
      <p className="text-sm text-muted-foreground">Qué hay que pagar</p>
      <div className="grid grid-cols-4 gap-2" data-testid="payables-field-kpis">
        <FieldKpi
          label="Pendientes"
          value={kpis.pending}
          active={filter === "pending"}
          onClick={() => onFilterChange("pending")}
        />
        <FieldKpi
          label="Vencidas"
          value={kpis.overdue}
          tone={kpis.overdue > 0 ? "danger" : undefined}
          active={filter === "overdue"}
          onClick={() => onFilterChange("overdue")}
        />
        <FieldKpi
          label="Próximas"
          value={kpis.upcoming}
          active={filter === "upcoming"}
          onClick={() => onFilterChange("upcoming")}
        />
        <FieldKpi
          label="Pagadas"
          value={kpis.paid}
          active={filter === "paid"}
          onClick={() => onFilterChange("paid")}
        />
      </div>

      <div
        className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        data-testid="payables-field-chips"
      >
        {CHIPS.map((chip) => (
          <Button
            key={chip.id}
            type="button"
            size="sm"
            variant={filter === chip.id ? "default" : "outline"}
            className="min-h-11 shrink-0"
            data-testid={`payables-field-chip-${chip.id}`}
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
        placeholder="Buscar proveedor o factura"
        aria-label="Buscar proveedor o factura"
        className="min-h-11"
        data-testid="payables-field-search"
      />

      {visible.length === 0 ? (
        <div
          className="rounded-lg border bg-card px-4 py-6 text-center"
          data-testid="payables-field-empty"
        >
          <p className="text-sm text-muted-foreground">
            {searchQuery.trim()
              ? "No hay cuentas que coincidan con la búsqueda."
              : emptyAll
                ? "Todavía no hay cuentas por pagar."
                : EMPTY[filter]}
          </p>
          {filter !== "pending" && !searchQuery.trim() ? (
            <Button
              type="button"
              variant="outline"
              className="mt-4 min-h-11"
              data-testid="payables-field-ver-pendientes"
              onClick={() => onFilterChange("pending")}
            >
              Ver pendientes
            </Button>
          ) : null}
        </div>
      ) : (
        <ul className="space-y-3">
          {visible.map((item) => (
            <li key={item.id}>
              <PayableFieldCard row={item} hrefPrefix={hrefPrefix} />
            </li>
          ))}
        </ul>
      )}

      {truncated ? (
        <p className="text-xs text-muted-foreground">
          Mostrando {visible.length} de {matchedCount} cuentas. Acotá con filtros o búsqueda.
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
