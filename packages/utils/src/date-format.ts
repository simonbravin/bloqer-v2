/** Locale fijo para UI es-AR: fechas siempre dd/mm/yyyy. */
import { PRODUCT_TIMEZONE } from "./calendar-date";
import { resolveDisplayTimeZone } from "./timezones";

const LOCALE = "es-AR";

/** Fecha calendario local como YYYY-MM-DD (evita desfase UTC en issueDate/dueDate). */
export function toIsoDateLocal(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const DATE_PARTS: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
};

const DATE_TIME_PARTS: Intl.DateTimeFormatOptions = {
  ...DATE_PARTS,
  hour: "2-digit",
  minute: "2-digit",
};

function toDate(value: Date | string | number): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const raw = String(value).trim();
  if (!raw) return null;
  // Bare YYYY-MM-DD = calendar day → UTC noon (stable across browser TZs).
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? `${raw}T12:00:00.000Z`
    : raw.includes("T")
      ? raw
      : `${raw}T12:00:00`;
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Prisma `@db.Date` is serialized as UTC midnight (`…T00:00:00.000Z`).
 * Detecting that lets `formatDate` pin UTC so SSR and browsers west of UTC agree.
 */
export function isPrismaDateOnlyInstant(d: Date): boolean {
  return (
    d.getUTCHours() === 0 &&
    d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0 &&
    d.getUTCMilliseconds() === 0
  );
}

export type FormatDateOptions = {
  fallback?: string;
  /** IANA timezone (e.g. America/Argentina/Buenos_Aires). Same on SSR and client. */
  timeZone?: string;
};

function resolveFormatOptions(
  fallbackOrOptions: string | FormatDateOptions | undefined,
  defaultFallback: string,
): { fallback: string; timeZone?: string } {
  if (fallbackOrOptions == null) return { fallback: defaultFallback };
  if (typeof fallbackOrOptions === "string") {
    return { fallback: fallbackOrOptions };
  }
  return {
    fallback: fallbackOrOptions.fallback ?? defaultFallback,
    timeZone: fallbackOrOptions.timeZone,
  };
}

function localeOptions(
  base: Intl.DateTimeFormatOptions,
  timeZone?: string,
): Intl.DateTimeFormatOptions {
  // When caller asks for a zone, always pin a valid IANA (never fall back to runtime TZ).
  if (timeZone != null && timeZone !== "") {
    return { ...base, timeZone: resolveDisplayTimeZone(timeZone) };
  }
  return base;
}

/**
 * Zone for date-only display:
 * - explicit override
 * - UTC for Prisma `@db.Date` (midnight wire format)
 * - product TZ for real timestamps shown as a calendar day (SSR = client)
 */
function resolveDateDisplayTimeZone(d: Date, timeZone?: string): string {
  if (timeZone != null && timeZone !== "") return resolveDisplayTimeZone(timeZone);
  if (isPrismaDateOnlyInstant(d)) return "UTC";
  return PRODUCT_TIMEZONE;
}

/**
 * Fecha corta: dd/mm/yyyy.
 *
 * Prefer `formatDbDate` for Prisma `@db.Date` columns. `formatDate` also auto-pins UTC
 * when the instant is UTC midnight (typical `@db.Date` payload), so list/detail stay aligned.
 * Timestamps without an explicit zone use the product timezone.
 */
export function formatDate(
  value: Date | string | number | null | undefined,
  fallbackOrOptions: string | FormatDateOptions = "—",
): string {
  const { fallback, timeZone } = resolveFormatOptions(fallbackOrOptions, "—");
  const d = value == null ? null : toDate(value);
  if (!d) return fallback;
  return d.toLocaleDateString(
    LOCALE,
    localeOptions(DATE_PARTS, resolveDateDisplayTimeZone(d, timeZone)),
  );
}

/**
 * Display helper for Prisma `@db.Date` (calendar day, UTC midnight on the wire).
 *
 * Named `formatDbDate` (not `formatDateOnly`) to avoid colliding with schedule’s
 * ISO `YYYY-MM-DD` helper in `schedule-helpers.ts`.
 */
export function formatDbDate(
  value: Date | string | number | null | undefined,
  fallback = "—",
): string {
  return formatDate(value, { fallback, timeZone: "UTC" });
}

/** Rango corto: dd/mm/yyyy → dd/mm/yyyy (para ISO strings y Date). */
export function formatDateRange(
  from: Date | string | number | null | undefined,
  to: Date | string | number | null | undefined,
  separator = " → ",
): string {
  return `${formatDate(from)}${separator}${formatDate(to)}`;
}

/** Fecha y hora: dd/mm/yyyy, hh:mm — defaults to product TZ so SSR and client match. */
export function formatDateTime(
  value: Date | string | number | null | undefined,
  fallbackOrOptions: string | FormatDateOptions = "—",
): string {
  const { fallback, timeZone } = resolveFormatOptions(fallbackOrOptions, "—");
  const d = value == null ? null : toDate(value);
  if (!d) return fallback;
  return d.toLocaleString(
    LOCALE,
    localeOptions(DATE_TIME_PARTS, resolveDisplayTimeZone(timeZone)),
  );
}

/** Fecha larga para detalle: "lunes, 26 de mayo de 2026" */
export function formatDateLong(
  value: Date | string | number | null | undefined,
  fallbackOrOptions: string | FormatDateOptions = "—",
): string {
  const { fallback, timeZone } = resolveFormatOptions(fallbackOrOptions, "—");
  const d = value == null ? null : toDate(value);
  if (!d) return fallback;
  return d.toLocaleDateString(
    LOCALE,
    localeOptions(
      {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      },
      resolveDateDisplayTimeZone(d, timeZone),
    ),
  );
}
