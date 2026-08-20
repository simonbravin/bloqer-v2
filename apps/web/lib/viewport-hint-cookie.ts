/** Convenience only — never authorization. Tailwind `md` breakpoint. */
export const VIEWPORT_COOKIE = "bloqer-viewport";
export const VIEWPORT_MD_QUERY = "(min-width: 768px)";

export type ViewportHint = "sm" | "md";

const MAX_AGE = 60 * 60 * 24 * 180;

export function parseViewportHint(value: string | null | undefined): ViewportHint | null {
  return value === "sm" || value === "md" ? value : null;
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
