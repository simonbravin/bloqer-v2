"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ListEmptyState } from "@/components/ui/list-empty-state";
import { cn } from "@/lib/utils";
import { PurchaseOrderListSection } from "./purchase-order-list-section";
import type { PurchaseOrderListItem } from "./purchase-order-list";

const STATUS_FILTERS = [
  { value: "DRAFT", label: "Borrador" },
  { value: "SUBMITTED", label: "Pend. aprobación" },
  { value: "APPROVED", label: "Aprobada" },
  { value: "CONFIRMED", label: "Confirmada" },
  { value: "PARTIALLY_RECEIVED", label: "Recep. parcial" },
  { value: "RECEIVED", label: "Recibida" },
  { value: "CANCELLED", label: "Anulada" },
] as const;

type PoStatusFilter = (typeof STATUS_FILTERS)[number]["value"];

function normalize(v: string): string {
  return v
    .toLocaleLowerCase("es-AR")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

interface Props {
  orders: PurchaseOrderListItem[];
  projectId: string;
  initialStatus?: PoStatusFilter;
}

export function PurchaseOrderListFilters({ orders, projectId, initialStatus }: Props) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<PoStatusFilter | null>(initialStatus ?? null);

  // Sync with URL-driven soft navigations (e.g. deep link ?status=SUBMITTED from Pendientes).
  useEffect(() => {
    setStatus(initialStatus ?? null);
  }, [initialStatus]);

  const countsByStatus = useMemo(() => {
    const map = new Map<string, number>();
    for (const o of orders) map.set(o.status, (map.get(o.status) ?? 0) + 1);
    return map;
  }, [orders]);

  const trimmedSearch = search.trim();

  const filtered = useMemo(() => {
    const q = normalize(trimmedSearch);
    return orders.filter((o) => {
      if (status && o.status !== status) return false;
      if (!q) return true;
      const haystack = normalize(
        `${o.code} ${o.supplierName} ${o.approvedByName ?? ""}`,
      );
      return haystack.includes(q);
    });
  }, [orders, trimmedSearch, status]);

  const hasActiveFilters = trimmedSearch.length > 0 || status !== null;
  const filteredToZero = hasActiveFilters && filtered.length === 0 && orders.length > 0;

  const clearFilters = () => {
    setSearch("");
    setStatus(null);
  };

  if (orders.length === 0) {
    return <PurchaseOrderListSection orders={orders} projectId={projectId} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-lg border bg-card p-3">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            aria-label="Buscar órdenes de compra"
            placeholder="Buscar por código, proveedor o aprobador…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 pr-9"
            data-testid="purchase-order-search"
          />
          {search ? (
            <button
              type="button"
              aria-label="Limpiar búsqueda"
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <X className="size-4" aria-hidden />
            </button>
          ) : null}
        </div>

        <div
          className="flex flex-wrap gap-1.5"
          role="group"
          aria-label="Filtrar órdenes por estado"
        >
          <Button
            type="button"
            size="sm"
            variant={status === null ? "secondary" : "outline"}
            onClick={() => setStatus(null)}
            className="h-8"
            aria-pressed={status === null}
          >
            Todas
            <span className="ml-1.5 text-muted-foreground">{orders.length}</span>
          </Button>
          {STATUS_FILTERS.map((f) => {
            const count = countsByStatus.get(f.value) ?? 0;
            const active = status === f.value;
            return (
              <Button
                key={f.value}
                type="button"
                size="sm"
                variant={active ? "secondary" : "outline"}
                onClick={() => setStatus(active ? null : f.value)}
                className={cn(
                  "h-8",
                  count === 0 && !active && "opacity-60",
                )}
                aria-pressed={active}
              >
                {f.label}
                <span className="ml-1.5 text-muted-foreground">{count}</span>
              </Button>
            );
          })}
        </div>

        {hasActiveFilters ? (
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {filtered.length === orders.length
              ? `${filtered.length} ${filtered.length === 1 ? "orden" : "órdenes"}`
              : `${filtered.length} de ${orders.length} mostradas`}
          </p>
        ) : null}
      </div>

      {filteredToZero ? (
        <ListEmptyState
          title="Sin resultados"
          description="Probá con otro término o quitá los filtros."
          action={
            <Button type="button" size="sm" variant="outline" onClick={clearFilters}>
              Quitar filtros
            </Button>
          }
        />
      ) : (
        <PurchaseOrderListSection orders={filtered} projectId={projectId} />
      )}
    </div>
  );
}
