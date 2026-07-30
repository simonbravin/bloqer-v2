import { PRODUCT_TIMEZONE } from "./calendar-date";

/**
 * IANA timezones for tenant settings / scheduling UI.
 * Labels include GMT offset via Intl (Argentina is GMT-3 year-round — no DST).
 */

export type TenantTimezoneOption = {
  /** IANA id (e.g. America/Argentina/Buenos_Aires). */
  value: string;
  /** City / region label in Spanish. */
  city: string;
};

/** Curated list for LATAM + common partners. Values must be valid IANA ids. */
export const TENANT_TIMEZONE_OPTIONS: readonly TenantTimezoneOption[] = [
  { value: "America/Argentina/Buenos_Aires", city: "Buenos Aires" },
  { value: "America/Argentina/Cordoba", city: "Córdoba" },
  { value: "America/Argentina/Mendoza", city: "Mendoza" },
  { value: "America/Argentina/Salta", city: "Salta" },
  { value: "America/Argentina/Tucuman", city: "Tucumán" },
  { value: "America/Argentina/Ushuaia", city: "Ushuaia" },
  { value: "America/Montevideo", city: "Montevideo" },
  { value: "America/Asuncion", city: "Asunción" },
  { value: "America/Santiago", city: "Santiago" },
  { value: "America/La_Paz", city: "La Paz" },
  { value: "America/Sao_Paulo", city: "São Paulo" },
  { value: "America/Mexico_City", city: "Ciudad de México" },
  { value: "America/Bogota", city: "Bogotá" },
  { value: "America/Lima", city: "Lima" },
  { value: "America/Guayaquil", city: "Guayaquil" },
  { value: "America/New_York", city: "Nueva York" },
  { value: "America/Chicago", city: "Chicago" },
  { value: "America/Denver", city: "Denver" },
  { value: "America/Los_Angeles", city: "Los Ángeles" },
  { value: "Europe/Madrid", city: "Madrid" },
  { value: "UTC", city: "UTC" },
] as const;

export function isValidIanaTimeZone(timeZone: string): boolean {
  if (!timeZone.trim()) return false;
  try {
    Intl.DateTimeFormat("en-US", { timeZone: timeZone.trim() });
    return true;
  } catch {
    return false;
  }
}

/** Valid IANA or product default — never returns an invalid zone. */
export function resolveDisplayTimeZone(timeZone?: string | null): string {
  const tz = timeZone?.trim();
  if (tz && isValidIanaTimeZone(tz)) return tz;
  return PRODUCT_TIMEZONE;
}

/** GMT offset label for `timeZone` at `at` (e.g. "GMT-3", "GMT+1", "GMT-3:30"). */
export function formatGmtOffsetLabel(timeZone: string, at: Date = new Date()): string {
  const resolved = resolveDisplayTimeZone(timeZone);
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: resolved,
      timeZoneName: "longOffset",
    }).formatToParts(at);
    const raw = parts.find((p) => p.type === "timeZoneName")?.value ?? "";
    if (raw === "GMT" || raw === "UTC") return "GMT+0";
    const m = raw.match(/^GMT([+-])(\d{1,2})(?::(\d{2}))?$/i);
    if (!m) return raw || "GMT";
    const sign = m[1]!;
    const hours = Number(m[2]);
    const minutes = m[3] ? Number(m[3]) : 0;
    if (minutes === 0) return `GMT${sign}${hours}`;
    return `GMT${sign}${hours}:${String(minutes).padStart(2, "0")}`;
  } catch {
    return "GMT";
  }
}

export function cityLabelForTimeZone(timeZone: string): string {
  const known = TENANT_TIMEZONE_OPTIONS.find((o) => o.value === timeZone);
  if (known) return known.city;
  const tail = timeZone.split("/").pop();
  return tail ? tail.replace(/_/g, " ") : timeZone;
}

/** e.g. "Buenos Aires (GMT-3)". */
export function formatTimezoneOptionLabel(
  timeZone: string,
  at: Date = new Date(),
): string {
  const resolved = resolveDisplayTimeZone(timeZone);
  return `${cityLabelForTimeZone(resolved)} (${formatGmtOffsetLabel(resolved, at)})`;
}

export type TimezoneSelectOption = { value: string; label: string };

/**
 * Options for `<select>` / Select.
 * - Valid non-curated current → prepended as "actual".
 * - Invalid current → ignored (caller should default `value` to `resolveDisplayTimeZone`).
 */
export function listTenantTimezoneSelectOptions(
  currentValue?: string | null,
  at: Date = new Date(),
): TimezoneSelectOption[] {
  const seen = new Set<string>();
  const out: TimezoneSelectOption[] = [];

  for (const o of TENANT_TIMEZONE_OPTIONS) {
    seen.add(o.value);
    out.push({ value: o.value, label: formatTimezoneOptionLabel(o.value, at) });
  }

  const current = currentValue?.trim();
  if (current && !seen.has(current) && isValidIanaTimeZone(current)) {
    out.unshift({
      value: current,
      label: `${formatTimezoneOptionLabel(current, at)} — actual`,
    });
  }

  return out;
}
