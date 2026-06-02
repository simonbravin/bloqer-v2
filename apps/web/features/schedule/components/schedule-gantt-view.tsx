"use client";

import { useCallback, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ScheduleWorkspaceDto, ScheduleWorkspaceItemDto } from "@bloqer/services";
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
import { toUtcDateOnlyString } from "@/lib/date-input";
import {
  mapScheduleItemsToGanttEntries,
  scheduleItemTreeDepth,
  STATUS_COLORS,
} from "../adapters/schedule-view-types";
import { scheduleProgressValues } from "./schedule-progress-dimensions";
import { updateScheduleItemDatesAction } from "../actions/schedule-actions";
import { ScheduleGanttDependencyLayer } from "./schedule-gantt-dependency-layer";
import { ScheduleViewEmptyMessage } from "./schedule-empty-state";

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

  const fallback = useMemo(() => new Date(), []);
  const entries = useMemo(
    () => mapScheduleItemsToGanttEntries(items, fallback, fallback),
    [items, fallback],
  );

  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  const handleMove = useCallback(
    (id: string, startAt: Date, endAt: Date | null) => {
      if (!workspace.canEdit || !endAt) return;
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
    [projectId, router, workspace.canEdit],
  );

  const handleSelect = useCallback(
    (id: string) => {
      const item = itemById.get(id);
      if (item) onSelect(item);
    },
    [itemById, onSelect],
  );

  if (items.length === 0) {
    return (
      <ScheduleViewEmptyMessage
        filtersExcludeAll={filtersExcludeAll}
        unfilteredActiveCount={unfilteredActiveCount}
      />
    );
  }

  const noDatesCount = items.length - entries.length;

  return (
    <div className="space-y-2">
      {noDatesCount > 0 && (
        <p className="text-xs text-muted-foreground">
          {noDatesCount} ítem{noDatesCount > 1 ? "s" : ""} sin fechas (no aparecen en la línea de
          tiempo). Asigná fechas en el detalle de la tarea.
        </p>
      )}
      <GanttProvider
        range="monthly"
        className={cn(
          "h-[min(70vh,720px)] w-full border rounded-md",
          pending && "opacity-80 pointer-events-none",
        )}
      >
        <GanttSidebar>
          {entries.map(({ feature, item }) => {
            const depth = scheduleItemTreeDepth(items, item.id);
            return (
              <div
                key={feature.id}
                className="min-w-0"
                style={depth > 0 ? { paddingLeft: depth * 12 } : undefined}
              >
                <GanttSidebarItem feature={feature} onSelectItem={handleSelect} />
              </div>
            );
          })}
        </GanttSidebar>
        <GanttTimeline>
          <GanttHeader />
          <GanttFeatureList>
            <GanttFeatureListGroup>
              {entries.map(({ item, feature }) => {
                const pct = Number(item.progressPct);
                const { real, timePlan, quantity, certified } = scheduleProgressValues(item);
                const title = `Real: ${real}% · Plan (t): ${timePlan ?? "—"}% · Cant.: ${quantity ?? "—"}% · Cert.: ${certified ?? "—"}%`;
                const isMilestone = item.type === "MILESTONE";
                return (
                  <GanttFeatureItem
                    key={feature.id}
                    {...feature}
                    onMove={workspace.canEdit && !isMilestone ? handleMove : undefined}
                  >
                    <div
                      title={title}
                      className={cn(
                        "relative flex h-full w-full items-center overflow-hidden rounded px-1 text-[10px] text-white",
                        isMilestone && "h-2 min-h-2 self-center rounded-sm",
                      )}
                      style={{ backgroundColor: STATUS_COLORS[item.status] ?? "#64748b" }}
                    >
                      {!isMilestone && (
                        <div
                          className="absolute inset-y-0 left-0 bg-black/25"
                          style={{ width: `${Math.min(100, pct)}%` }}
                        />
                      )}
                      <span className="relative z-10 truncate">
                        {isMilestone ? "◆" : `${pct}%`}
                      </span>
                    </div>
                  </GanttFeatureItem>
                );
              })}
            </GanttFeatureListGroup>
          </GanttFeatureList>
          <ScheduleGanttDependencyLayer entries={entries} />
          <GanttToday />
        </GanttTimeline>
      </GanttProvider>
    </div>
  );
}
