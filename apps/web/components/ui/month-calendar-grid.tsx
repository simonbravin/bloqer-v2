"use client";

import { useMemo, useState } from "react";
import { calendarPartsInTimeZone } from "@bloqer/utils";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type MonthCalendarDayEvent<T> = {
  id: string;
  data: T;
  color: string;
  label: string;
};

export type MonthCalendarGridProps<T> = {
  eventsByDay: Map<string, MonthCalendarDayEvent<T>[]>;
  onEventClick: (data: T) => void;
  onDayClick?: (dayKey: string) => void;
  maxVisiblePerDay?: number;
};

export function MonthCalendarGrid<T>({
  eventsByDay,
  onEventClick,
  onDayClick,
  maxVisiblePerDay = 3,
}: MonthCalendarGridProps<T>) {
  const [cursor, setCursor] = useState(() => {
    const today = calendarPartsInTimeZone();
    return new Date(Date.UTC(today.year, today.month - 1, 1));
  });

  const year = cursor.getUTCFullYear();
  const month = cursor.getUTCMonth();
  const firstDow = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const todayParts = useMemo(() => calendarPartsInTimeZone(), []);

  const monthLabel = cursor.toLocaleDateString("es-AR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          size="sm"
          type="button"
          onClick={() => setCursor(new Date(Date.UTC(year, month - 1, 1)))}
        >
          ←
        </Button>
        <span className="text-sm font-medium capitalize">{monthLabel}</span>
        <Button
          variant="outline"
          size="sm"
          type="button"
          onClick={() => setCursor(new Date(Date.UTC(year, month + 1, 1)))}
        >
          →
        </Button>
      </div>
      <div className="grid grid-cols-7 gap-px rounded-md border bg-border text-center text-xs">
        {["Do", "Lu", "Ma", "Mi", "Ju", "Vi", "Sa"].map((d) => (
          <div key={d} className="bg-muted/50 p-2 font-medium">
            {d}
          </div>
        ))}
        {Array.from({ length: firstDow }).map((_, i) => (
          <div key={`pad-${i}`} className="min-h-[72px] bg-background" />
        ))}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const feats = eventsByDay.get(key) ?? [];
          const isToday =
            todayParts.year === year &&
            todayParts.month === month + 1 &&
            todayParts.day === day;
          return (
            <div
              key={key}
              className={cn(
                "min-h-[72px] bg-background p-1 text-left align-top",
                isToday && "ring-1 ring-primary ring-inset",
                onDayClick && "cursor-pointer hover:bg-muted/30",
              )}
              onClick={onDayClick ? () => onDayClick(key) : undefined}
              onKeyDown={
                onDayClick
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onDayClick(key);
                      }
                    }
                  : undefined
              }
              role={onDayClick ? "button" : undefined}
              tabIndex={onDayClick ? 0 : undefined}
            >
              <span className="text-[10px] text-muted-foreground">{day}</span>
              <div className="mt-1 space-y-0.5">
                {feats.slice(0, maxVisiblePerDay).map((ev) => (
                  <button
                    key={ev.id}
                    type="button"
                    aria-label={ev.label}
                    className="block w-full truncate rounded px-1 py-0.5 text-[10px] text-left text-white"
                    style={{ backgroundColor: ev.color }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onEventClick(ev.data);
                    }}
                  >
                    {ev.label}
                  </button>
                ))}
                {feats.length > maxVisiblePerDay && (
                  <span className="text-[10px] text-muted-foreground">
                    +{feats.length - maxVisiblePerDay}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
