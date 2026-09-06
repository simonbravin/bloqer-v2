/**
 * Safe rendering helpers for Bloqer AI chat (no dangerouslySetInnerHTML).
 * Model output is treated as plain text; only tool-provided hrefs may become links.
 */

const SAFE_INTERNAL = /^\/[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]*$/;

export type AiSafeLink = { label: string; href: string };

export function isSafeInternalHref(href: string): boolean {
  if (!href || typeof href !== "string") return false;
  const trimmed = href.trim();
  if (
    trimmed.startsWith("//") ||
    trimmed.includes("://") ||
    trimmed.toLowerCase().startsWith("javascript:") ||
    trimmed.toLowerCase().startsWith("data:")
  ) {
    return false;
  }
  return SAFE_INTERNAL.test(trimmed);
}

/** Keep only trusted internal links from the tool layer (dedupe by href). */
export function filterSafeAiLinks(
  links: Array<{ label?: unknown; href?: unknown }> | null | undefined,
  opts?: { max?: number },
): AiSafeLink[] {
  if (!links?.length) return [];
  const max = opts?.max ?? 12;
  const out: AiSafeLink[] = [];
  const seen = new Set<string>();
  for (const link of links) {
    if (typeof link.href !== "string" || typeof link.label !== "string") continue;
    const href = link.href.trim();
    const label = link.label.trim().slice(0, 80);
    if (!label || !isSafeInternalHref(href)) continue;
    if (seen.has(href)) continue;
    seen.add(href);
    out.push({ label, href });
    if (out.length >= max) break;
  }
  return out;
}

/** Strip control chars that can break UI; keep unicode text. */
export function sanitizeAssistantPlainText(raw: string): string {
  // Also strip DEL (U+007F) and C1 controls that can confuse terminals/renderers.
  return raw.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, "");
}
