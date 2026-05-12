import { prisma, type Prisma } from "@bloqer/database";

const ACTION_MAX = 128;
const META_MAX_DEPTH = 1;
const META_MAX_KEYS = 24;
const META_STR_MAX = 400;

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

/** Shallow JSON-safe metadata for platform audit (no secrets, bounded size). */
export function sanitizePlatformAuditMetadata(meta: unknown): Prisma.InputJsonValue | undefined {
  if (meta == null) return undefined;
  if (typeof meta !== "object" || Array.isArray(meta)) return undefined;
  const o = meta as Record<string, unknown>;
  const out: Record<string, string | number | boolean | null> = {};
  let n = 0;
  for (const [k, v] of Object.entries(o)) {
    if (n >= META_MAX_KEYS) break;
    const key = truncate(k.replace(/[^\w.-]/g, "_"), 64);
    if (/secret|password|token|apikey|authorization|cookie/i.test(key)) continue;
    if (v === null) {
      out[key] = null;
    } else if (typeof v === "boolean" || typeof v === "number") {
      out[key] = v;
    } else if (typeof v === "string") {
      out[key] = truncate(v, META_STR_MAX);
    } else if (META_MAX_DEPTH > 0 && v && typeof v === "object" && !Array.isArray(v)) {
      out[key] = truncate(JSON.stringify(v), META_STR_MAX);
    } else {
      out[key] = truncate(String(v), META_STR_MAX);
    }
    n += 1;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export type CreatePlatformAuditLogInput = {
  actorUserId: string;
  action: string;
  targetTenantId?: string | null;
  metadata?: unknown;
};

export async function createPlatformAuditLog(
  input: CreatePlatformAuditLogInput,
  tx?: Prisma.TransactionClient,
): Promise<void> {
  const db = tx ?? prisma;
  const meta = sanitizePlatformAuditMetadata(input.metadata);
  await db.platformAuditLog.create({
    data: {
      actorUserId: input.actorUserId,
      action: truncate(input.action.trim(), ACTION_MAX),
      targetTenantId: input.targetTenantId ?? null,
      metadata: meta ?? undefined,
    },
  });
}
