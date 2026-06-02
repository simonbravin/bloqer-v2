"use client";

import { useId, useMemo } from "react";
import { getOffset, useGanttLayout } from "@/components/kibo-ui/gantt";
import type { ScheduleGanttEntry } from "../adapters/schedule-view-types";

function rowCenterY(rowIndex: number, headerHeight: number, rowHeight: number): number {
  return headerHeight + rowIndex * rowHeight + rowHeight / 2;
}

export function ScheduleGanttDependencyLayer({ entries }: { entries: ScheduleGanttEntry[] }) {
  const gantt = useGanttLayout();
  const markerId = useId().replace(/:/g, "");

  const rowIndexById = useMemo(() => {
    const m = new Map<string, number>();
    entries.forEach((e, i) => m.set(e.item.id, i));
    return m;
  }, [entries]);

  const timelineStartDate = useMemo(
    () => new Date(gantt.timelineData.at(0)?.year ?? new Date().getFullYear(), 0, 1),
    [gantt.timelineData],
  );

  const paths = useMemo(() => {
    const result: string[] = [];
    const { headerHeight, rowHeight } = gantt;

    for (const { item, feature: succFeature } of entries) {
      for (const dep of item.predecessorDependencies) {
        const predEntry = entries.find((e) => e.item.id === dep.predecessorId);
        if (!predEntry) continue;
        const predIdx = rowIndexById.get(dep.predecessorId);
        const succIdx = rowIndexById.get(item.id);
        if (predIdx === undefined || succIdx === undefined) continue;

        const x1 = getOffset(predEntry.feature.endAt, timelineStartDate, gantt);
        const x2 = getOffset(succFeature.startAt, timelineStartDate, gantt);
        const y1 = rowCenterY(predIdx, headerHeight, rowHeight);
        const y2 = rowCenterY(succIdx, headerHeight, rowHeight);
        const midX = (x1 + x2) / 2;
        result.push(`M ${x1} ${y1} H ${midX} V ${y2} H ${x2}`);
      }
    }
    return result;
  }, [entries, gantt, rowIndexById, timelineStartDate]);

  if (paths.length === 0) return null;

  return (
    <svg
      className="pointer-events-none absolute inset-0 z-10 h-full w-full overflow-visible"
      aria-hidden
    >
      {paths.map((d, i) => (
        <path
          key={i}
          d={d}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          className="text-muted-foreground/70"
          markerEnd={`url(#${markerId})`}
        />
      ))}
      <defs>
        <marker
          id={markerId}
          markerWidth="6"
          markerHeight="6"
          refX="5"
          refY="3"
          orient="auto"
        >
          <path d="M0,0 L6,3 L0,6 Z" className="fill-muted-foreground/70" />
        </marker>
      </defs>
    </svg>
  );
}
