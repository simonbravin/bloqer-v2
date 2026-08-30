import type { ScheduleWorkspaceItemDto } from "@bloqer/services";
import {
  resolveScheduleItemBarColor,
  SCHEDULE_BAR_COLORS,
} from "@bloqer/services/schedule-bar-color";
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

export const CONTAINER_COLOR = SCHEDULE_BAR_COLORS.container;
/** D-103 — fixed milestone color (not status-driven). */
export const MILESTONE_COLOR = SCHEDULE_BAR_COLORS.milestone;
export const MILESTONE_LATE_COLOR = SCHEDULE_BAR_COLORS.milestoneLate;
export const MILESTONE_DONE_COLOR = SCHEDULE_BAR_COLORS.milestoneDone;
/** D-104 — late TASK bars use the same danger color as late milestones. */
export const TASK_LATE_COLOR = SCHEDULE_BAR_COLORS.taskLate;

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

    if (!item.isLeaf) {
      containersWithoutDates += 1;
    } else {
      leavesWithoutDates += 1;
    }
  }

  return { containersWithoutDates, leavesWithoutDates };
}

export function scheduleItemBarColor(
  item: Pick<ScheduleWorkspaceItemDto, "type" | "status" | "daysLate">,
  isSummary = false,
): string {
  return resolveScheduleItemBarColor(item, isSummary);
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
        color: scheduleItemBarColor(item, false),
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
      color: scheduleItemBarColor(item, isSummary),
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
      color: scheduleItemBarColor(item),
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
    const isSummary = !item.isLeaf;
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
    .filter((item) => item.isLeaf)
    .map((item) => mapItemToCalendarFeature(item, fallback))
    .filter((f): f is CalendarFeature => f != null);
}

export function primaryWbsLink(item: {
  wbsLinks: Array<{ isPrimary: boolean; wbsCode: string; wbsName: string }>;
}) {
  return item.wbsLinks.find((l) => l.isPrimary) ?? null;
}

/** True when a leaf has no primary EDT — blocks Real sync (BR-SCH-004). */
export function hasPrimaryWbsLink(item: ScheduleWorkspaceItemDto): boolean {
  return item.wbsLinks.some((l) => l.isPrimary);
}

/**
 * When no status filter is active, hide CANCELLED so all views match.
 * When status=CANCELLED (or any status), server already scoped the list.
 */
export function filterScheduleItemsForDisplay(
  items: ScheduleWorkspaceItemDto[],
  statusFilter: string | null,
): ScheduleWorkspaceItemDto[] {
  if (statusFilter) return items;
  return items.filter((i) => i.status !== "CANCELLED");
}

export function mapItemToKanbanCard(item: ScheduleWorkspaceItemDto): KanbanCard {
  const badges: string[] = [];
  if (item.startDate && item.endDate) {
    badges.push(`${formatDateAr(item.startDate)} → ${formatDateAr(item.endDate)}`);
  }
  if (item.daysLate) badges.push(`Atrasado ${item.daysLate}d`);
  if (item.metrics?.overBudget) badges.push("Sobre presupuesto");
  if (item.metrics?.committedCost && item.metrics.committedCost !== "0.00" && !item.metrics.committedCost.startsWith("-")) {
    badges.push("Con compras");
  }
  const primary = primaryWbsLink(item);
  if (primary) badges.push(primary.wbsCode);
  else if (!hasPrimaryWbsLink(item)) badges.push("Sin EDT");
  return {
    id: item.id,
    name: item.name,
    column: item.status,
    startAt: item.startDate ? parseItemDate(item.startDate, new Date()) : null,
    endAt: item.endDate ? parseItemDate(item.endDate, new Date()) : null,
    badges,
  };
}

export { STATUS_LABELS };
export const STATUS_COLORS = SCHEDULE_BAR_COLORS.status;
