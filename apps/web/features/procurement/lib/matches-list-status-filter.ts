/**
 * Default list chip ("Activas"): hide CANCELLED.
 * Explicit status chip: exact match only.
 */
export function matchesListStatusFilter(
  itemStatus: string,
  selected: string | null,
): boolean {
  if (selected) return itemStatus === selected;
  return itemStatus !== "CANCELLED";
}

/** Count of rows that would show under the Activas chip. */
export function countActiveListStatuses(statuses: readonly string[]): number {
  return statuses.filter((s) => s !== "CANCELLED").length;
}
