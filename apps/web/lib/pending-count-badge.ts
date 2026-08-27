/** Compact overlay (bottom nav icon) vs sidebar/list row. */
export type PendingBadgeDensity = "compact" | "sidebar";

export function formatPendingBadgeLabel(
  count: number,
  density: PendingBadgeDensity = "sidebar",
): string | null {
  if (!Number.isFinite(count) || count <= 0) return null;
  const n = Math.trunc(count);
  if (n <= 0) return null;
  const cap = density === "compact" ? 9 : 99;
  return n > cap ? `${cap}+` : String(n);
}

export function pendingCountAriaLabel(count: number, itemLabel = "Pendientes"): string {
  if (!Number.isFinite(count) || count <= 0) return itemLabel;
  const n = Math.trunc(count);
  const qty = n === 1 ? "1 pendiente" : `${n} pendientes`;
  return `${itemLabel}, ${qty}`;
}
