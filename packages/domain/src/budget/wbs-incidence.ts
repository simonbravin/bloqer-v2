/**
 * WBS incidence (% of project total) for EDT / export ([D-060]).
 * Always uses rolled-up row totals (never unit prices).
 */

export function wbsIncidencePercent(part: number, whole: number): number | null {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return null;
  return (part / whole) * 100;
}

/** UI string es-AR (comma decimal); null → em dash. */
export function formatWbsIncidencePercent(pct: number | null): string {
  if (pct == null || !Number.isFinite(pct)) return "—";
  return `${pct.toFixed(2).replace(".", ",")}%`;
}

/** Export/CSV string — same decimal convention as money columns (dot). */
export function formatWbsIncidencePercentExport(pct: number | null): string {
  if (pct == null || !Number.isFinite(pct)) return "";
  return `${pct.toFixed(2)}%`;
}
