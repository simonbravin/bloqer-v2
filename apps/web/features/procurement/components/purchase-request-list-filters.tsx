"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ListEmptyState } from "@/components/ui/list-empty-state";
import { cn } from "@/lib/utils";
import type { PurchaseRequestView } from "@bloqer/services";
import { matchesListStatusFilter } from "../lib/matches-list-status-filter";
import { PurchaseRequestMobileCards } from "./purchase-request-mobile-cards";
import { PurchaseRequestTable } from "./purchase-request-table";

const STATUS_FILTERS = [
  { value: "DRAFT", label: "Borrador" },
  { value: "SUBMITTED", label: "Enviada" },
  { value: "QUOTE_SELECTED", label: "Adjudicada" },
  { value: "COMPLETED", label: "Completada" },
  { value: "CANCELLED", label: "Anulada" },
] as const;

type PrStatusFilter = (typeof STATUS_FILTERS)[number]["value"];

function normalize(v: string): string {
  return v
    .toLocaleLowerCase("es-AR")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function requestSearchHaystack(pr: PurchaseRequestView): string {
  const bits: string[] = [pr.code];
  if (pr.selectedSupplierName) bits.push(pr.selectedSupplierName);
  if (pr.requestedByName) bits.push(pr.requestedByName);
  if (pr.primaryWbsNodeCode) bits.push(pr.primaryWbsNodeCode);
  if (pr.primaryWbsNodeName) bits.push(pr.primaryWbsNodeName);
  for (const line of pr.lines) {
    if (line.description) bits.push(line.description);
    if (line.wbsNodeCode) bits.push(line.wbsNodeCode);
    if (line.wbsNodeName) bits.push(line.wbsNodeName);
  }
  return normalize(bits.join(" "));
}

interface Props {
  requests: PurchaseRequestView[];
  projectId: string;
  initialStatus?: PrStatusFilter;
  canCreate: boolean;
}

export function PurchaseRequestListFilters({
  requests,
  projectId,
  initialStatus,
  canCreate,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<PrStatusFilter | null>(initialStatus ?? null);

  // Sync with URL-driven soft navigations (e.g. deep link ?status=SUBMITTED from emails / Pendientes).
  useEffect(() => {
    setStatus(initialStatus ?? null);
  }, [initialStatus]);

  function setStatusFilter(next: PrStatusFilter | null) {
    setStatus(next);
    const params = new URLSearchParams(searchParams.toString());
    if (next) params.set("status", next);
    else params.delete("status");
    params.delete("create");
    const q = params.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  }

  const countsByStatus = useMemo(() => {
    const map = new Map<string, number>();
    for (const pr of requests) map.set(pr.status, (map.get(pr.status) ?? 0) + 1);
    return map;
  }, [requests]);

  const cancelledCount = countsByStatus.get("CANCELLED") ?? 0;
  const activeCount = requests.length - cancelledCount;

  const trimmedSearch = search.trim();

  const filtered = useMemo(() => {
    const q = normalize(trimmedSearch);
    return requests.filter((pr) => {
      if (!matchesListStatusFilter(pr.status, status)) return false;
      if (!q) return true;
      return requestSearchHaystack(pr).includes(q);
    });
  }, [requests, trimmedSearch, status]);

  const hasActiveFilters = trimmedSearch.length > 0 || status !== null;
  const filteredToZero = filtered.length === 0 && requests.length > 0;
  const onlyCancelledRemain =
    status === null &&
    !trimmedSearch &&
    filteredToZero &&
    cancelledCount > 0 &&
    activeCount === 0;

  const listHref = `/proyectos/${projectId}/solicitudes-compra`;

  const clearFilters = () => {
    setSearch("");
    setStatusFilter(null);
  };

  const noBaseRequests = requests.length === 0;
  const emptyStateForTable = (
    <ListEmptyState
      className="rounded-none border-0"
      title="Sin solicitudes de compra"
      description="Revisá la cobertura en Materiales o creá una solicitud para generar una OC."
      action={
        <div className="flex flex-wrap justify-center gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href={`/proyectos/${projectId}/materiales`}>Ver materiales</Link>
          </Button>
          {canCreate ? (
            <Button asChild size="sm">
              <Link href={`${listHref}?create=1`}>Nueva solicitud</Link>
            </Button>
          ) : null}
        </div>
      }
    />
  );

  // Hide the search/status toolbar when there is no data at all: filters over an empty list add no value.
  if (noBaseRequests) {
    return (
      <>
        <div className="md:hidden">
          <PurchaseRequestMobileCards
            requests={requests}
            projectId={projectId}
            emptyAction={
              canCreate ? (
                <Button asChild size="sm">
                  <Link href={`/proyectos/${projectId}/solicitudes-compra/nueva`}>Nueva solicitud</Link>
                </Button>
              ) : undefined
            }
          />
        </div>
        <div className="hidden md:block">
          <PurchaseRequestTable
            requests={requests}
            projectId={projectId}
            emptyState={emptyStateForTable}
          />
        </div>
      </>
    );
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
            aria-label="Buscar solicitudes de compra"
            placeholder="Buscar por código, descripción, WBS, proveedor o solicitante…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 pr-9"
            data-testid="purchase-request-search"
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
          aria-label="Filtrar solicitudes por estado"
        >
          <Button
            type="button"
            size="sm"
            variant={status === null ? "secondary" : "outline"}
            onClick={() => setStatusFilter(null)}
            className="h-8"
            aria-pressed={status === null}
          >
            Activas
            <span className="ml-1.5 text-muted-foreground">{activeCount}</span>
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
                onClick={() => setStatusFilter(active ? null : f.value)}
                className={cn("h-8", count === 0 && !active && "opacity-60")}
                aria-pressed={active}
              >
                {f.label}
                <span className="ml-1.5 text-muted-foreground">{count}</span>
              </Button>
            );
          })}
        </div>

        {hasActiveFilters || filtered.length !== activeCount ? (
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {`${filtered.length} ${filtered.length === 1 ? "solicitud" : "solicitudes"} mostradas`}
          </p>
        ) : null}
      </div>

      {filteredToZero ? (
        <ListEmptyState
          title={onlyCancelledRemain ? "No hay solicitudes activas" : "Sin resultados"}
          description={
            onlyCancelledRemain
              ? "Usá Anulada para ver las solicitudes anuladas."
              : "Probá con otro término o quitá los filtros."
          }
          action={
            onlyCancelledRemain ? (
              <Button type="button" size="sm" variant="outline" onClick={() => setStatusFilter("CANCELLED")}>
                Ver anuladas
              </Button>
            ) : (
              <Button type="button" size="sm" variant="outline" onClick={clearFilters}>
                Quitar filtros
              </Button>
            )
          }
        />
      ) : (
        <>
          <div className="md:hidden">
            <PurchaseRequestMobileCards requests={filtered} projectId={projectId} />
          </div>

          <div className="hidden md:block">
            <PurchaseRequestTable
              requests={filtered}
              projectId={projectId}
              emptyState={emptyStateForTable}
            />
          </div>
        </>
      )}
    </div>
  );
}
