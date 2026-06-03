import { Prisma } from "@bloqer/database";
import type { ScheduleItemStatus } from "@bloqer/database";
import { ServiceError } from "../types";

const MS_PER_DAY = 86_400_000;

export type RollupScheduleItemInput = {
  id: string;
  parentId: string | null;
  status: ScheduleItemStatus;
  startDate: Date | null;
  endDate: Date | null;
};

export type ContainerRollupDates = {
  startDate: Date;
  endDate: Date;
  durationDays: number;
};

/** True when the item has at least one non-CANCELLED child. */
export function scheduleItemHasActiveChildren(
  items: Array<{ id: string; parentId: string | null; status: ScheduleItemStatus | string }>,
  itemId: string,
): boolean {
  return items.some((i) => i.parentId === itemId && i.status !== "CANCELLED");
}

/** Leaf = no active (non-CANCELLED) children. Used for KPI avance/atraso. */
export function isScheduleLeafItem(
  items: Array<{ id: string; parentId: string | null; status: ScheduleItemStatus | string }>,
  itemId: string,
): boolean {
  return !scheduleItemHasActiveChildren(items, itemId);
}

/** Had child rows but none active — former summary task with possibly stale rollup dates. */
export function isFormerScheduleContainer(
  items: Array<{ id: string; parentId: string | null; status: ScheduleItemStatus | string }>,
  itemId: string,
): boolean {
  if (scheduleItemHasActiveChildren(items, itemId)) return false;
  return items.some((i) => i.parentId === itemId);
}

function collectLeafDatesUnder(
  items: RollupScheduleItemInput[],
  nodeId: string,
): Array<{ startDate: Date; endDate: Date }> {
  const node = items.find((i) => i.id === nodeId);
  if (!node || node.status === "CANCELLED") return [];

  const activeChildren = items.filter(
    (i) => i.parentId === nodeId && i.status !== "CANCELLED",
  );

  if (activeChildren.length === 0) {
    if (node.startDate && node.endDate) {
      return [{ startDate: node.startDate, endDate: node.endDate }];
    }
    return [];
  }

  return activeChildren.flatMap((child) => collectLeafDatesUnder(items, child.id));
}

/** Bottom-up rollup: container dates = min/max of leaf descendant dates (excludes CANCELLED). */
export function computeContainerRollup(
  items: RollupScheduleItemInput[],
): Map<string, ContainerRollupDates | null> {
  const result = new Map<string, ContainerRollupDates | null>();
  const containerIds = items
    .filter((i) => scheduleItemHasActiveChildren(items, i.id))
    .map((i) => i.id);

  const depthOf = (id: string): number => {
    let depth = 0;
    let current = items.find((i) => i.id === id);
    while (current?.parentId) {
      depth += 1;
      current = items.find((i) => i.id === current!.parentId);
    }
    return depth;
  };

  const sorted = [...containerIds].sort((a, b) => depthOf(b) - depthOf(a));

  for (const containerId of sorted) {
    const activeChildren = items.filter(
      (i) => i.parentId === containerId && i.status !== "CANCELLED",
    );
    const leafDates = activeChildren.flatMap((child) =>
      collectLeafDatesUnder(items, child.id),
    );

    if (leafDates.length === 0) {
      result.set(containerId, null);
      continue;
    }

    let minStart = leafDates[0]!.startDate;
    let maxEnd = leafDates[0]!.endDate;
    for (const { startDate, endDate } of leafDates) {
      if (dateOnlyUtcMs(startDate) < dateOnlyUtcMs(minStart)) minStart = startDate;
      if (dateOnlyUtcMs(endDate) > dateOnlyUtcMs(maxEnd)) maxEnd = endDate;
    }

    result.set(containerId, {
      startDate: minStart,
      endDate: maxEnd,
      durationDays: daysBetween(minStart, maxEnd),
    });
  }

  return result;
}

export function dateOnlyUtcMs(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export function datesEqualOnDay(a: Date | null | undefined, b: Date | null | undefined): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return dateOnlyUtcMs(a) === dateOnlyUtcMs(b);
}

/** Overlay derived container dates on workspace DTOs (containers are read-time derived). */
export function mergeDerivedContainerDatesIntoDtos<
  T extends {
    id: string;
    parentId: string | null;
    status: ScheduleItemStatus;
    startDate: string | null;
    endDate: string | null;
    durationDays: number | null;
    timePlanPct: string | null;
  },
>(
  dtoItems: T[],
  sourceItems: RollupScheduleItemInput[],
): T[] {
  const rollup = computeContainerRollup(sourceItems);
  const dtoById = new Map(dtoItems.map((d) => [d.id, d]));

  for (const [containerId, derived] of rollup) {
    const dto = dtoById.get(containerId);
    if (!dto) continue;
    if (!derived) {
      dto.startDate = null;
      dto.endDate = null;
      dto.durationDays = null;
      dto.timePlanPct = null;
      continue;
    }
    dto.startDate = formatDateOnly(derived.startDate);
    dto.endDate = formatDateOnly(derived.endDate);
    dto.durationDays = derived.durationDays;
    dto.timePlanPct = computeTimePlanProgressPct(dto.startDate, dto.endDate);
  }

  for (const source of sourceItems) {
    if (source.status === "CANCELLED") continue;
    if (!isFormerScheduleContainer(sourceItems, source.id)) continue;
    const dto = dtoById.get(source.id);
    if (!dto) continue;
    dto.startDate = null;
    dto.endDate = null;
    dto.durationDays = null;
    dto.timePlanPct = null;
  }

  return dtoItems;
}

export function parseDateOnly(iso: string): Date {
  const d = new Date(`${iso}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) {
    throw new ServiceError("VALIDATION", "Fecha inválida");
  }
  return d;
}

export function formatDateOnly(d: Date | null | undefined): string | null {
  if (!d) return null;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function daysBetween(start: Date, end: Date): number {
  const a = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const b = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  return Math.max(1, Math.round((b - a) / MS_PER_DAY) + 1);
}

export function addDays(date: Date, days: number): Date {
  const out = new Date(date);
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

/** Detect cycle if adding edge predecessor → successor. */
export function wouldCreateDependencyCycle(
  edges: Array<{ predecessorId: string; successorId: string }>,
  predecessorId: string,
  successorId: string,
): boolean {
  if (predecessorId === successorId) return true;
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    const list = adj.get(e.predecessorId) ?? [];
    list.push(e.successorId);
    adj.set(e.predecessorId, list);
  }
  const list = adj.get(predecessorId) ?? [];
  list.push(successorId);
  adj.set(predecessorId, list);

  const visited = new Set<string>();
  const stack = [successorId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (id === predecessorId) return true;
    if (visited.has(id)) continue;
    visited.add(id);
    for (const next of adj.get(id) ?? []) stack.push(next);
  }
  return false;
}

const ALLOWED: Record<ScheduleItemStatus, ScheduleItemStatus[]> = {
  PLANNED: ["IN_PROGRESS", "BLOCKED", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "BLOCKED", "CANCELLED"],
  BLOCKED: ["IN_PROGRESS", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

export function assertScheduleStatusTransition(
  from: ScheduleItemStatus,
  to: ScheduleItemStatus,
): void {
  const next = ALLOWED[from];
  if (!next?.includes(to)) {
    throw new ServiceError(
      "VALIDATION",
      `Transición de estado no permitida: ${from} → ${to}`,
    );
  }
}

export function computeDaysLate(endDate: Date | null, status: ScheduleItemStatus): number | null {
  if (!endDate || status === "COMPLETED" || status === "CANCELLED") return null;
  const today = new Date();
  const end = Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate());
  const now = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const diff = Math.floor((now - end) / MS_PER_DAY);
  return diff > 0 ? diff : null;
}

/** Elapsed calendar % between start and end (plan esperado a la fecha). */
export function computeTimePlanProgressPct(
  startDate: string | null,
  endDate: string | null,
): string | null {
  if (!startDate || !endDate) return null;
  const start = parseDateOnly(startDate);
  const end = parseDateOnly(endDate);
  const today = new Date();
  const t0 = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const t1 = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  const now = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const total = t1 - t0;
  if (total <= 0) return now >= t1 ? "100.00" : "0.00";
  if (now <= t0) return "0.00";
  if (now >= t1) return "100.00";
  return new Prisma.Decimal(now - t0).div(total).mul(100).toFixed(2);
}

export const ZERO_DEC = new Prisma.Decimal(0);

export type FinishStartCheckItem = {
  id: string;
  name: string;
  startDate: Date | null;
  endDate: Date | null;
};

/** Non-blocking warnings when dates break Finish-to-Start (FS) dependencies. */
export function checkFinishStartViolations(
  item: FinishStartCheckItem,
  predecessors: FinishStartCheckItem[],
  successors: FinishStartCheckItem[],
): string[] {
  const warnings: string[] = [];
  const itemStart = item.startDate;
  const itemEnd = item.endDate;

  for (const pred of predecessors) {
    if (!pred.endDate || !itemStart) continue;
    const pEnd = pred.endDate.getTime();
    const sStart = itemStart.getTime();
    if (sStart < pEnd) {
      warnings.push(
        `Dependencia FS: el inicio de esta tarea es anterior al fin de «${pred.name}».`,
      );
    }
  }

  for (const succ of successors) {
    if (!itemEnd || !succ.startDate) continue;
    if (succ.startDate.getTime() < itemEnd.getTime()) {
      warnings.push(
        `Dependencia FS: «${succ.name}» inicia antes del fin de esta tarea.`,
      );
    }
  }

  return warnings;
}
