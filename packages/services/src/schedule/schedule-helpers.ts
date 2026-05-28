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

export const ZERO_DEC = new Prisma.Decimal(0);
