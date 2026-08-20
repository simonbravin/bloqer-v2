"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
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
import { formatDurationDaysAr } from "@/lib/gantt-date-format";
import { toLocalDateOnlyString } from "@/lib/date-input";
import { formatMoneyAmount, isPositiveMoneyAmount } from "@/lib/format-money";
import type { ScheduleGanttEntry } from "../adapters/schedule-view-types";
import {
  CONTAINER_COLOR,
  countScheduleItemsWithoutDates,
  mapScheduleItemsToGanttEntries,
  primaryWbsLink,
  scheduleItemHasActiveChildren,
  scheduleItemTreeDepth,
  STATUS_COLORS,
} from "../adapters/schedule-view-types";
import { scheduleProgressValues } from "./schedule-progress-dimensions";
import {
  rollupScheduleContainersAction,
  updateScheduleItemDatesAction,
} from "../actions/schedule-actions";
import { ScheduleGanttDependencyLayer } from "./schedule-gantt-dependency-layer";
import { ScheduleGanttToolbar } from "./schedule-gantt-toolbar";
import { ScheduleViewEmptyMessage } from "./schedule-empty-state";
import { ScheduleMissingEdtBadge } from "./schedule-missing-edt-badge";
import type { ScheduleItemDialogTab } from "./schedule-item-dialog";

function ScheduleGanttSidebarRow({
  item,
  items,
  entriesByItemId,
  onSelect,
  onOpenDeps,
  budgetCurrency,
}: {
  item: ScheduleWorkspaceItemDto;
  items: ScheduleWorkspaceItemDto[];
  entriesByItemId: Map<string, ScheduleGanttEntry>;
  onSelect: (id: string) => void;
  onOpenDeps: (id: string) => void;
  budgetCurrency: string;
}) {
  const depth = scheduleItemTreeDepth(items, item.id);
  const entry = entriesByItemId.get(item.id);
  const isSummary = scheduleItemHasActiveChildren(items, item.id);
  const primary = primaryWbsLink(item);
  const committed = item.metrics?.committedCost;
  const hasDeps =
    item.predecessorDependencies.length > 0 || item.successorIds.length > 0;

  const extras = (
    <div className="flex max-w-[40%] shrink-0 items-center justify-end gap-0.5 overflow-hidden">
      <ScheduleMissingEdtBadge item={item} allItems={items} />
      {item.metrics?.overBudget && (
        <span className="rounded bg-amber-500/15 px-1 text-[9px] text-amber-700 dark:text-amber-400">
          PPTO
        </span>
      )}
      {committed && isPositiveMoneyAmount(committed) && (
        <span
          className="truncate text-[9px] text-muted-foreground tabular-nums"
          title={`Comprometido ${formatMoneyAmount(committed, budgetCurrency)}`}
        >
          {formatMoneyAmount(committed, budgetCurrency)}
        </span>
      )}
      {primary && (
        <span className="truncate max-w-[40px] text-[9px] text-muted-foreground" title={primary.wbsCode}>
          {primary.wbsCode}
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

  if (entry) {
    return (
      <div
        className="min-w-0"
        style={{ paddingLeft: depth > 0 ? depth * 12 + 10 : 10 }}
      >
        <div className="flex items-center gap-1 pr-1">
          <div className="min-w-0 flex-1">
            <GanttSidebarItem
              feature={entry.feature}
              durationLabel={formatDurationDaysAr(item.durationDays)}
              onSelectItem={onSelect}
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
        "flex items-center gap-2.5 px-2.5 text-xs text-muted-foreground hover:bg-secondary cursor-pointer",
        isSummary && "italic",
      )}
      style={{
        height: "var(--gantt-row-height)",
        paddingLeft: depth > 0 ? depth * 12 + 10 : 10,
      }}
      role="button"
      tabIndex={0}
      onClick={() => onSelect(item.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onSelect(item.id);
      }}
    >
      <div
        className="h-2 w-2 shrink-0 rounded-full border border-dashed border-muted-foreground/50"
        style={isSummary ? { backgroundColor: CONTAINER_COLOR } : undefined}
      />
      <p className="flex-1 truncate text-left font-medium">{item.name}</p>
      {extras}
      <p className="shrink-0 text-[10px]">Sin fechas</p>
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

  const visibleItems = items;

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
      if (scheduleItemHasActiveChildren(visibleItems, id)) return;
      const item = itemById.get(id);
      const end = endAt ?? (item?.type === "MILESTONE" ? startAt : null);
      if (!end) return;
      // Gantt mouse math is local-calendar; persist that day (not UTC getUTC*).
      const startIso = toLocalDateOnlyString(startAt);
      const endIso =
        item?.type === "MILESTONE" ? startIso : toLocalDateOnlyString(end);
      startTransition(async () => {
        const res = await updateScheduleItemDatesAction(projectId, id, {
          startDate: startIso,
          endDate: endIso,
        });
        if ("error" in res) toast.error(res.error);
        else {
          if ("fsWarnings" in res && res.fsWarnings?.length) {
            toast.warning(res.fsWarnings.join(" "));
          } else {
            toast.success("Fechas actualizadas");
          }
          router.refresh();
        }
      });
    },
    [projectId, router, workspace.canEdit, visibleItems, itemById],
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

  if (visibleItems.length === 0) {
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
        Barra: relleno oscuro = Real · borde ámbar = Cert. · Botón FS = dependencias.
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
            <GanttSidebar>
              {visibleItems.map((item) => (
                <ScheduleGanttSidebarRow
                  key={item.id}
                  item={item}
                  items={visibleItems}
                  entriesByItemId={entriesByItemId}
                  onSelect={handleSelect}
                  onOpenDeps={handleOpenDeps}
                  budgetCurrency={workspace.budgetCurrency}
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
                  const pct = Number(item.progressPct);
                  const { real, timePlan, quantity, certified } = scheduleProgressValues(item);
                  const certPct =
                    certified != null && certified !== "" ? Number(certified) : null;
                  const title = `Real: ${real}% · Plan (t): ${timePlan ?? "—"}% · Cant.: ${quantity ?? "—"}% · Cert.: ${certified ?? "—"}%`;
                  const isMilestone = item.type === "MILESTONE";
                  const isSummary = scheduleItemHasActiveChildren(visibleItems, item.id);
                  const barColor = isSummary
                    ? CONTAINER_COLOR
                    : (STATUS_COLORS[item.status] ?? "#64748b");
                  const canDrag = workspace.canEdit && !isSummary;
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
                          isMilestone && "h-2 min-h-2 self-center rounded-sm",
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
                          {isMilestone ? "◆" : isSummary ? "▬" : `${pct}%`}
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
