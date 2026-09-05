/**
 * Safe rendering helpers for Bloqer AI chat (no dangerouslySetInnerHTML).
 * Model output is treated as plain text; only tool-provided hrefs may become links.
 */

const SAFE_INTERNAL = /^\/[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]*$/;

export function isSafeInternalHref(href: string): boolean {
  if (!href || typeof href !== "string") return false;
  if (href.startsWith("//") || href.includes("://") || href.toLowerCase().startsWith("javascript:")) {
    return false;
  }
  return SAFE_INTERNAL.test(href);
}

/** Strip control chars that can break UI; keep unicode text. */
export function sanitizeAssistantPlainText(raw: string): string {
  // Also strip DEL (U+007F) and C1 controls that can confuse terminals/renderers.
  return raw.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, "");
}
