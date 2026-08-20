import type { ScheduleItemStatus } from "@bloqer/database";
import { productWeekMondaySundayBounds, toIsoDateInTimeZone } from "@bloqer/utils";

/**
 * Field cronograma filters. Deep-link query: `?field=today|week|delayed|in_progress|blocked|completed|all`.
 * Alias: `field=day` → today.
 */
export type ScheduleFieldFilterId =
  | "today"
  | "week"
  | "delayed"
  | "in_progress"
  | "blocked"
  | "completed"
  | "all";

export const SCHEDULE_FIELD_FILTER_IDS: ScheduleFieldFilterId[] = [
  "today",
  "week",
  "delayed",
  "in_progress",
  "blocked",
  "completed",
  "all",
];

export const SCHEDULE_FIELD_LIST_LIMIT = 200;

export type ScheduleFieldDateItem = {
  id: string;
  parentId: string | null;
  name: string;
  type: string;
  status: ScheduleItemStatus | string;
  startDate: string | null;
  endDate: string | null;
  daysLate: number | null;
  wbsLinks?: Array<{ wbsCode: string; wbsName: string }>;
};

export type ScheduleFieldWindow = {
  todayIso: string;
  weekStart: string;
  weekEnd: string;
};

/** Product-TZ calendar window for Field Hoy / Esta semana. */
export function scheduleFieldWindow(now: Date = new Date()): ScheduleFieldWindow {
  const { weekStart, weekEnd } = productWeekMondaySundayBounds(now);
  return {
    todayIso: toIsoDateInTimeZone(now),
    weekStart,
    weekEnd,
  };
}

export function parseScheduleFieldFilter(
  raw: string | null | undefined,
): ScheduleFieldFilterId | null {
  if (!raw) return null;
  const value = raw.trim().toLowerCase();
  if (value === "day") return "today";
  if (SCHEDULE_FIELD_FILTER_IDS.includes(value as ScheduleFieldFilterId)) {
    return value as ScheduleFieldFilterId;
  }
  return null;
}

/**
 * Inclusive YYYY-MM-DD overlap. Missing bound collapses to the other date (milestones).
 * Compares ISO date strings — never `new Date("YYYY-MM-DD")`.
 */
export function calendarRangeOverlapsIsoDay(
  startDate: string | null,
  endDate: string | null,
  dayIso: string,
): boolean {
  const start = startDate ?? endDate;
  const end = endDate ?? startDate;
  if (!start || !end) return false;
  return start <= dayIso && dayIso <= end;
}

/** Inclusive overlap of [start,end] with [rangeStart, rangeEnd] (YYYY-MM-DD). */
export function calendarRangeOverlapsIsoRange(
  startDate: string | null,
  endDate: string | null,
  rangeStart: string,
  rangeEnd: string,
): boolean {
  const start = startDate ?? endDate;
  const end = endDate ?? startDate;
  if (!start || !end) return false;
  return start <= rangeEnd && end >= rangeStart;
}

export function isScheduleFieldDelayed(item: Pick<ScheduleFieldDateItem, "daysLate">): boolean {
  return item.daysLate != null;
}

function isCancelled(status: string): boolean {
  return status === "CANCELLED";
}

export function scheduleFieldLeaves<T extends ScheduleFieldDateItem>(items: T[]): T[] {
  return items.filter(
    (item) =>
      !isCancelled(item.status) &&
      !items.some((row) => row.parentId === item.id && row.status !== "CANCELLED"),
  );
}

export function itemMatchesScheduleFieldFilter(
  item: ScheduleFieldDateItem,
  filter: ScheduleFieldFilterId,
  window: ScheduleFieldWindow,
): boolean {
  if (isCancelled(item.status)) return false;
  switch (filter) {
    case "today":
      return calendarRangeOverlapsIsoDay(item.startDate, item.endDate, window.todayIso);
    case "week":
      return calendarRangeOverlapsIsoRange(
        item.startDate,
        item.endDate,
        window.weekStart,
        window.weekEnd,
      );
    case "delayed":
      return isScheduleFieldDelayed(item);
    case "in_progress":
      return item.status === "IN_PROGRESS";
    case "blocked":
      return item.status === "BLOCKED";
    case "completed":
      return item.status === "COMPLETED";
    case "all":
      return true;
  }
}

function compareIsoDateAsc(a: string | null, b: string | null): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a.localeCompare(b);
}

function todayRank(item: ScheduleFieldDateItem): number {
  if (item.status === "BLOCKED") return 0;
  if (isScheduleFieldDelayed(item)) return 1;
  if (item.status === "IN_PROGRESS") return 2;
  return 3;
}

function compareByStartThenEndThenName(a: ScheduleFieldDateItem, b: ScheduleFieldDateItem): number {
  return (
    compareIsoDateAsc(a.startDate, b.startDate) ||
    compareIsoDateAsc(a.endDate, b.endDate) ||
    a.name.localeCompare(b.name, "es")
  );
}

export function compareScheduleFieldItems(
  a: ScheduleFieldDateItem,
  b: ScheduleFieldDateItem,
  filter: ScheduleFieldFilterId,
): number {
  if (filter === "today") {
    return todayRank(a) - todayRank(b) || compareByStartThenEndThenName(a, b);
  }
  if (filter === "delayed") {
    const lateA = a.daysLate ?? 0;
    const lateB = b.daysLate ?? 0;
    return lateB - lateA || compareIsoDateAsc(a.endDate, b.endDate) || a.name.localeCompare(b.name, "es");
  }
  return compareByStartThenEndThenName(a, b);
}

export function matchesScheduleFieldSearch(
  item: ScheduleFieldDateItem,
  query: string,
): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  if (item.name.toLowerCase().includes(needle)) return true;
  return (item.wbsLinks ?? []).some(
    (link) =>
      link.wbsCode.toLowerCase().includes(needle) ||
      link.wbsName.toLowerCase().includes(needle),
  );
}

export type ScheduleFieldKpis = {
  inProgress: number;
  delayed: number;
  blocked: number;
  completed: number;
};

/** Leaf KPIs. `delayed` uses the same `daysLate` as workspace (`computeDaysLate`). */
export function summarizeScheduleFieldKpis<T extends ScheduleFieldDateItem>(
  items: T[],
): ScheduleFieldKpis {
  const leaves = scheduleFieldLeaves(items);
  let inProgress = 0;
  let delayed = 0;
  let blocked = 0;
  let completed = 0;
  for (const item of leaves) {
    if (item.status === "IN_PROGRESS") inProgress += 1;
    if (item.status === "BLOCKED") blocked += 1;
    if (item.status === "COMPLETED") completed += 1;
    if (isScheduleFieldDelayed(item)) delayed += 1;
  }
  return { inProgress, delayed, blocked, completed };
}

export function filterAndSortScheduleFieldItems<T extends ScheduleFieldDateItem>(
  items: T[],
  filter: ScheduleFieldFilterId,
  window: ScheduleFieldWindow,
  search = "",
): T[] {
  const leaves = scheduleFieldLeaves(items);
  return leaves
    .filter((item) => itemMatchesScheduleFieldFilter(item, filter, window))
    .filter((item) => matchesScheduleFieldSearch(item, search))
    .sort((a, b) => compareScheduleFieldItems(a, b, filter));
}

/**
 * Display cap for Field cards. Always call **after** `filterAndSortScheduleFieldItems`
 * so Hoy / Semana / Atrasadas never drop a matching leaf that sits past position 200
 * of the unfiltered list.
 */
export function limitScheduleFieldItems<T>(
  filteredSorted: T[],
  limit = SCHEDULE_FIELD_LIST_LIMIT,
): { visible: T[]; truncated: boolean; matchedCount: number } {
  return {
    visible: filteredSorted.slice(0, limit),
    truncated: filteredSorted.length > limit,
    matchedCount: filteredSorted.length,
  };
}

export type ScheduleFieldStatusAction = "IN_PROGRESS" | "COMPLETED" | "BLOCKED";

export function scheduleFieldStatusActions(
  status: ScheduleItemStatus | string,
): ScheduleFieldStatusAction[] {
  if (status === "PLANNED") return ["IN_PROGRESS", "BLOCKED"];
  if (status === "IN_PROGRESS") return ["COMPLETED", "BLOCKED"];
  if (status === "BLOCKED") return ["IN_PROGRESS"];
  return [];
}
