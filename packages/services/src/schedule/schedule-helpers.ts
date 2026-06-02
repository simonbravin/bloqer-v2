import { Prisma } from "@bloqer/database";
import type { ScheduleItemStatus } from "@bloqer/database";
import { ServiceError } from "../types";

const MS_PER_DAY = 86_400_000;

export function parseDateOnly(iso: string): Date {
  const d = new Date(`${iso}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) {
    throw new ServiceError("VALIDATION", "Fecha inválida");
  }
  return d;
}

export function formatDateOnly(d: Date | null | undefined): string | null {
  if (!d) return null;
  return d.toISOString().slice(0, 10);
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
