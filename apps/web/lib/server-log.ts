/**
 * Structured JSON logs for server routes/actions (Phase 5 observability MVP).
 * Always includes requestId + tenantId when available — never secrets.
 */
export type ServerLogFields = {
  requestId?: string | null;
  tenantId?: string | null;
  companyId?: string | null;
  route?: string | null;
  level?: "info" | "warn" | "error";
  message: string;
  [key: string]: unknown;
};

export function serverLog(fields: ServerLogFields): void {
  const { level = "info", message, ...rest } = fields;
  const payload = {
    ts: new Date().toISOString(),
    level,
    message,
    ...rest,
  };
  const line = JSON.stringify(payload);
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.info(line);
  }
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function getOrCreateRequestId(headerValue: string | null): string {
  const fromHeader = headerValue?.trim() ?? "";
  if (fromHeader && UUID_RE.test(fromHeader)) return fromHeader;
  return crypto.randomUUID();
}
