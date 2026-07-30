"use client";

import { useId, useMemo } from "react";
import type { ScheduleWorkspaceItemDto } from "@bloqer/services";
import { getOffset, useGanttLayout, type Range, type TimelineData } from "@/components/kibo-ui/gantt";
import type { ScheduleGanttEntry } from "../adapters/schedule-view-types";

function rowCenterY(rowIndex: number, headerHeight: number, rowHeight: number): number {
  return headerHeight + rowIndex * rowHeight + rowHeight / 2;
}

/** Match Kibo header columns: daily = days; monthly/quarterly = months. */
function countTimelineColumns(timelineData: TimelineData, range: Range): number {
  let months = 0;
  let days = 0;
  for (const year of timelineData) {
    for (const quarter of year.quarters) {
      months += quarter.months.length;
      for (const month of quarter.months) {
        days += month.days;
      }
    }
  }
  return range === "daily" ? days : months;
}

export function ScheduleGanttDependencyLayer({
  items,
  entries,
}: {
  items: ScheduleWorkspaceItemDto[];
  entries: ScheduleGanttEntry[];
}) {
  const gantt = useGanttLayout();
  const markerId = useId().replace(/:/g, "");

  const entriesByItemId = useMemo(
    () => new Map(entries.map((e) => [e.item.id, e])),
    [entries],
  );

  const rowIndexById = useMemo(() => {
    const m = new Map<string, number>();
    items.forEach((item, i) => m.set(item.id, i));
    return m;
  }, [items]);

  const timelineStartDate = useMemo(
    () => new Date(gantt.timelineData.at(0)?.year ?? new Date().getFullYear(), 0, 1),
    [gantt.timelineData],
  );

  const columnWidthPx = (gantt.columnWidth * gantt.zoom) / 100;
  const columnCount = countTimelineColumns(gantt.timelineData, gantt.range);
  const timelineWidth = Math.max(1, columnCount * columnWidthPx);
  const timelineHeight = gantt.headerHeight + items.length * gantt.rowHeight;

  const paths = useMemo(() => {
    const result: string[] = [];
    const { headerHeight, rowHeight } = gantt;

    for (const item of items) {
      const succEntry = entriesByItemId.get(item.id);
      if (!succEntry) continue;

      for (const dep of item.predecessorDependencies) {
        const predEntry = entriesByItemId.get(dep.predecessorId);
        if (!predEntry) continue;
        const predIdx = rowIndexById.get(dep.predecessorId);
        const succIdx = rowIndexById.get(item.id);
        if (predIdx === undefined || succIdx === undefined) continue;

        const x1 = getOffset(predEntry.feature.endAt, timelineStartDate, gantt);
        const x2 = getOffset(succEntry.feature.startAt, timelineStartDate, gantt);
        const y1 = rowCenterY(predIdx, headerHeight, rowHeight);
        const y2 = rowCenterY(succIdx, headerHeight, rowHeight);
        const midX = (x1 + x2) / 2;
        result.push(`M ${x1} ${y1} H ${midX} V ${y2} H ${x2}`);
      }
    }
    return result;
  }, [items, entriesByItemId, gantt, rowIndexById, timelineStartDate]);

  if (paths.length === 0) return null;

  return (
    <svg
      className="pointer-events-none absolute left-0 top-0 z-10"
      width={timelineWidth}
      height={timelineHeight}
      viewBox={`0 0 ${timelineWidth} ${timelineHeight}`}
      overflow="visible"
      aria-hidden
    >
      <defs>
        <marker
          id={`arrow-${markerId}`}
          markerWidth="6"
          markerHeight="6"
          refX="5"
          refY="3"
          orient="auto"
        >
          <path d="M0,0 L6,3 L0,6 Z" fill="hsl(var(--muted-foreground))" />
        </marker>
      </defs>
      {paths.map((d, i) => (
        <path
          key={i}
          d={d}
          fill="none"
          stroke="hsl(var(--muted-foreground))"
          strokeWidth={1.5}
          markerEnd={`url(#arrow-${markerId})`}
          opacity={0.65}
        />
      ))}
    </svg>
  );
}
