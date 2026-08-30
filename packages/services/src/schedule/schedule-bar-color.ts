/**
 * Pure bar-color decision for schedule Gantt ([D-103]/[D-104]).
 * Kept in services so it can be unit-tested without pulling React.
 */

export const SCHEDULE_BAR_COLORS = {
  container: "#475569",
  milestone: "#7c3aed",
  milestoneLate: "#ef4444",
  milestoneDone: "#16a34a",
  taskLate: "#ef4444",
  status: {
    PLANNED: "#94a3b8",
    IN_PROGRESS: "#3b82f6",
    BLOCKED: "#ef4444",
    COMPLETED: "#22c55e",
    CANCELLED: "#64748b",
  } as Record<string, string>,
} as const;

export function resolveScheduleItemBarColor(
  item: { type: string; status: string; daysLate: number | null },
  isSummary = false,
): string {
  if (isSummary) return SCHEDULE_BAR_COLORS.container;
  if (item.type === "MILESTONE") {
    if (item.status === "COMPLETED") return SCHEDULE_BAR_COLORS.milestoneDone;
    if (item.daysLate != null) return SCHEDULE_BAR_COLORS.milestoneLate;
    return SCHEDULE_BAR_COLORS.milestone;
  }
  if (item.daysLate != null) return SCHEDULE_BAR_COLORS.taskLate;
  return SCHEDULE_BAR_COLORS.status[item.status] ?? "#64748b";
}
