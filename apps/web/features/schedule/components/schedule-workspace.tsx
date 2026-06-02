"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ScheduleWorkspaceDto } from "@bloqer/services";
import { Button } from "@/components/ui/button";
import { ScheduleSummaryCards } from "./schedule-summary-cards";
import { ScheduleTableView } from "./schedule-table-view";
import { ScheduleGanttView } from "./schedule-gantt-view";
import { ScheduleKanbanView } from "./schedule-kanban-view";
import { ScheduleCalendarView } from "./schedule-calendar-view";
import { ScheduleImportDialog } from "./schedule-import-dialog";
import { ScheduleItemDialog } from "./schedule-item-dialog";
import { ScheduleFilters } from "./schedule-filters";
import { ScheduleCreateDialog } from "./schedule-create-dialog";
import { ScheduleProgressLegend } from "./schedule-progress-dimensions";
import type { ScheduleWorkspaceItemDto } from "@bloqer/services";

type ViewId = "gantt" | "calendar" | "kanban" | "table";

const VIEWS: { id: ViewId; label: string }[] = [
  { id: "gantt", label: "Gantt" },
  { id: "calendar", label: "Calendario" },
  { id: "kanban", label: "Kanban" },
  { id: "table", label: "Tabla" },
];

function parseView(raw: string | null): ViewId {
  if (raw && VIEWS.some((v) => v.id === raw)) return raw as ViewId;
  return "table";
}

export function ScheduleWorkspace({
  projectId,
  workspace,
}: {
  projectId: string;
  workspace: ScheduleWorkspaceDto;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const view = useMemo(() => parseView(searchParams.get("view")), [searchParams]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const items = workspace.items;
  const filtersExcludeAll =
    workspace.summary.unfilteredActiveCount > 0 && items.length === 0;

  const hasActiveFilters =
    searchParams.get("status") != null || searchParams.get("delayedOnly") === "1";

  function clearFilters() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("status");
    params.delete("delayedOnly");
    const q = params.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  }

  function setView(next: ViewId) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", next);
    const q = params.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  }

  function selectItem(item: ScheduleWorkspaceItemDto) {
    setSelectedId(item.id);
    setDialogOpen(true);
    const params = new URLSearchParams(searchParams.toString());
    params.set("itemId", item.id);
    const q = params.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  }

  function closeDialog(open: boolean) {
    setDialogOpen(open);
    if (!open) {
      setSelectedId(null);
      const params = new URLSearchParams(searchParams.toString());
      params.delete("itemId");
      const q = params.toString();
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    }
  }

  const itemIdParam = searchParams.get("itemId");
  useEffect(() => {
    if (!itemIdParam) {
      return;
    }
    const exists = workspace.items.some((i) => i.id === itemIdParam);
    if (exists) {
      setSelectedId(itemIdParam);
      setDialogOpen(true);
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    params.delete("itemId");
    const q = params.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  }, [itemIdParam, workspace.items, pathname, router, searchParams]);

  return (
    <div className="space-y-6">
      <ScheduleSummaryCards workspace={workspace} />

      <ScheduleFilters
        budgets={workspace.availableBudgets}
        currentBudgetId={workspace.budgetId}
        delayedOnly={searchParams.get("delayedOnly") === "1"}
      />

      {filtersExcludeAll && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
          <span>Ninguna tarea coincide con los filtros activos.</span>
          {hasActiveFilters && (
            <Button type="button" size="sm" variant="outline" onClick={clearFilters}>
              Limpiar filtros
            </Button>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-muted-foreground">
          Base: {workspace.budgetName}
        </span>
        {workspace.canEdit && (
          <>
            <ScheduleImportDialog
              projectId={projectId}
              budgets={workspace.availableBudgets}
              defaultBudgetId={workspace.budgetId}
            />
            <ScheduleCreateDialog projectId={projectId} />
          </>
        )}
        <div className="ml-auto flex flex-wrap gap-1 rounded-lg border p-1">
          {VIEWS.map((v) => (
            <Button
              key={v.id}
              size="sm"
              variant={view === v.id ? "secondary" : "ghost"}
              onClick={() => setView(v.id)}
            >
              {v.label}
            </Button>
          ))}
        </div>
      </div>

      <details className="rounded-lg border bg-card px-4 py-2 text-sm">
        <summary className="cursor-pointer font-medium text-muted-foreground py-1">
          Leyenda de avances
        </summary>
        <div className="pt-2 pb-1">
          <ScheduleProgressLegend />
        </div>
      </details>

      {view === "table" && (
        <ScheduleTableView
          items={items}
          onSelect={selectItem}
          filtersExcludeAll={filtersExcludeAll}
          unfilteredActiveCount={workspace.summary.unfilteredActiveCount}
        />
      )}
      {view === "gantt" && (
        <ScheduleGanttView
          projectId={projectId}
          workspace={workspace}
          items={items}
          onSelect={selectItem}
          filtersExcludeAll={filtersExcludeAll}
          unfilteredActiveCount={workspace.summary.unfilteredActiveCount}
        />
      )}
      {view === "kanban" && (
        <ScheduleKanbanView
          projectId={projectId}
          workspace={workspace}
          items={items}
          onSelect={selectItem}
          filtersExcludeAll={filtersExcludeAll}
          unfilteredActiveCount={workspace.summary.unfilteredActiveCount}
        />
      )}
      {view === "calendar" && (
        <ScheduleCalendarView
          items={items}
          onSelect={selectItem}
          filtersExcludeAll={filtersExcludeAll}
          unfilteredActiveCount={workspace.summary.unfilteredActiveCount}
        />
      )}

      <ScheduleItemDialog
        projectId={projectId}
        workspace={workspace}
        itemId={selectedId}
        allItems={workspace.items}
        open={dialogOpen}
        onOpenChange={closeDialog}
      />
    </div>
  );
}
