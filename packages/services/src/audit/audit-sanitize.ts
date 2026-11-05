import { Prisma } from "@bloqer/database";

const META_MAX_KEYS = 32;
const META_STR_MAX = 400;
const META_MAX_DEPTH = 4;
const SECRET_KEY = /secret|password|token|apikey|authorization|cookie|storagekey|privatekey|credential/i;

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return value.slice(0, max - 1) + "…";
}

function safeEntries(value: object) {
  return Object.entries(value)
    .filter(([key]) => !SECRET_KEY.test(key.replace(/[^a-z0-9]/gi, "")))
    .slice(0, META_MAX_KEYS)
    .map(([key, item]) => [truncate(key.replace(/[^\w.-]/g, "_"), 64), item] as const);
}

function redact(value: unknown, depth: number): Prisma.InputJsonValue | null {
  if (value == null) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const text = value.trimStart();
    if (text.startsWith("{") || text.startsWith("[")) {
      if (depth >= META_MAX_DEPTH) return "…";
      try {
        return truncate(JSON.stringify(redact(JSON.parse(text), depth + 1)), META_STR_MAX);
      } catch {
        // Historical stringified snapshots may have been truncated before redaction.
        if (SECRET_KEY.test(text.replace(/[^a-z0-9]/gi, ""))) return "[dato protegido]";
      }
    }
    return truncate(value, META_STR_MAX);
  }
  if (typeof value !== "object") return truncate(String(value), META_STR_MAX);
  if (value instanceof Date) return value.toJSON();
  if (Prisma.Decimal.isDecimal(value)) return truncate(value.toString(), META_STR_MAX);
  if (depth >= META_MAX_DEPTH) return "…";
  if (Array.isArray(value)) return value.slice(0, META_MAX_KEYS).map((item) => redact(item, depth + 1));
  return Object.fromEntries(safeEntries(value).map(([key, item]) => [key, redact(item, depth + 1)]));
}

/** Redact nested values before flattening them into bounded audit text. */
export function sanitizeAuditPayload(meta: unknown): Prisma.InputJsonValue | undefined {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return undefined;
  const out = Object.fromEntries(safeEntries(meta).map(([key, item]) => {
    const cleaned = redact(item, 0);
    if (Array.isArray(item) && Array.isArray(cleaned) &&
      cleaned.every((value) => value === null || typeof value !== "object")) {
      return [key, truncate(cleaned.join(","), META_STR_MAX)];
    }
    return [key, cleaned !== null && typeof cleaned === "object"
      ? truncate(JSON.stringify(cleaned), META_STR_MAX)
      : cleaned];
  }));
  return Object.keys(out).length > 0 ? out : undefined;
}
