"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FieldPendingGroup, FieldPendingItem, FieldPendingList, FieldPendingCounts } from "@bloqer/services";
import { fieldPendingComprasStageLabel, filterPendingView } from "@bloqer/services/field-pending-labels";
import { FieldPendingCard } from "./field-pending-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { fieldPendingEmptyObraCta } from "@/lib/field-pending-empty-cta";
import { Input } from "@/components/ui/input";
import { ReportExportActions } from "@/features/reports/report-export-actions";

function groupCount(counts: FieldPendingCounts, id: "todos" | FieldPendingGroup): number {
  switch (id) {
    case "todos":
      return counts.total;
    case "compras":
      return (
        counts.purchaseRequests +
        counts.purchaseOrders +
        counts.purchaseOrdersToConfirm +
        counts.purchaseOrdersToReceive +
        counts.purchaseOrdersToInvoice
      );
    case "obra":
      return counts.jobsiteLogs;
    case "certificaciones":
      return counts.certifications + counts.subcontractCertifications;
  }
}

const FILTERS: { id: "todos" | FieldPendingGroup; label: string }[] = [
  { id: "todos", label: "Todos" },
  { id: "compras", label: "Compras" },
  { id: "obra", label: "Obra" },
  { id: "certificaciones", label: "Certificaciones" },
];

const PAGE_SIZE = 25;
const selectClass = "h-11 w-full rounded-md border border-input bg-background px-3 text-sm";

type Props = {
  list: FieldPendingList;
  group: FieldPendingGroup | undefined;
  projectId: string | undefined;
  projects: Array<{ id: string; code: string }>;
  lastProjectId?: string | null;
  /** When true, stay on `/proyectos/[id]/pendientes` (no cross-project chips). */
  lockProject?: boolean;
};

export function FieldPendingInbox({
  list,
  group,
  projectId,
  projects,
  lastProjectId = null,
  lockProject = false,
}: Props) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [overdue, setOverdue] = useState(false);
  const [sort, setSort] = useState("operational");
  const [grouping, setGrouping] = useState(group === "compras" ? "stage" : "none");
  const [compact, setCompact] = useState(true);
  const [page, setPage] = useState(1);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const filtered = useMemo(() => filterPendingView(list.items, {
    search, overdue: overdue ? "1" : undefined, sort,
  }), [list.items, search, overdue, sort]);
  const sections = useMemo(() => {
    const groups = new Map<string, { label: string; items: FieldPendingItem[] }>();
    for (const item of filtered) {
      const key = grouping === "project" ? item.projectId : grouping === "stage" ? item.entityType : "all";
      const label = grouping === "project" ? `${item.projectCode} · ${item.projectName}`
        : grouping === "stage" ? fieldPendingComprasStageLabel(item.entityType) ?? item.typeLabel : "Pendientes";
      if (!groups.has(key)) groups.set(key, { label, items: [] });
      groups.get(key)!.items.push(item);
    }
    return [...groups.entries()].map(([key, value]) => ({ key, ...value }));
  }, [filtered, grouping]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  let sectionOffset = 0;
  const visibleSections = sections.map((section) => {
    const start = Math.max(0, (currentPage - 1) * PAGE_SIZE - sectionOffset);
    const end = Math.max(0, currentPage * PAGE_SIZE - sectionOffset);
    sectionOffset += section.items.length;
    return { ...section, visible: section.items.slice(start, end) };
  }).filter((section) => section.visible.length > 0);
  const overdueCount = list.items.filter((item) => item.overdueDays > 0).length;
  const resetPage = () => { setPage(1); setCollapsed(new Set()); };
  const filterHref = (id: (typeof FILTERS)[number]["id"]) => {
    const params = new URLSearchParams();
    if (id !== "todos") params.set("grupo", id);
    if (!lockProject && projectId) params.set("proyecto", projectId);
    const q = params.toString();
    if (lockProject && projectId) {
      return q ? `/proyectos/${projectId}/pendientes?${q}` : `/proyectos/${projectId}/pendientes`;
    }
    return q ? `/pendientes?${q}` : "/pendientes";
  };

  const obraCta = fieldPendingEmptyObraCta({ projectId, projects, lastProjectId });
  const helpComprasHref = "/ayuda/circuito-comprar-material-hasta-pagarlo";

  return (
    <div className="space-y-3" data-testid="field-pending-inbox" data-query-ms={list.queryMs}>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4">
        <div>
          <p className="text-lg font-semibold tabular-nums">{list.items.length} pendientes</p>
          <p className="text-sm text-muted-foreground">{overdueCount} con indicador de vencimiento · {new Set(list.items.map((item) => item.projectId)).size} obras</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ReportExportActions exportPath="/api/reports/pendientes" pdf xlsx label="Exportar vista"
            params={{ proyecto: projectId, grupo: group, search, overdue: overdue ? "1" : undefined, sort }} />
          <ReportExportActions exportPath="/api/reports/pendientes" pdf xlsx label="Exportar todos"
            params={{ proyecto: projectId }} />
        </div>
        <p className="w-full text-xs text-muted-foreground">Vista: todos los resultados filtrados, incluidas otras páginas y grupos plegados. Todos: sin filtros, dentro de la obra o empresa seleccionada.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((filter) => {
          const active = (group ?? "todos") === filter.id;
          const count = groupCount(list.counts, filter.id);
          return (
            <Button
              key={filter.id}
              variant={active ? "default" : "outline"}
              size="sm"
              className="min-h-11 gap-1.5"
              asChild
            >
              <Link href={filterHref(filter.id)} aria-current={active ? "page" : undefined}>
                {filter.label}
                {count > 0 && (
                  <Badge
                    variant={active ? "outline" : "secondary"}
                    className={cn(
                      "ml-0.5 px-1.5 py-0 text-[10px] leading-4",
                      active && "border-primary-foreground/30 text-primary-foreground",
                    )}
                  >
                    {count}
                  </Badge>
                )}
              </Link>
            </Button>
          );
        })}
      </div>

      <div className="grid gap-3 rounded-lg border bg-card p-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="space-y-1 text-xs font-medium sm:col-span-2">
          <span>Buscar pendientes</span>
          <Input type="search" className="h-11" placeholder="Documento, proveedor, obra o solicitante…" value={search}
            onChange={(event) => { setSearch(event.target.value); resetPage(); }} />
        </label>
        {!lockProject && <label className="space-y-1 text-xs font-medium"><span>Obra</span>
          <select className={selectClass} value={projectId ?? ""} onChange={(event) => {
            const params = new URLSearchParams();
            if (group) params.set("grupo", group);
            if (event.target.value) params.set("proyecto", event.target.value);
            router.push(`/pendientes?${params}`);
          }}>
            <option value="">Todas las obras</option>
            {projects.map((project) => <option key={project.id} value={project.id}>{project.code}</option>)}
          </select>
        </label>}
        <label className="space-y-1 text-xs font-medium"><span>Agrupar por</span>
          <select className={selectClass} value={grouping} onChange={(event) => { setGrouping(event.target.value); resetPage(); }}>
            <option value="none">Sin agrupar</option><option value="stage">Etapa / tipo</option>
            {!lockProject && <option value="project">Obra</option>}
          </select>
        </label>
        <label className="space-y-1 text-xs font-medium"><span>Ordenar por</span>
          <select className={selectClass} value={sort} onChange={(event) => { setSort(event.target.value); resetPage(); }}>
            <option value="operational">Orden operativo</option><option value="oldest">Más antiguos</option><option value="newest">Más recientes</option>
          </select>
        </label>
        <div className="flex flex-wrap items-end gap-2 sm:col-span-2 lg:col-span-3">
          <Button variant={overdue ? "default" : "outline"} className="min-h-11" aria-pressed={overdue}
            onClick={() => { setOverdue(!overdue); resetPage(); }}>Solo vencidos ({overdueCount})</Button>
          <Button variant="outline" className="min-h-11" aria-pressed={compact} onClick={() => setCompact(!compact)}>
            {compact ? "Vista compacta" : "Vista detallada"}
          </Button>
          {(search || overdue) && <Button variant="ghost" className="min-h-11" onClick={() => { setSearch(""); setOverdue(false); resetPage(); }}>Limpiar búsqueda y vencidos</Button>}
        </div>
      </div>
      <p role="status" className="text-sm text-muted-foreground">{filtered.length} resultados de {list.items.length} · {filtered.length ? (currentPage - 1) * PAGE_SIZE + 1 : 0}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} en esta página</p>

      {list.items.length === 0 ? (
        <div className="rounded-lg border bg-card p-6 text-center">
          <p className="font-medium">No tenés acciones pendientes.</p>
          <div className="mt-4 flex flex-col gap-2">
            {group === "compras" ? (
              <Button asChild className="min-h-11">
                <Link href={helpComprasHref}>Ver caminito de compra</Link>
              </Button>
            ) : (
              <Button asChild className="min-h-11">
                <Link href={obraCta.href}>{obraCta.label}</Link>
              </Button>
            )}
            <Button asChild variant="outline" className="min-h-11">
              <Link href="/notificaciones">Ver notificaciones</Link>
            </Button>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border p-6 text-center"><p className="font-medium">No hay coincidencias con estos filtros.</p><p className="text-sm text-muted-foreground">Probá otro texto o desactivá Solo vencidos.</p></div>
      ) : (
        <div className="space-y-3">
          {visibleSections.map((section) => <section key={section.key} className="space-y-2">
            {grouping !== "none" && <h2><button type="button" className="flex min-h-11 w-full items-center justify-between rounded-md bg-muted px-3 text-left text-sm font-semibold"
              aria-expanded={!collapsed.has(section.key)} aria-controls={`pending-section-${section.key}`}
              onClick={() => setCollapsed((previous) => { const next = new Set(previous); if (next.has(section.key)) next.delete(section.key); else next.add(section.key); return next; })}>
              <span>{section.label} <Badge variant="secondary">{section.items.length}</Badge></span><span>{collapsed.has(section.key) ? "Expandir" : "Plegar"}</span>
            </button></h2>}
            <div id={`pending-section-${section.key}`} hidden={collapsed.has(section.key)} className="space-y-2">
              {section.visible.map((item) => <FieldPendingCard key={`${item.entityType}-${item.entityId}`} item={item} compact={compact} />)}
            </div>
          </section>)}
        </div>
      )}
      {pages > 1 && <nav aria-label="Páginas de pendientes" className="flex items-center justify-between gap-2">
        <Button variant="outline" className="min-h-11" disabled={currentPage === 1} onClick={() => { setPage(currentPage - 1); setCollapsed(new Set()); }}>Anterior</Button>
        <span className="text-sm">Página {currentPage} de {pages}</span>
        <Button variant="outline" className="min-h-11" disabled={currentPage === pages} onClick={() => { setPage(currentPage + 1); setCollapsed(new Set()); }}>Siguiente</Button>
      </nav>}
    </div>
  );
}
