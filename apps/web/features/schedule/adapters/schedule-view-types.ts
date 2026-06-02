import type { ScheduleWorkspaceItemDto } from "@bloqer/services";
import type { GanttFeature as KiboGanttFeature } from "@/components/kibo-ui/gantt";
import type { Feature as KiboCalendarFeature } from "@/components/kibo-ui/calendar";
import { formatDateAr } from "@/lib/gantt-date-format";

/** Adapter shapes aligned with Kibo UI Gantt/Calendar/Kanban (ADR-007). */
export type GanttFeature = KiboGanttFeature;
export type CalendarFeature = KiboCalendarFeature;

export type KanbanCard = {
  id: string;
  name: string;
  column: string;
  startAt?: Date | null;
  endAt?: Date | null;
  badges: string[];
};

export const CONTAINER_COLOR = "#475569";

const STATUS_COLORS: Record<string, string> = {
  PLANNED: "#94a3b8",
  IN_PROGRESS: "#3b82f6",
  BLOCKED: "#ef4444",
  COMPLETED: "#22c55e",
  CANCELLED: "#64748b",
};

const STATUS_LABELS: Record<string, string> = {
  PLANNED: "Planificado",
  IN_PROGRESS: "En curso",
  BLOCKED: "Bloqueado",
  COMPLETED: "Hecho",
  CANCELLED: "Cancelado",
};

function parseItemDate(iso: string | null, fallback: Date): Date {
  if (!iso) return fallback;
  return new Date(`${iso}T12:00:00.000Z`);
}

export function scheduleItemHasActiveChildren(
  items: ScheduleWorkspaceItemDto[],
  itemId: string,
): boolean {
  return items.some((i) => i.parentId === itemId && i.status !== "CANCELLED");
}

export function scheduleItemTreeDepth(
  items: ScheduleWorkspaceItemDto[],
  itemId: string,
): number {
  const byId = new Map(items.map((i) => [i.id, i]));
  let depth = 0;
  let current = byId.get(itemId);
  while (current?.parentId) {
    depth += 1;
    current = byId.get(current.parentId);
  }
  return depth;
}

export function countScheduleItemsWithoutDates(items: ScheduleWorkspaceItemDto[]): {
  containersWithoutDates: number;
  leavesWithoutDates: number;
} {
  let containersWithoutDates = 0;
  let leavesWithoutDates = 0;

  for (const item of items) {
    if (item.status === "CANCELLED") continue;
    const hasDates = Boolean(item.startDate && item.endDate);
    if (hasDates) continue;

    if (scheduleItemHasActiveChildren(items, item.id)) {
      containersWithoutDates += 1;
    } else {
      leavesWithoutDates += 1;
    }
  }

  return { containersWithoutDates, leavesWithoutDates };
}

export function mapItemToGanttFeature(
  item: ScheduleWorkspaceItemDto,
  fallbackStart: Date,
  fallbackEnd: Date,
  isSummary = false,
): GanttFeature | null {
  if (item.type === "MILESTONE") {
    const dateIso = item.endDate ?? item.startDate;
    if (!dateIso) return null;
    const d = parseItemDate(dateIso, fallbackStart);
    const startAt = d;
    const endAt = d;
    return {
      id: item.id,
      name: item.name,
      startAt,
      endAt,
      status: {
        id: item.status,
        name: STATUS_LABELS[item.status] ?? item.status,
        color: STATUS_COLORS[item.status] ?? "#64748b",
      },
      lane: item.parentId ?? undefined,
    };
  }
  if (!item.startDate || !item.endDate) return null;
  const startAt = parseItemDate(item.startDate, fallbackStart);
  const endAt = parseItemDate(item.endDate, fallbackEnd);
  if (endAt < startAt) return null;
  return {
    id: item.id,
    name: item.name,
    startAt,
    endAt,
    status: {
      id: isSummary ? "SUMMARY" : item.status,
      name: isSummary ? "Contenedor" : (STATUS_LABELS[item.status] ?? item.status),
      color: isSummary ? CONTAINER_COLOR : (STATUS_COLORS[item.status] ?? "#64748b"),
    },
    lane: item.parentId ?? undefined,
  };
}

export function mapItemToCalendarFeature(
  item: ScheduleWorkspaceItemDto,
  fallback: Date,
): CalendarFeature | null {
  const dateIso = item.endDate ?? item.startDate;
  if (!dateIso) return null;
  const endAt = parseItemDate(dateIso, fallback);
  const startAt = item.startDate ? parseItemDate(item.startDate, fallback) : endAt;
  return {
    id: item.id,
    name: item.name,
    startAt,
    endAt,
    status: {
      id: item.status,
      name: STATUS_LABELS[item.status] ?? item.status,
      color: STATUS_COLORS[item.status] ?? "#64748b",
    },
  };
}

export type ScheduleGanttEntry = {
  item: ScheduleWorkspaceItemDto;
  feature: GanttFeature;
};

export function mapScheduleItemsToGanttEntries(
  items: ScheduleWorkspaceItemDto[],
  fallbackStart: Date,
  fallbackEnd: Date,
): ScheduleGanttEntry[] {
  const entries: ScheduleGanttEntry[] = [];
  for (const item of items) {
    const isSummary = scheduleItemHasActiveChildren(items, item.id);
    const feature = mapItemToGanttFeature(item, fallbackStart, fallbackEnd, isSummary);
    if (feature) entries.push({ item, feature });
  }
  return entries;
}

export function mapScheduleItemsToCalendarFeatures(
  items: ScheduleWorkspaceItemDto[],
  fallback: Date,
): CalendarFeature[] {
  return items
    .map((item) => mapItemToCalendarFeature(item, fallback))
    .filter((f): f is CalendarFeature => f != null);
}

export function primaryWbsLink(item: ScheduleWorkspaceItemDto) {
  return item.wbsLinks.find((l) => l.isPrimary) ?? item.wbsLinks[0] ?? null;
}

export function mapItemToKanbanCard(item: ScheduleWorkspaceItemDto): KanbanCard {
  const badges: string[] = [];
  if (item.startDate && item.endDate) {
    badges.push(`${formatDateAr(item.startDate)} → ${formatDateAr(item.endDate)}`);
  }
  if (item.daysLate) badges.push(`Atrasado ${item.daysLate}d`);
  if (item.metrics?.overBudget) badges.push("Sobre presupuesto");
  const primary = primaryWbsLink(item);
  if (primary) badges.push(primary.wbsCode);
  return {
    id: item.id,
    name: item.name,
    column: item.status,
    startAt: item.startDate ? parseItemDate(item.startDate, new Date()) : null,
    endAt: item.endDate ? parseItemDate(item.endDate, new Date()) : null,
    badges,
  };
}

export { STATUS_LABELS, STATUS_COLORS };
