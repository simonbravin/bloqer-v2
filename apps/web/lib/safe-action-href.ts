/**
 * Only allow same-origin relative paths (defense in depth vs. tampered DB rows).
 */
export function safeActionHref(url: string | null | undefined): string | null {
  if (!url) return null;
  const u = url.trim();
  if (!u.startsWith("/") || u.startsWith("//")) return null;
  return u;
}
