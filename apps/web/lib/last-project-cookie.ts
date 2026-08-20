import { isUuid } from "@bloqer/utils";

export const LAST_PROJECT_COOKIE = "bloqer-last-project-id";
const LAST_PROJECT_CHANGED_EVENT = "bloqer:last-project-changed";
const MAX_AGE = 60 * 60 * 24 * 180;

function cookieSecureSuffix(): string {
  return location.protocol === "https:" ? "; Secure" : "";
}

function notifyLastProjectChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(LAST_PROJECT_CHANGED_EVENT));
}

export function isProjectIdValue(value: string | null | undefined): value is string {
  return typeof value === "string" && isUuid(value);
}

export function readLastProjectIdFromDocument(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${LAST_PROJECT_COOKIE}=([^;]*)`));
  const raw = match?.[1] ? decodeURIComponent(match[1]) : null;
  return isProjectIdValue(raw) ? raw : null;
}

export function writeLastProjectIdCookie(projectId: string): void {
  if (typeof document === "undefined" || !isProjectIdValue(projectId)) return;
  if (readLastProjectIdFromDocument() === projectId) return;
  document.cookie = `${LAST_PROJECT_COOKIE}=${encodeURIComponent(projectId)}; Path=/; Max-Age=${MAX_AGE}; SameSite=Lax${cookieSecureSuffix()}`;
  notifyLastProjectChanged();
}

export function clearLastProjectIdCookie(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${LAST_PROJECT_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${cookieSecureSuffix()}`;
  notifyLastProjectChanged();
}

export function subscribeLastProjectId(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(LAST_PROJECT_CHANGED_EVENT, onChange);
  return () => window.removeEventListener(LAST_PROJECT_CHANGED_EVENT, onChange);
}
