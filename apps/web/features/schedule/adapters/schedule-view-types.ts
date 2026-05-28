import type { ScheduleWorkspaceItemDto } from "@bloqer/services";

/** Shapes aligned with Kibo UI Gantt/Calendar/Kanban feature props (adapter boundary). */
export type GanttFeature = {
  id: string;
  name: string;
  startAt: Date;
  endAt: Date;
  status: { id: string; name: string; color: string };
  lane?: string;
  groupId?: string | null;
};

export type CalendarFeature = {
  id: string;
  name: string;
  endAt: Date;
  status: { id: string; name: string; color: string };
};

export type KanbanCard = {
  id: string;
  name: string;
  column: string;
  startAt?: Date | null;
  endAt?: Date | null;
  badges: string[];
};

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

export function mapItemToGanttFeature(
  item: ScheduleWorkspaceItemDto,
  fallbackStart: Date,
  fallbackEnd: Date,
): GanttFeature | null {
  const startAt = parseItemDate(item.startDate, fallbackStart);
  const endAt = parseItemDate(item.endDate, fallbackEnd);
  if (endAt < startAt) return null;
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
    groupId: item.parentId,
  };
}

export function mapItemToCalendarFeature(
  item: ScheduleWorkspaceItemDto,
  fallback: Date,
): CalendarFeature | null {
  const endAt = parseItemDate(item.endDate ?? item.startDate, fallback);
  return {
    id: item.id,
    name: item.name,
    endAt,
    status: {
      id: item.status,
      name: STATUS_LABELS[item.status] ?? item.status,
      color: STATUS_COLORS[item.status] ?? "#64748b",
    },
  };
}

export function mapItemToKanbanCard(item: ScheduleWorkspaceItemDto): KanbanCard {
  const badges: string[] = [];
  if (item.daysLate) badges.push(`Atrasado ${item.daysLate}d`);
  if (item.metrics?.overBudget) badges.push("Sobre presupuesto");
  if (item.wbsLinks.length) badges.push(item.wbsLinks[0]!.wbsCode);
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
