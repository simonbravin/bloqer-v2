/** Format a Date (or ISO string) for `<input type="date">` (YYYY-MM-DD). */
export function toDateInput(value: Date | string | null | undefined): string {
  if (value == null) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().split("T")[0]!;
}
