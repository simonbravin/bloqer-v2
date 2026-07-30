/** Calendar date as YYYY-MM-DD in UTC (matches server `formatDateOnly` / noon UTC dates). */
export function toUtcDateOnlyString(value: Date): string {
  const y = value.getUTCFullYear();
  const m = String(value.getUTCMonth() + 1).padStart(2, "0");
  const d = String(value.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Calendar day from local Y/M/D — use when the Date was built with local timeline math
 * (e.g. Gantt mouse position), so TZ offsets do not shift the persisted day.
 */
export function toLocalDateOnlyString(value: Date): string {
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, "0");
  const d = String(value.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Format a Date (or ISO string) for `<input type="date">` (YYYY-MM-DD). */
export function toDateInput(value: Date | string | null | undefined): string {
  if (value == null) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().split("T")[0]!;
}
