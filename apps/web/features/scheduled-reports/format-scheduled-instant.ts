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

function asDate(value: Date | string | number | undefined): Date {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? new Date() : value;
  }
  if (value == null) return new Date();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

/** e.g. "Buenos Aires (GMT-3)" for captions under next/last run. */
export function scheduledTimezoneCaption(
  timeZone: string,
  at: Date | string | number = new Date(),
): string {
  return formatTimezoneOptionLabel(timeZone, asDate(at));
}
