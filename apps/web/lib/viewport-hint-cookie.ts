/** Convenience only — never authorization. Tailwind breakpoints. */
export const VIEWPORT_COOKIE = "bloqer-viewport";
export const VIEWPORT_MD_QUERY = "(min-width: 768px)";
export const VIEWPORT_LG_QUERY = "(min-width: 1024px)";

export type ViewportHint = "sm" | "md" | "lg";

const MAX_AGE = 60 * 60 * 24 * 180;

export function parseViewportHint(value: string | null | undefined): ViewportHint | null {
  return value === "sm" || value === "md" || value === "lg" ? value : null;
}

export function readViewportHintFromDocument(): ViewportHint | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${VIEWPORT_COOKIE}=([^;]*)`));
  const raw = match?.[1] ? decodeURIComponent(match[1]) : null;
  return parseViewportHint(raw);
}

export function writeViewportHintCookie(hint: ViewportHint): void {
  if (typeof document === "undefined") return;
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${VIEWPORT_COOKIE}=${hint}; Path=/; Max-Age=${MAX_AGE}; SameSite=Lax${secure}`;
}

/** Dashboard desktop tree: `md` (≥768) and `lg` (≥1024). Missing cookie → both trees. */
export function isDesktopDashboardViewport(hint: ViewportHint | null): boolean {
  return hint === "md" || hint === "lg";
}

/**
 * Cronograma Field vs Gantt. Threshold is Tailwind `lg` (1024).
 * Missing cookie defaults to Field so the first mobile visit does not pay Gantt/cost-control.
 */
export function isScheduleFieldViewport(hint: ViewportHint | null): boolean {
  return hint !== "lg";
}

export function viewportHintFromMatchMedia(mdMatches: boolean, lgMatches: boolean): ViewportHint {
  if (lgMatches) return "lg";
  if (mdMatches) return "md";
  return "sm";
}
