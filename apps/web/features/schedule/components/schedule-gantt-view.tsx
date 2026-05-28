"use client";

import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ScheduleWorkspaceDto, ScheduleWorkspaceItemDto } from "@bloqer/services";
import { cn } from "@/lib/utils";
import { mapItemToGanttFeature, STATUS_COLORS } from "../adapters/schedule-view-types";
import { scheduleProgressValues } from "./schedule-progress-dimensions";
import { updateScheduleItemDatesAction } from "../actions/schedule-actions";

const DAY_WIDTH = 28;
const ROW_HEIGHT = 36;
const LABEL_WIDTH = 220;

function addDaysUtc(d: Date, n: number): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + n);
  return out;
}

function daysBetweenUtc(a: Date, b: Date): number {
  const ms = 86_400_000;
  const da = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  const db = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
  return Math.max(1, Math.round((db - da) / ms) + 1);
}

function buildDepthMap(items: ScheduleWorkspaceItemDto[]): Map<string, number> {
  const byId = new Map(items.map((i) => [i.id, i]));
  const cache = new Map<string, number>();
  function depth(id: string): number {
    if (cache.has(id)) return cache.get(id)!;
    const p = byId.get(id)?.parentId;
    const d = p ? 1 + depth(p) : 0;
    cache.set(id, d);
    return d;
  }
  return new Map(items.map((i) => [i.id, depth(i.id)]));
}

type DateOverride = { start: Date; end: Date };

export function ScheduleGanttView({
  projectId,
  workspace,
  items,
  onSelect,
}: {
  projectId: string;
  workspace: ScheduleWorkspaceDto;
  items: ScheduleWorkspaceItemDto[];
  onSelect: (item: ScheduleWorkspaceItemDto) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [overrides, setOverrides] = useState<Record<string, DateOverride>>({});
  const dragRef = useRef<{
    itemId: string;
    mode: "move" | "resize-end";
    startX: number;
    origStart: Date;
    origEnd: Date;
  } | null>(null);

  const depthMap = useMemo(() => buildDepthMap(items), [items]);
  const itemIndex = useMemo(() => new Map(items.map((i, idx) => [i.id, idx])), [items]);

  const range = useMemo(() => {
    let min = new Date();
    let max = addDaysUtc(min, 30);
    for (const item of items) {
      const ov = overrides[item.id];
      const f = ov
        ? { startAt: ov.start, endAt: ov.end }
        : mapItemToGanttFeature(item, min, max);
      if (!f) continue;
      if (f.startAt < min) min = f.startAt;
      if (f.endAt > max) max = f.endAt;
    }
    min = addDaysUtc(min, -7);
    max = addDaysUtc(max, 14);
    const totalDays = daysBetweenUtc(min, max);
    return { min, max, totalDays };
  }, [items, overrides]);

  const getFeature = useCallback(
    (item: ScheduleWorkspaceItemDto) => {
      const ov = overrides[item.id];
      if (ov) return { startAt: ov.start, endAt: ov.end };
      return mapItemToGanttFeature(item, range.min, range.max);
    },
    [overrides, range.min, range.max],
  );

  const persistDates = useCallback(
    (itemId: string, start: Date, end: Date, rollback?: DateOverride) => {
      const startDate = start.toISOString().slice(0, 10);
      const endDate = end.toISOString().slice(0, 10);
      startTransition(async () => {
        const res = await updateScheduleItemDatesAction(projectId, itemId, {
          startDate,
          endDate,
        });
        if ("error" in res) {
          toast.error(res.error);
          if (rollback) {
            setOverrides((prev) => ({ ...prev, [itemId]: rollback }));
          } else {
            setOverrides((prev) => {
              const next = { ...prev };
              delete next[itemId];
              return next;
            });
          }
        } else {
          setOverrides((prev) => {
            const next = { ...prev };
            delete next[itemId];
            return next;
          });
          router.refresh();
        }
      });
    },
    [projectId, router],
  );

  const onPointerDown = (
    e: React.PointerEvent,
    item: ScheduleWorkspaceItemDto,
    mode: "move" | "resize-end",
  ) => {
    if (!workspace.canEdit || pending) return;
    const f = getFeature(item);
    if (!f) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      itemId: item.id,
      mode,
      startX: e.clientX,
      origStart: f.startAt,
      origEnd: f.endAt,
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const deltaDays = Math.round((e.clientX - d.startX) / DAY_WIDTH);
    if (deltaDays === 0) return;

    let start = d.origStart;
    let end = d.origEnd;
    if (d.mode === "move") {
      start = addDaysUtc(d.origStart, deltaDays);
      end = addDaysUtc(d.origEnd, deltaDays);
    } else {
      end = addDaysUtc(d.origEnd, deltaDays);
      if (end < start) end = start;
    }
    setOverrides((prev) => ({ ...prev, [d.itemId]: { start, end } }));
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    dragRef.current = null;
    const deltaDays = Math.round((e.clientX - d.startX) / DAY_WIDTH);
    if (deltaDays === 0) {
      setOverrides((prev) => {
        const next = { ...prev };
        delete next[d.itemId];
        return next;
      });
      return;
    }

    let start = d.origStart;
    let end = d.origEnd;
    if (d.mode === "move") {
      start = addDaysUtc(d.origStart, deltaDays);
      end = addDaysUtc(d.origEnd, deltaDays);
    } else {
      end = addDaysUtc(d.origEnd, deltaDays);
      if (end < start) end = start;
    }
    const rollback = { start: d.origStart, end: d.origEnd };
    setOverrides((prev) => ({ ...prev, [d.itemId]: { start, end } }));
    persistDates(d.itemId, start, end, rollback);
  };

  const monthMarkers = useMemo(() => {
    const markers: { label: string; left: number }[] = [];
    let cur = new Date(range.min);
    while (cur <= range.max) {
      const offset = daysBetweenUtc(range.min, cur) - 1;
      markers.push({
        label: cur.toLocaleDateString("es-AR", { month: "short", year: "2-digit", timeZone: "UTC" }),
        left: offset * DAY_WIDTH,
      });
      cur = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 1));
    }
    return markers;
  }, [range]);

  const todayOffset = (() => {
    const t = new Date();
    const d = daysBetweenUtc(range.min, t) - 1;
    return d >= 0 && d <= range.totalDays ? d * DAY_WIDTH : null;
  })();

  const dependencyLines = useMemo(() => {
    const lines: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
    for (const item of items) {
      const succIdx = itemIndex.get(item.id);
      if (succIdx === undefined) continue;
      const succF = getFeature(item);
      if (!succF) continue;
      const y2 = succIdx * ROW_HEIGHT + ROW_HEIGHT / 2;
      const x2 = (daysBetweenUtc(range.min, succF.startAt) - 1) * DAY_WIDTH;

      for (const predId of item.predecessorIds) {
        const predIdx = itemIndex.get(predId);
        const pred = items.find((i) => i.id === predId);
        if (predIdx === undefined || !pred) continue;
        const predF = getFeature(pred);
        if (!predF) continue;
        const y1 = predIdx * ROW_HEIGHT + ROW_HEIGHT / 2;
        const x1 =
          (daysBetweenUtc(range.min, predF.startAt) - 1) * DAY_WIDTH +
          daysBetweenUtc(predF.startAt, predF.endAt) * DAY_WIDTH;
        lines.push({ x1, y1, x2, y2 });
      }
    }
    return lines;
  }, [items, itemIndex, getFeature, range.min]);

  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        Agregá tareas al cronograma para ver el Gantt.
      </p>
    );
  }

  const timelineWidth = range.totalDays * DAY_WIDTH;
  const noDatesCount = items.filter((i) => !getFeature(i)).length;

  return (
    <div className="space-y-2">
      {noDatesCount > 0 && (
        <p className="text-xs text-muted-foreground">
          {noDatesCount} ítem{noDatesCount > 1 ? "s" : ""} sin fechas (no aparecen en la línea de
          tiempo). Asigná fechas en el detalle o arrastrá tras definirlas.
        </p>
      )}
      <div
        className="overflow-auto rounded-md border max-h-[min(70vh,720px)]"
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        <div className="flex min-w-max">
          <div
            className="sticky left-0 z-20 shrink-0 border-r bg-background"
            style={{ width: LABEL_WIDTH }}
          >
            <div className="h-8 border-b bg-muted/50" />
            {items.map((item) => {
              const depth = depthMap.get(item.id) ?? 0;
              return (
                <div
                  key={item.id}
                  className="flex items-center border-b px-2 text-xs cursor-pointer hover:bg-muted/40"
                  style={{ height: ROW_HEIGHT, paddingLeft: 8 + depth * 12 }}
                  onClick={() => onSelect(item)}
                >
                  <span className="line-clamp-2">{item.name}</span>
                </div>
              );
            })}
          </div>
          <div className="relative" style={{ width: timelineWidth }}>
            <svg
              className="absolute inset-0 pointer-events-none z-[5]"
              width={timelineWidth}
              height={items.length * ROW_HEIGHT + 32}
            >
              {dependencyLines.map((l, i) => (
                <line
                  key={i}
                  x1={l.x1}
                  y1={l.y1 + 32}
                  x2={l.x2}
                  y2={l.y2 + 32}
                  stroke="currentColor"
                  strokeOpacity={0.25}
                  strokeWidth={1}
                />
              ))}
            </svg>
            <div className="relative h-8 border-b bg-muted/30">
              {monthMarkers.map((m) => (
                <span
                  key={m.left}
                  className="absolute top-1 text-[10px] text-muted-foreground"
                  style={{ left: m.left }}
                >
                  {m.label}
                </span>
              ))}
              {todayOffset != null && (
                <div
                  className="absolute top-0 bottom-0 w-px bg-primary z-10"
                  style={{ left: todayOffset }}
                />
              )}
            </div>
            {items.map((item) => {
              const f = getFeature(item);
              if (!f) {
                return (
                  <div key={item.id} className="border-b" style={{ height: ROW_HEIGHT }} />
                );
              }
              const startOff = daysBetweenUtc(range.min, f.startAt) - 1;
              const duration = daysBetweenUtc(f.startAt, f.endAt);
              const left = startOff * DAY_WIDTH;
              const width = Math.max(DAY_WIDTH, duration * DAY_WIDTH);
              const color = STATUS_COLORS[item.status] ?? "#64748b";
              const pct = Number(item.progressPct);
              const { plan, physical, certified } = scheduleProgressValues(item);
              const title = `Plan: ${plan}% · Físico: ${physical ?? "—"}% · Cert.: ${certified ?? "—"}%`;

              return (
                <div
                  key={item.id}
                  className="relative border-b"
                  style={{ height: ROW_HEIGHT }}
                >
                  <div
                    title={title}
                    className={cn(
                      "absolute top-1.5 flex h-6 items-center rounded text-[10px] text-white overflow-hidden",
                      workspace.canEdit && "cursor-grab active:cursor-grabbing",
                      overrides[item.id] && "ring-2 ring-primary/60",
                    )}
                    style={{
                      left,
                      width,
                      backgroundColor: color,
                      opacity: pending && !overrides[item.id] ? 0.7 : 1,
                    }}
                    onPointerDown={(e) => onPointerDown(e, item, "move")}
                    onClick={() => onSelect(item)}
                  >
                    <div
                      className="h-full bg-black/25"
                      style={{ width: `${Math.min(100, pct)}%` }}
                    />
                    <span className="absolute inset-0 truncate px-1 leading-6">
                      {pct}%
                    </span>
                    {workspace.canEdit && (
                      <div
                        className="absolute right-0 top-0 h-full w-2 cursor-ew-resize bg-black/20"
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          onPointerDown(e, item, "resize-end");
                        }}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
