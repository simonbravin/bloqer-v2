import type { Prisma } from "@bloqer/database";

const META_MAX_KEYS = 32;
const META_STR_MAX = 400;
const SECRET_KEY = /secret|password|token|apikey|authorization|cookie|storagekey/i;

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

/** Shallow JSON-safe payload for tenant audit before/after (no secrets, bounded size). */
export function sanitizeAuditPayload(meta: unknown): Prisma.InputJsonValue | undefined {
  if (meta == null) return undefined;
  if (typeof meta !== "object" || Array.isArray(meta)) return undefined;

  const o = meta as Record<string, unknown>;
  const out: Record<string, string | number | boolean | null> = {};
  let n = 0;

  for (const [k, v] of Object.entries(o)) {
    if (n >= META_MAX_KEYS) break;
    const key = truncate(k.replace(/[^\w.-]/g, "_"), 64);
    if (SECRET_KEY.test(key)) continue;

    if (v === null) {
      out[key] = null;
    } else if (typeof v === "boolean" || typeof v === "number") {
      out[key] = v;
    } else if (typeof v === "string") {
      out[key] = truncate(v, META_STR_MAX);
    } else if (v && typeof v === "object" && !Array.isArray(v)) {
      out[key] = truncate(JSON.stringify(v), META_STR_MAX);
    } else {
      out[key] = truncate(String(v), META_STR_MAX);
    }
    n += 1;
  }

  return Object.keys(out).length > 0 ? out : undefined;
}
