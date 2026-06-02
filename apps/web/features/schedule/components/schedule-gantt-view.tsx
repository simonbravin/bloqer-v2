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
  GanttHeader,
  GanttProvider,
  GanttSidebar,
  GanttSidebarItem,
  GanttTimeline,
  GanttToday,
} from "@/components/kibo-ui/gantt";
import { cn } from "@/lib/utils";
import { formatDurationDaysAr } from "@/lib/gantt-date-format";
import { toUtcDateOnlyString } from "@/lib/date-input";
import type { ScheduleGanttEntry } from "../adapters/schedule-view-types";
import {
  CONTAINER_COLOR,
  countScheduleItemsWithoutDates,
  mapScheduleItemsToGanttEntries,
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

function ScheduleGanttSidebarRow({
  item,
  items,
  entriesByItemId,
  onSelect,
}: {
  item: ScheduleWorkspaceItemDto;
  items: ScheduleWorkspaceItemDto[];
  entriesByItemId: Map<string, ScheduleGanttEntry>;
  onSelect: (id: string) => void;
}) {
  const depth = scheduleItemTreeDepth(items, item.id);
  const entry = entriesByItemId.get(item.id);
  const isSummary = scheduleItemHasActiveChildren(items, item.id);

  if (entry) {
    return (
      <div
        className="min-w-0"
        style={{ paddingLeft: depth > 0 ? depth * 12 + 10 : 10 }}
      >
        <GanttSidebarItem
          feature={entry.feature}
          durationLabel={formatDurationDaysAr(item.durationDays)}
          onSelectItem={onSelect}
        />
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
      <p className="shrink-0 text-[10px]">Sin fechas</p>
    </div>
  );
}

export function ScheduleGanttView({
  projectId,
  workspace,
  items,
  onSelect,
  filtersExcludeAll = false,
  unfilteredActiveCount = 0,
}: {
  projectId: string;
  workspace: ScheduleWorkspaceDto;
  items: ScheduleWorkspaceItemDto[];
  onSelect: (item: ScheduleWorkspaceItemDto) => void;
  filtersExcludeAll?: boolean;
  unfilteredActiveCount?: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rollupPending, startRollupTransition] = useTransition();
  const [range, setRange] = useState<Range>("monthly");
  const [zoom, setZoom] = useState(100);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const visibleItems = useMemo(
    () => items.filter((i) => i.status !== "CANCELLED"),
    [items],
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
      if (!workspace.canEdit || !endAt) return;
      if (scheduleItemHasActiveChildren(visibleItems, id)) return;
      startTransition(async () => {
        const res = await updateScheduleItemDatesAction(projectId, id, {
          startDate: toUtcDateOnlyString(startAt),
          endDate: toUtcDateOnlyString(endAt),
        });
        if ("error" in res) toast.error(res.error);
        else {
          if ("fsWarnings" in res && res.fsWarnings?.length) {
            toast.warning(res.fsWarnings.join(" "));
          }
          router.refresh();
        }
      });
    },
    [projectId, router, workspace.canEdit, visibleItems],
  );

  const handleSelect = useCallback(
    (id: string) => {
      const item = itemById.get(id);
      if (item) onSelect(item);
    },
    [itemById, onSelect],
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

  const cancelledCount = items.length - visibleItems.length;

  return (
    <div className="space-y-2">
      {cancelledCount > 0 && (
        <p className="text-xs text-muted-foreground">
          {cancelledCount} tarea{cancelledCount > 1 ? "s" : ""} cancelada
          {cancelledCount > 1 ? "s" : ""} no aparece{cancelledCount > 1 ? "n" : ""} en el Gantt.
        </p>
      )}
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
      <GanttProvider
        range={range}
        zoom={zoom}
        className={cn(
          "h-[min(70vh,720px)] w-full border rounded-md",
          (pending || rollupPending) && "opacity-80 pointer-events-none",
        )}
      >
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
        {sidebarOpen ? (
          <GanttSidebar>
            {visibleItems.map((item) => (
              <ScheduleGanttSidebarRow
                key={item.id}
                item={item}
                items={visibleItems}
                entriesByItemId={entriesByItemId}
                onSelect={handleSelect}
              />
            ))}
          </GanttSidebar>
        ) : null}
        <GanttTimeline>
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
                const title = `Real: ${real}% · Plan (t): ${timePlan ?? "—"}% · Cant.: ${quantity ?? "—"}% · Cert.: ${certified ?? "—"}%`;
                const isMilestone = item.type === "MILESTONE";
                const isSummary = scheduleItemHasActiveChildren(visibleItems, item.id);
                const barColor = isSummary
                  ? CONTAINER_COLOR
                  : (STATUS_COLORS[item.status] ?? "#64748b");
                return (
                  <GanttFeatureItem
                    key={feature.id}
                    {...feature}
                    onMove={
                      workspace.canEdit && !isMilestone && !isSummary ? handleMove : undefined
                    }
                  >
                    <div
                      title={title}
                      className={cn(
                        "relative flex h-full w-full items-center overflow-hidden rounded px-1 text-[10px] text-white",
                        isMilestone && "h-2 min-h-2 self-center rounded-sm",
                        isSummary && "opacity-90",
                      )}
                      style={{ backgroundColor: barColor }}
                    >
                      {!isMilestone && !isSummary && (
                        <div
                          className="absolute inset-y-0 left-0 bg-black/25"
                          style={{ width: `${Math.min(100, pct)}%` }}
                        />
                      )}
                      <span className="relative z-10 truncate">
                        {isMilestone ? "◆" : isSummary ? "▬" : `${pct}%`}
                      </span>
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
  );
}
