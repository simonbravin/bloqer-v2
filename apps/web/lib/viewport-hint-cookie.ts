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
  if (!match?.[1]) return null;
  try {
    return parseViewportHint(decodeURIComponent(match[1]));
  } catch {
    return null;
  }
}

export function writeViewportHintCookie(hint: ViewportHint): void {
  if (typeof document === "undefined") return;
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${VIEWPORT_COOKIE}=${hint}; Path=/; Max-Age=${MAX_AGE}; SameSite=Lax${secure}`;
}

/** Dashboard desktop tree: `md` (≥768) and `lg` (≥1024). Missing cookie → Field. */
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

/** Same `lg` threshold as Cronograma Field. 768 uses cards; 1440 keeps the desktop table. */
export function isMaterialsFieldViewport(hint: ViewportHint | null): boolean {
  return isScheduleFieldViewport(hint);
}

/** Same `lg` threshold as Cronograma/Materiales. 768 uses CxP cards. */
export function isPayablesFieldViewport(hint: ViewportHint | null): boolean {
  return isScheduleFieldViewport(hint);
}

/** Same `lg` threshold as Cronograma/Materiales/CxP. 768 uses CxC cards. */
export function isReceivablesFieldViewport(hint: ViewportHint | null): boolean {
  return isScheduleFieldViewport(hint);
}

const LG_WORKSPACE_ROUTES = /^\/(?:proyectos\/[^/]+\/(?:cronograma|materiales|mano-obra|equipos|cuentas-por-pagar|cuentas-por-cobrar)|finanzas\/(?:cuentas-por-pagar|cuentas-por-cobrar))(?:\/|$)/;

/** On direct entry, refresh only if the cookie switches the selected RSC view. */
export function shouldRefreshForViewport(
  pathname: string,
  previous: ViewportHint | null,
  next: ViewportHint,
): boolean {
  if (previous === next) return false;
  if (pathname === "/dashboard") {
    return isDesktopDashboardViewport(previous) !== isDesktopDashboardViewport(next);
  }
  if (LG_WORKSPACE_ROUTES.test(pathname)) {
    return isScheduleFieldViewport(previous) !== isScheduleFieldViewport(next);
  }
  // Preserve cache invalidation when resizing away from viewport-aware routes.
  return previous !== null;
}

export function viewportHintFromMatchMedia(mdMatches: boolean, lgMatches: boolean): ViewportHint {
  if (lgMatches) return "lg";
  if (mdMatches) return "md";
  return "sm";
}
