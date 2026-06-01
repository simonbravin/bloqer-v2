/** Locale fijo para UI es-AR: fechas siempre dd/mm/yyyy. */
const LOCALE = "es-AR";

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
  const d = new Date(raw.includes("T") ? raw : `${raw}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Fecha corta: dd/mm/yyyy */
export function formatDate(value: Date | string | number | null | undefined, fallback = "—"): string {
  const d = value == null ? null : toDate(value);
  if (!d) return fallback;
  return d.toLocaleDateString(LOCALE, DATE_PARTS);
}

/** Rango corto: dd/mm/yyyy → dd/mm/yyyy (para ISO strings y Date). */
export function formatDateRange(
  from: Date | string | number | null | undefined,
  to: Date | string | number | null | undefined,
  separator = " → ",
): string {
  return `${formatDate(from)}${separator}${formatDate(to)}`;
}

/** Fecha y hora: dd/mm/yyyy, hh:mm */
export function formatDateTime(value: Date | string | number | null | undefined, fallback = "—"): string {
  const d = value == null ? null : toDate(value);
  if (!d) return fallback;
  return d.toLocaleString(LOCALE, DATE_TIME_PARTS);
}

/** Fecha larga para detalle: "lunes, 26 de mayo de 2026" */
export function formatDateLong(value: Date | string | number | null | undefined, fallback = "—"): string {
  const d = value == null ? null : toDate(value);
  if (!d) return fallback;
  return d.toLocaleDateString(LOCALE, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
