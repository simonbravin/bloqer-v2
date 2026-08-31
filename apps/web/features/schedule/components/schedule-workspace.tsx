"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ScheduleFieldItemDto, ScheduleWorkspaceDto, ScheduleWorkspaceItemDto } from "@bloqer/services";
import {
  parseScheduleFieldFilter,
  type ScheduleFieldFilterId,
} from "@bloqer/services/schedule-field";
import { Button } from "@/components/ui/button";
import { ScheduleSummaryCards } from "./schedule-summary-cards";
import { ScheduleTableView } from "./schedule-table-view";
import { ScheduleGanttView } from "./schedule-gantt-view";
import { ScheduleKanbanView } from "./schedule-kanban-view";
import { ScheduleCalendarView } from "./schedule-calendar-view";
import { ScheduleImportDialog } from "./schedule-import-dialog";
import {
  ScheduleItemDialog,
  type ScheduleItemDialogTab,
} from "./schedule-item-dialog";
import { ScheduleFilters } from "./schedule-filters";
import { ScheduleCreateDialog } from "./schedule-create-dialog";
import { ScheduleFieldItemSheet } from "./schedule-field-item-sheet";
import { ScheduleFieldView, ScheduleFieldViewSkeleton } from "./schedule-field-view";
import { filterScheduleItemsForDisplay } from "../adapters/schedule-view-types";
import { useHasMounted, useIsLgUp } from "@/lib/media-query";
import { ScheduleExportDialog } from "./schedule-export-dialog";

type ViewId = "gantt" | "calendar" | "kanban" | "table";

const VIEWS: { id: ViewId; label: string }[] = [
  { id: "gantt", label: "Gantt" },
  { id: "calendar", label: "Calendario" },
  { id: "kanban", label: "Kanban" },
  { id: "table", label: "Tabla" },
];

const DIALOG_TABS: ScheduleItemDialogTab[] = ["detail", "deps", "history", "links"];

function parseView(raw: string | null): ViewId {
  if (raw && VIEWS.some((v) => v.id === raw)) return raw as ViewId;
  return "gantt";
}

function parseDialogTab(raw: string | null): ScheduleItemDialogTab {
  if (raw && DIALOG_TABS.includes(raw as ScheduleItemDialogTab)) {
    return raw as ScheduleItemDialogTab;
  }
  return "detail";
}

function toFieldItem(
  item: ScheduleWorkspaceItemDto,
  all: ScheduleWorkspaceItemDto[],
): ScheduleFieldItemDto {
  return {
    id: item.id,
    parentId: item.parentId,
    name: item.name,
    type: item.type,
    status: item.status,
    blockReason: item.blockReason,
    startDate: item.startDate,
    endDate: item.endDate,
    progressPct: item.progressPct,
    timePlanPct: item.timePlanPct,
    daysLate: item.daysLate,
    wbsLinks: item.wbsLinks,
    predecessorIds: item.predecessorIds,
    predecessorNames: item.predecessorIds
      .map((id) => all.find((row) => row.id === id)?.name)
      .filter((name): name is string => Boolean(name)),
  };
}

export function ScheduleWorkspace({
  projectId,
  workspace,
  queryMs,
}: {
  projectId: string;
  workspace: ScheduleWorkspaceDto;
  queryMs?: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const hasMounted = useHasMounted();
  const isLgUp = useIsLgUp();
  const showField = hasMounted && !isLgUp;
  const showDesktop = hasMounted && isLgUp;
  const view = useMemo(() => parseView(searchParams.get("view")), [searchParams]);
  const statusFilter = searchParams.get("status");
  const fieldParam = searchParams.get("field");
  const dialogTab = useMemo(
    () => parseDialogTab(searchParams.get("dialogTab")),
    [searchParams],
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [fieldFilter, setFieldFilterState] = useState<ScheduleFieldFilterId>(
    () => parseScheduleFieldFilter(searchParams.get("field")) ?? "today",
  );

  const items = useMemo(
    () => filterScheduleItemsForDisplay(workspace.items, statusFilter),
    [workspace.items, statusFilter],
  );

  const filtersExcludeAll =
    workspace.summary.unfilteredActiveCount > 0 && items.length === 0;

  const hasActiveFilters =
    searchParams.get("status") != null ||
    searchParams.get("delayedOnly") === "1" ||
    searchParams.get("type") != null;

  function replaceParams(mutate: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(searchParams.toString());
    mutate(params);
    const q = params.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  }

  /** Field chips / itemId must not refetch `getProjectScheduleWorkspace`. */
  function replaceParamsShallow(mutate: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(window.location.search);
    mutate(params);
    const q = params.toString();
    const url = q ? `${pathname}?${q}` : pathname;
    window.history.replaceState(window.history.state, "", url);
  }

  function clearFilters() {
    replaceParams((params) => {
      params.delete("status");
      params.delete("delayedOnly");
      params.delete("type");
    });
  }

  function setView(next: ViewId) {
    replaceParams((params) => {
      params.set("view", next);
      params.delete("field");
    });
  }

  function setFieldFilter(next: ScheduleFieldFilterId) {
    setFieldFilterState(next);
    replaceParamsShallow((params) => {
      params.set("field", next);
      params.delete("view");
      params.delete("status");
      params.delete("delayedOnly");
      params.delete("type");
    });
  }

  function selectItem(item: ScheduleWorkspaceItemDto, tab: ScheduleItemDialogTab = "detail") {
    setSelectedId(item.id);
    setDialogOpen(true);
    replaceParamsShallow((params) => {
      params.set("itemId", item.id);
      if (tab === "detail") params.delete("dialogTab");
      else params.set("dialogTab", tab);
    });
  }

  function closeDialog(open: boolean) {
    setDialogOpen(open);
    if (!open) {
      setSelectedId(null);
      replaceParamsShallow((params) => {
        params.delete("itemId");
        params.delete("dialogTab");
      });
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
    replaceParamsShallow((params) => {
      params.delete("itemId");
      params.delete("dialogTab");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemIdParam, workspace.items]);

  useEffect(() => {
    if (!hasMounted || isLgUp) return;
    const fieldOk = parseScheduleFieldFilter(fieldParam);
    const hasDesktopFilters =
      searchParams.get("status") != null ||
      searchParams.get("delayedOnly") === "1" ||
      searchParams.get("type") != null;
    // Entering field: clear desktop filters and refetch (shallow history would keep filtered payload).
    if (fieldOk && !hasDesktopFilters) {
      setFieldFilterState(fieldOk);
      return;
    }
    const nextField = fieldOk ?? "today";
    setFieldFilterState(nextField);
    replaceParams((params) => {
      params.set("field", nextField);
      params.delete("view");
      params.delete("status");
      params.delete("delayedOnly");
      params.delete("type");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMounted, isLgUp, fieldParam]);

  const fieldWorkspace = useMemo(() => {
    const leaves = workspace.items.filter((item) => item.isLeaf);
    return {
      projectId: workspace.projectId,
      items: leaves.map((item) => toFieldItem(item, workspace.items)),
    };
  }, [workspace.items, workspace.projectId]);
  const selectedFieldItem = selectedId
    ? fieldWorkspace.items.find((i) => i.id === selectedId) ?? null
    : null;

  return (
    <div className="space-y-6" data-schedule-source="desktop">
      {!hasMounted ? (
        <>
          <div className="lg:hidden">
            <ScheduleFieldViewSkeleton />
          </div>
          <div className="hidden min-h-48 rounded-lg border bg-card lg:block" aria-hidden />
        </>
      ) : null}

      {showField ? (
        <ScheduleFieldView
          workspace={fieldWorkspace}
          fieldParam={fieldFilter}
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          onSelect={(item) => {
            const desktop = workspace.items.find((row) => row.id === item.id);
            if (desktop) selectItem(desktop);
          }}
          onFilterChange={setFieldFilter}
          queryMs={queryMs}
        />
      ) : null}

      {showDesktop ? (
        <>
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

          {workspace.baselineBudgetMismatch && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100">
              El presupuesto de control de costos no coincide con la base del cronograma.
              Los vínculos EDT siguen en la base original; reimportá o reasigná tareas si
              cambió el presupuesto vigente.
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
                <ScheduleCreateDialog
                  projectId={projectId}
                  treeItems={workspace.treeItems}
                />
              </>
            )}
            <ScheduleExportDialog
              projectId={projectId}
              defaultView={view}
              filters={{
                budgetId: workspace.budgetId,
                status: searchParams.get("status") ?? undefined,
                delayedOnly: searchParams.get("delayedOnly") === "1" ? "1" : undefined,
                type: searchParams.get("type") ?? undefined,
              }}
            />
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

          {view === "table" && (
            <ScheduleTableView
              items={items}
              onSelect={(item) => selectItem(item)}
              budgetCurrency={workspace.budgetCurrency}
              filtersExcludeAll={filtersExcludeAll}
              unfilteredActiveCount={workspace.summary.unfilteredActiveCount}
              projectId={projectId}
              canEdit={workspace.canEdit}
              treeItems={workspace.treeItems}
            />
          )}
          {view === "gantt" && (
            <ScheduleGanttView
              projectId={projectId}
              workspace={workspace}
              items={items}
              onSelect={(item) => selectItem(item)}
              onSelectWithTab={(item, tab) => selectItem(item, tab)}
              filtersExcludeAll={filtersExcludeAll}
              unfilteredActiveCount={workspace.summary.unfilteredActiveCount}
            />
          )}
          {view === "kanban" && (
            <ScheduleKanbanView
              projectId={projectId}
              workspace={workspace}
              items={items}
              onSelect={(item) => selectItem(item)}
              filtersExcludeAll={filtersExcludeAll}
              unfilteredActiveCount={workspace.summary.unfilteredActiveCount}
            />
          )}
          {view === "calendar" && (
            <ScheduleCalendarView
              items={items}
              onSelect={(item) => selectItem(item)}
              filtersExcludeAll={filtersExcludeAll}
              unfilteredActiveCount={workspace.summary.unfilteredActiveCount}
            />
          )}
        </>
      ) : null}

      {showField ? (
        <ScheduleFieldItemSheet
          projectId={projectId}
          canEdit={workspace.canEdit}
          item={selectedFieldItem}
          open={dialogOpen}
          onOpenChange={closeDialog}
        />
      ) : (
        <ScheduleItemDialog
          projectId={projectId}
          workspace={workspace}
          itemId={selectedId}
          allItems={workspace.items}
          open={showDesktop && dialogOpen}
          onOpenChange={closeDialog}
          initialTab={dialogTab}
        />
      )}
    </div>
  );
}
