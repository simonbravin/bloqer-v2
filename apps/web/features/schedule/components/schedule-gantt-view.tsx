"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ScheduleWorkspaceDto, ScheduleWorkspaceItemDto } from "@bloqer/services";
import type { Range } from "@/components/kibo-ui/gantt";
import {
  GanttFeatureItem,
  GanttFeatureList,
  GanttFeatureListGroup,
  GanttGoToTodayButton,
  GanttHeader,
  GanttProvider,
  GanttSidebar,
  GanttSidebarItem,
  GanttTimeline,
  GanttToday,
} from "@/components/kibo-ui/gantt";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toLocalDateOnlyString } from "@/lib/date-input";
import type { ScheduleGanttEntry } from "../adapters/schedule-view-types";
import {
  CONTAINER_COLOR,
  countScheduleItemsWithoutDates,
  mapScheduleItemsToGanttEntries,
  scheduleItemBarColor,
} from "../adapters/schedule-view-types";
import { formatProgressPctDisplay } from "../adapters/schedule-field-labels";
import { scheduleProgressValues } from "./schedule-progress-dimensions";
import {
  rollupScheduleContainersAction,
  updateScheduleItemDatesAction,
} from "../actions/schedule-actions";
import { ScheduleGanttDependencyLayer } from "./schedule-gantt-dependency-layer";
import { ScheduleGanttToolbar } from "./schedule-gantt-toolbar";
import { ScheduleViewEmptyMessage } from "./schedule-empty-state";
import { ScheduleMissingEdtBadge } from "./schedule-missing-edt-badge";
import { ScheduleReorderControls } from "./schedule-reorder-controls";
import type { ScheduleItemDialogTab } from "./schedule-item-dialog";

function collapsedStorageKey(projectId: string) {
  return `bloqer.schedule.collapsed.${projectId}`;
}

function readCollapsedIds(projectId: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(collapsedStorageKey(projectId));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === "string"));
  } catch {
    return new Set();
  }
}

function writeCollapsedIds(projectId: string, ids: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      collapsedStorageKey(projectId),
      JSON.stringify([...ids]),
    );
  } catch {
    // ignore quota / private mode
  }
}

/** True if any ancestor present in the current item list is collapsed. */
function isHiddenByCollapsedAncestor(
  itemId: string,
  items: ScheduleWorkspaceItemDto[],
  collapsed: Set<string>,
): boolean {
  const byId = new Map(items.map((i) => [i.id, i]));
  let current = byId.get(itemId);
  while (current?.parentId) {
    // Parent outside the filtered view → stop (don't hide from stale localStorage ids).
    if (!byId.has(current.parentId)) break;
    if (collapsed.has(current.parentId)) return true;
    current = byId.get(current.parentId);
  }
  return false;
}

function ScheduleGanttSidebarRow({
  item,
  items,
  treeItems,
  entriesByItemId,
  onSelect,
  onOpenDeps,
  projectId,
  canEdit,
  isContainer,
  collapsed,
  onToggleCollapse,
}: {
  item: ScheduleWorkspaceItemDto;
  items: ScheduleWorkspaceItemDto[];
  treeItems?: ScheduleWorkspaceDto["treeItems"];
  entriesByItemId: Map<string, ScheduleGanttEntry>;
  onSelect: (id: string) => void;
  onOpenDeps: (id: string) => void;
  projectId: string;
  canEdit: boolean;
  isContainer: boolean;
  collapsed: boolean;
  onToggleCollapse: (id: string) => void;
}) {
  const depth = item.treeDepth;
  const entry = entriesByItemId.get(item.id);
  const isSummary = isContainer;
  const hasDeps =
    item.predecessorDependencies.length > 0 || item.successorIds.length > 0;

  const extras = (
    <div className="flex shrink-0 items-center justify-end gap-0.5">
      {canEdit && (
        <ScheduleReorderControls
          projectId={projectId}
          itemId={item.id}
          items={items}
          treeItems={treeItems}
          size="xs"
          layout="menu"
        />
      )}
      <ScheduleMissingEdtBadge item={item} />
      {item.metrics?.overBudget && (
        <span className="rounded bg-amber-500/15 px-1 text-[9px] text-amber-700 dark:text-amber-400">
          PPTO
        </span>
      )}
      {hasDeps && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-5 shrink-0 px-1 text-[9px]"
          title="Editar dependencias FS"
          onClick={(e) => {
            e.stopPropagation();
            onOpenDeps(item.id);
          }}
        >
          FS
        </Button>
      )}
    </div>
  );

  const collapseBtn = isContainer ? (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      className="h-4 w-3.5 shrink-0 p-0 text-[9px] text-muted-foreground"
      title={collapsed ? "Expandir" : "Colapsar"}
      aria-label={collapsed ? "Expandir capítulo" : "Colapsar capítulo"}
      onClick={(e) => {
        e.stopPropagation();
        onToggleCollapse(item.id);
      }}
    >
      {collapsed ? "▸" : "▾"}
    </Button>
  ) : (
    <span className="inline-block w-3.5 shrink-0" aria-hidden />
  );

  const durationShort =
    item.durationDays != null && item.durationDays > 0 ? `${item.durationDays}d` : "—";

  if (entry) {
    return (
      <div
        className="min-w-0"
        style={{ paddingLeft: depth > 0 ? depth * 8 + 4 : 4 }}
      >
        <div className="flex min-w-0 items-center gap-0.5 pr-0.5">
          {collapseBtn}
          <div className="min-w-0 flex-1">
            <GanttSidebarItem
              feature={entry.feature}
              durationLabel={durationShort}
              onSelectItem={onSelect}
              className="gap-1 px-1 py-0"
            />
          </div>
          {extras}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-1 px-1 text-xs text-muted-foreground hover:bg-secondary cursor-pointer",
        isSummary && "italic",
      )}
      style={{
        height: "var(--gantt-row-height)",
        paddingLeft: depth > 0 ? depth * 8 + 4 : 4,
      }}
      role="button"
      tabIndex={0}
      title={item.name}
      onClick={() => onSelect(item.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onSelect(item.id);
      }}
    >
      {collapseBtn}
      <div
        className="h-2 w-2 shrink-0 rounded-full border border-dashed border-muted-foreground/50"
        style={isSummary ? { backgroundColor: CONTAINER_COLOR } : undefined}
      />
      <p className="min-w-0 flex-1 truncate text-left font-medium">{item.name}</p>
      {extras}
      <p className="shrink-0 text-[10px]">{durationShort}</p>
    </div>
  );
}

export function ScheduleGanttView({
  projectId,
  workspace,
  items,
  onSelect,
  onSelectWithTab,
  filtersExcludeAll = false,
  unfilteredActiveCount = 0,
}: {
  projectId: string;
  workspace: ScheduleWorkspaceDto;
  items: ScheduleWorkspaceItemDto[];
  onSelect: (item: ScheduleWorkspaceItemDto) => void;
  onSelectWithTab?: (item: ScheduleWorkspaceItemDto, tab: ScheduleItemDialogTab) => void;
  filtersExcludeAll?: boolean;
  unfilteredActiveCount?: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rollupPending, startRollupTransition] = useTransition();
  const [range, setRange] = useState<Range>("monthly");
  const [zoom, setZoom] = useState(100);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setCollapsedIds(readCollapsedIds(projectId));
  }, [projectId]);

  // Drop collapsed ids that are in view but no longer containers (full-tree isLeaf).
  // Keep ids outside the filtered view so filters don't wipe localStorage.
  useEffect(() => {
    setCollapsedIds((prev) => {
      if (prev.size === 0) return prev;
      const byId = new Map(items.map((i) => [i.id, i]));
      const valid = new Set(
        [...prev].filter((id) => {
          const row = byId.get(id);
          if (!row) return true; // filtered out — keep
          return !row.isLeaf;
        }),
      );
      if (valid.size === prev.size && [...valid].every((id) => prev.has(id))) {
        return prev;
      }
      writeCollapsedIds(projectId, valid);
      return valid;
    });
  }, [projectId, items]);

  const toggleCollapse = useCallback(
    (id: string) => {
      setCollapsedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        writeCollapsedIds(projectId, next);
        return next;
      });
    },
    [projectId],
  );

  const visibleItems = useMemo(
    () => items.filter((item) => !isHiddenByCollapsedAncestor(item.id, items, collapsedIds)),
    [items, collapsedIds],
  );

  const fallback = useMemo(() => new Date(), []);
  const entries = useMemo(
    () => mapScheduleItemsToGanttEntries(visibleItems, fallback, fallback),
    [visibleItems, fallback],
  );

  const entriesByItemId = useMemo(
    () => new Map(entries.map((e) => [e.item.id, e])),
    [entries],
  );

  const itemById = useMemo(() => new Map(visibleItems.map((i) => [i.id, i])), [visibleItems]);

  const dateBreakdown = useMemo(
    () => countScheduleItemsWithoutDates(visibleItems),
    [visibleItems],
  );

  const handleMove = useCallback(
    (id: string, startAt: Date, endAt: Date | null) => {
      if (!workspace.canEdit) return;
      const item = itemById.get(id);
      if (!item || !item.isLeaf) return;
      const end = endAt ?? (item.type === "MILESTONE" ? startAt : null);
      if (!end) return;
      // Gantt mouse math is local-calendar; persist that day (not UTC getUTC*).
      const startIso = toLocalDateOnlyString(startAt);
      const endIso =
        item.type === "MILESTONE" ? startIso : toLocalDateOnlyString(end);
      startTransition(async () => {
        const res = await updateScheduleItemDatesAction(projectId, id, {
          startDate: startIso,
          endDate: endIso,
        });
        if ("error" in res) {
          toast.error(res.error);
          router.refresh();
        } else {
          if ("fsWarnings" in res && res.fsWarnings?.length) {
            toast.warning(res.fsWarnings.join(" "));
          } else {
            toast.success("Fechas actualizadas");
          }
          router.refresh();
        }
      });
    },
    [projectId, router, workspace.canEdit, itemById],
  );

  const handleSelect = useCallback(
    (id: string) => {
      const item = itemById.get(id);
      if (item) onSelect(item);
    },
    [itemById, onSelect],
  );

  const handleOpenDeps = useCallback(
    (id: string) => {
      const item = itemById.get(id);
      if (!item) return;
      if (onSelectWithTab) onSelectWithTab(item, "deps");
      else onSelect(item);
    },
    [itemById, onSelect, onSelectWithTab],
  );

  const handleRecalculate = useCallback(() => {
    startRollupTransition(async () => {
      const res = await rollupScheduleContainersAction(projectId);
      if ("error" in res) toast.error(res.error);
      else {
        toast.success("Fechas de contenedores recalculadas");
        router.refresh();
      }
    });
  }, [projectId, router]);

  if (items.length === 0) {
    return (
      <ScheduleViewEmptyMessage
        filtersExcludeAll={filtersExcludeAll}
        unfilteredActiveCount={unfilteredActiveCount}
      />
    );
  }

  return (
    <div className="space-y-2" data-testid="schedule-gantt-view">
      {(dateBreakdown.containersWithoutDates > 0 || dateBreakdown.leavesWithoutDates > 0) && (
        <div className="space-y-0.5 text-xs text-muted-foreground">
          {dateBreakdown.containersWithoutDates > 0 && (
            <p>
              {dateBreakdown.containersWithoutDates} contenedor
              {dateBreakdown.containersWithoutDates > 1 ? "es" : ""} sin fechas (esperando
              subtareas programadas).
            </p>
          )}
          {dateBreakdown.leavesWithoutDates > 0 && (
            <p>
              {dateBreakdown.leavesWithoutDates} tarea
              {dateBreakdown.leavesWithoutDates > 1 ? "s" : ""} sin programar. Asigná fechas en el
              detalle de la tarea.
            </p>
          )}
        </div>
      )}
      <p className="text-[10px] text-muted-foreground">
        Barra: relleno oscuro = Real · borde ámbar = Cert. · rojo = atrasado · Botón FS =
        dependencias. ▾ colapsa capítulos.
      </p>
      <div className="overflow-hidden rounded-md border">
        <ScheduleGanttToolbar
          range={range}
          onRangeChange={setRange}
          zoom={zoom}
          onZoomChange={setZoom}
          sidebarOpen={sidebarOpen}
          onSidebarOpenChange={setSidebarOpen}
          canEdit={workspace.canEdit}
          onRecalculateContainers={handleRecalculate}
          recalculatePending={rollupPending}
        />
        <GanttProvider
          range={range}
          zoom={zoom}
          className={cn(
            "h-[min(65vh,680px)] w-full border-0 rounded-none",
            (pending || rollupPending) && "opacity-80 pointer-events-none",
          )}
        >
          {sidebarOpen ? (
            <GanttSidebar className="w-[min(38vw,400px)] min-w-[260px]">
              {visibleItems.map((item) => (
                <ScheduleGanttSidebarRow
                  key={item.id}
                  item={item}
                  items={items}
                  treeItems={workspace.treeItems}
                  entriesByItemId={entriesByItemId}
                  onSelect={handleSelect}
                  onOpenDeps={handleOpenDeps}
                  projectId={projectId}
                  canEdit={workspace.canEdit}
                  isContainer={!item.isLeaf}
                  collapsed={collapsedIds.has(item.id)}
                  onToggleCollapse={toggleCollapse}
                />
              ))}
            </GanttSidebar>
          ) : null}
          <GanttTimeline>
            <GanttGoToTodayButton />
            <GanttHeader />
            <GanttFeatureList>
              <GanttFeatureListGroup>
                {visibleItems.map((item) => {
                  const entry = entriesByItemId.get(item.id);
                  if (!entry) {
                    return (
                      <div
                        key={item.id}
                        className="relative flex w-max min-w-full py-0.5"
                        style={{ height: "var(--gantt-row-height)" }}
                        aria-hidden
                      />
                    );
                  }

                  const { feature } = entry;
                  const pctRaw = Number(item.progressPct);
                  const pct = Number.isFinite(pctRaw) ? Math.min(100, Math.max(0, pctRaw)) : 0;
                  const { real, timePlan, quantity, certified } = scheduleProgressValues(item);
                  const certRaw =
                    certified != null && certified !== "" ? Number(certified) : null;
                  const certPct =
                    certRaw != null && Number.isFinite(certRaw)
                      ? Math.min(100, Math.max(0, certRaw))
                      : null;
                  const title = `Real: ${formatProgressPctDisplay(real)} · Plan (t): ${formatProgressPctDisplay(timePlan)} · Cant.: ${formatProgressPctDisplay(quantity)} · Cert.: ${formatProgressPctDisplay(certified)}`;
                  const isMilestone = item.type === "MILESTONE";
                  const isSummary = !item.isLeaf;
                  const barColor = scheduleItemBarColor(item, isSummary);
                  const canDrag = workspace.canEdit && item.isLeaf;
                  return (
                    <GanttFeatureItem
                      key={feature.id}
                      {...feature}
                      onMove={canDrag ? handleMove : undefined}
                    >
                      <div
                        title={title}
                        className={cn(
                          "relative flex h-full w-full items-center overflow-hidden rounded px-1 text-[10px] text-white",
                          isMilestone && "h-2.5 min-h-2.5 self-center rounded-sm ring-1 ring-white/30",
                          isSummary && "opacity-90",
                          certPct != null &&
                            certPct > 0 &&
                            !isMilestone &&
                            !isSummary &&
                            "ring-1 ring-inset ring-amber-400/80",
                        )}
                        style={{ backgroundColor: barColor }}
                      >
                        {!isMilestone && !isSummary && (
                          <>
                            <div
                              className="absolute inset-y-0 left-0 bg-black/25"
                              style={{ width: `${Math.min(100, pct)}%` }}
                            />
                            {certPct != null && certPct > 0 && (
                              <div
                                className="absolute bottom-0 left-0 h-0.5 bg-amber-300/90"
                                style={{ width: `${Math.min(100, certPct)}%` }}
                              />
                            )}
                          </>
                        )}
                        <span className="relative z-10 truncate">
                          {isMilestone
                            ? item.status === "COMPLETED"
                              ? "◆✓"
                              : "◆"
                            : isSummary
                              ? "▬"
                              : `${pct}%`}
                        </span>
                        {!isMilestone &&
                          !isSummary &&
                          (item.predecessorDependencies.length > 0 ||
                            item.successorIds.length > 0) && (
                            <button
                              type="button"
                              className="relative z-10 ml-auto shrink-0 rounded bg-black/30 px-0.5 text-[8px] leading-none"
                              title="Dependencias FS"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenDeps(item.id);
                              }}
                            >
                              FS
                            </button>
                          )}
                      </div>
                    </GanttFeatureItem>
                  );
                })}
              </GanttFeatureListGroup>
            </GanttFeatureList>
            <ScheduleGanttDependencyLayer items={visibleItems} entries={entries} />
            <GanttToday />
          </GanttTimeline>
        </GanttProvider>
      </div>
    </div>
  );
}
