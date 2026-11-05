import { AUDIT_UI_MODULE_LABEL_ES, type AuditUiModule } from "@bloqer/domain";

/** Extract human-readable reference from audit before/after payloads. */
export function extractAuditReference(before: unknown, after: unknown): string | null {
  for (const payload of [after, before]) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) continue;
    const o = payload as Record<string, unknown>;
    if (typeof o.number === "number") return `#${o.number}`;
    if (typeof o.number === "string" && o.number.trim()) return `#${o.number.trim()}`;
    if (typeof o.code === "string" && o.code.trim()) return o.code.trim();
    if (typeof o.name === "string" && o.name.trim()) return o.name.trim();
  }
  return null;
}

export function formatAuditActorLabel(
  actorUserId: string | null | undefined,
  actorName: string | null | undefined,
  actorEmail: string | null | undefined,
): string {
  if (!actorUserId) return "Sistema";
  if (actorName?.trim()) return actorName.trim();
  if (actorEmail?.trim()) return actorEmail.trim();
  return "Usuario desconocido";
}

export type AuditLogCursor = { createdAt: string; id: string };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function encodeAuditLogCursor(createdAt: Date, id: string): string {
  const payload: AuditLogCursor = { createdAt: createdAt.toISOString(), id };
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function decodeAuditLogCursor(raw: string): AuditLogCursor | null {
  try {
    const json = Buffer.from(raw, "base64url").toString("utf8");
    const parsed = JSON.parse(json) as AuditLogCursor;
    if (!parsed.createdAt || !parsed.id || !UUID_RE.test(parsed.id)) return null;
    const createdAt = new Date(parsed.createdAt);
    if (Number.isNaN(createdAt.getTime())) return null;
    return { createdAt: createdAt.toISOString(), id: parsed.id };
  } catch {
    return null;
  }
}

/** Parse reference filter: "#142" or "142" → numeric document number. */
export function parseAuditReferenceFilter(reference: string): number | null {
  const trimmed = reference.trim().replace(/^#/, "");
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number.parseInt(trimmed, 10);
  return Number.isSafeInteger(n) ? n : null;
}

/** Find the first instant of the local day, including zones that skip midnight at DST. */
function localAuditDayStart(day: Date, timeZone: string): Date {
  if (timeZone === "UTC" || Number.isNaN(day.getTime())) return day;
  const target = day.getUTCFullYear() * 10_000 + (day.getUTCMonth() + 1) * 100 + day.getUTCDate();
  const format = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "numeric", day: "numeric",
  });
  const twoDays = 2 * 24 * 60 * 60 * 1000;
  let lower = day.getTime() - twoDays;
  let upper = day.getTime() + twoDays;
  while (lower < upper) {
    const mid = Math.floor((lower + upper) / 2);
    const { year, month, day: date } = Object.fromEntries(
      format.formatToParts(new Date(mid)).map(({ type, value }) => [type, Number(value)]),
    );
    const candidate = year! * 10_000 + month! * 100 + date!;
    if (candidate < target) lower = mid + 1;
    else upper = mid;
  }
  return new Date(lower);
}

export function parseAuditDateFrom(date: string, timeZone = "UTC"): Date {
  return localAuditDayStart(new Date(`${date}T00:00:00.000Z`), timeZone);
}

export function parseAuditDateToInclusive(date: string, timeZone = "UTC"): Date {
  const nextDay = new Date(`${date}T00:00:00.000Z`);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  return new Date(localAuditDayStart(nextDay, timeZone).getTime() - 1);
}

export function isValidDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = parseAuditDateFrom(value);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(value);
}

export function formatAuditLogExportFilterLine(filters: {
  module?: string;
  projectId?: string;
  actorUserId?: string;
  action?: string;
  reference?: string;
  dateFrom?: string;
  dateTo?: string;
}): string {
  const parts: string[] = [];
  if (filters.module) {
    const label = AUDIT_UI_MODULE_LABEL_ES[filters.module as AuditUiModule];
    parts.push(`Módulo: ${label ?? filters.module}`);
  }
  if (filters.projectId) parts.push("Proyecto: (filtro activo)");
  if (filters.actorUserId) parts.push("Usuario: (filtro activo)");
  if (filters.action) parts.push(`Acción: ${filters.action}`);
  if (filters.reference) parts.push(`Nº documento: ${filters.reference}`);
  if (filters.dateFrom) parts.push(`Desde: ${filters.dateFrom}`);
  if (filters.dateTo) parts.push(`Hasta: ${filters.dateTo}`);
  return parts.length > 0 ? parts.join(" · ") : "Ninguno";
}
