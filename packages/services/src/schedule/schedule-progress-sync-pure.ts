import type { ScheduleItemStatus } from "@bloqer/database";

/** Pure helpers for D-045 sync — testable without Prisma. */
export function capSyncProgressPct(pct: number): number | null {
  if (pct <= 0 || pct > 100) return null;
  return Math.min(100, parseFloat(pct.toFixed(2)));
}

export function resolveScheduleStatusAfterProgressSync(
  current: ScheduleItemStatus,
  pct: number,
): ScheduleItemStatus {
  if (pct >= 100 && current === "IN_PROGRESS") return "COMPLETED";
  if (pct > 0 && current === "PLANNED") return "IN_PROGRESS";
  return current;
}
