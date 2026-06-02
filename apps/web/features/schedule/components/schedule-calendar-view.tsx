"use client";

import { useMemo } from "react";
import type { ScheduleWorkspaceItemDto } from "@bloqer/services";
import {
  CalendarBody,
  CalendarDatePagination,
  CalendarDatePicker,
  CalendarHeader,
  CalendarItem,
  CalendarMonthPicker,
  CalendarProvider,
  CalendarYearPicker,
} from "@/components/kibo-ui/calendar";
import { mapScheduleItemsToCalendarFeatures } from "../adapters/schedule-view-types";
import { ScheduleViewEmptyMessage } from "./schedule-empty-state";

export function ScheduleCalendarView({
  items,
  onSelect,
  filtersExcludeAll = false,
  unfilteredActiveCount = 0,
}: {
  items: ScheduleWorkspaceItemDto[];
  onSelect: (item: ScheduleWorkspaceItemDto) => void;
  filtersExcludeAll?: boolean;
  unfilteredActiveCount?: number;
}) {
  const fallback = useMemo(() => new Date(), []);
  const features = useMemo(
    () => mapScheduleItemsToCalendarFeatures(items, fallback),
    [items, fallback],
  );
  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  const yearSpan = useMemo(() => {
    const years = features.flatMap((f) => [f.startAt.getFullYear(), f.endAt.getFullYear()]);
    const now = new Date().getFullYear();
    if (years.length === 0) return { start: now - 1, end: now + 2 };
    return { start: Math.min(...years) - 1, end: Math.max(...years) + 1 };
  }, [features]);

  if (items.length === 0) {
    return (
      <ScheduleViewEmptyMessage
        filtersExcludeAll={filtersExcludeAll}
        unfilteredActiveCount={unfilteredActiveCount}
      />
    );
  }

  return (
    <CalendarProvider locale="es-AR" startDay={1} className="rounded-md border p-4">
      <CalendarDatePicker className="mb-4">
        <CalendarMonthPicker />
        <CalendarYearPicker start={yearSpan.start} end={yearSpan.end} />
        <CalendarDatePagination />
      </CalendarDatePicker>
      <CalendarHeader />
      <CalendarBody features={features}>
        {({ feature }) => (
          <button
            type="button"
            className="w-full text-left"
            onClick={() => {
              const item = itemById.get(feature.id);
              if (item) onSelect(item);
            }}
          >
            <CalendarItem feature={feature} />
          </button>
        )}
      </CalendarBody>
    </CalendarProvider>
  );
}
