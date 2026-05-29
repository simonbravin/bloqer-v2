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
  return Number.isFinite(n) ? n : null;
}

/** Inclusive UTC day range from YYYY-MM-DD inputs (date-only fields). */
export function parseAuditDateFrom(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

export function parseAuditDateToInclusive(date: string): Date {
  return new Date(`${date}T23:59:59.999Z`);
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
