import { formatDateTime, formatTimezoneOptionLabel } from "@bloqer/utils";

/**
 * Show scheduled run instants in the **schedule's** IANA timezone (not SSR UTC / browser local).
 * Otherwise 23:00 Buenos Aires looks like 02:00 a.m. on the Vercel server.
 */
export function formatScheduledInstant(
  value: Date | string | number | null | undefined,
  timeZone: string,
  fallback = "—",
): string {
  if (value == null) return fallback;
  return formatDateTime(value, { timeZone, fallback });
}

/** e.g. "Buenos Aires (GMT-3)" for captions under next/last run. */
export function scheduledTimezoneCaption(timeZone: string, at: Date = new Date()): string {
  return formatTimezoneOptionLabel(timeZone, at);
}
