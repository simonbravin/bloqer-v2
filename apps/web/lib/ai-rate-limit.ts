/**
 * Simple in-memory rate limit for Bloqer AI only (tenantId + userId).
 *
 * Compatible with a single Node instance. On Vercel multi-instance the effective
 * limit is per-instance (acceptable for MVP); swap to Redis/KV later if needed.
 * Does not touch non-AI routes.
 */

export type AiRateLimitConfig = {
  userPerMinute: number;
  tenantPerHour: number;
};

export type AiRateLimitResult =
  | { ok: true }
  | { ok: false; retryAfterSec: number };

type Bucket = { count: number; resetAt: number };

const g = globalThis as typeof globalThis & {
  __bloqerAiRateLimit?: {
    user: Map<string, Bucket>;
    tenant: Map<string, Bucket>;
  };
};

function store() {
  if (!g.__bloqerAiRateLimit) {
    g.__bloqerAiRateLimit = { user: new Map(), tenant: new Map() };
  }
  return g.__bloqerAiRateLimit;
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (raw == null || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return fallback;
  return n;
}

export function getAiRateLimitConfig(
  env: NodeJS.ProcessEnv = process.env,
): AiRateLimitConfig {
  return {
    userPerMinute: parsePositiveInt(env.BLOQER_AI_RATE_LIMIT_USER_PER_MINUTE, 20),
    tenantPerHour: parsePositiveInt(env.BLOQER_AI_RATE_LIMIT_TENANT_PER_HOUR, 200),
  };
}

function hit(
  map: Map<string, Bucket>,
  key: string,
  limit: number,
  windowMs: number,
  now: number,
): { ok: boolean; retryAfterSec: number } {
  const cur = map.get(key);
  if (!cur || cur.resetAt <= now) {
    map.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSec: 0 };
  }
  if (cur.count >= limit) {
    return {
      ok: false,
      retryAfterSec: Math.max(1, Math.ceil((cur.resetAt - now) / 1000)),
    };
  }
  cur.count += 1;
  return { ok: true, retryAfterSec: 0 };
}

/** Returns ok=false when the user or tenant exceeded the configured AI quota. */
export function checkAiChatRateLimit(input: {
  tenantId: string;
  userId: string;
  config?: AiRateLimitConfig;
  nowMs?: number;
}): AiRateLimitResult {
  const cfg = input.config ?? getAiRateLimitConfig();
  const now = input.nowMs ?? Date.now();
  const maps = store();

  const user = hit(
    maps.user,
    `${input.tenantId}:${input.userId}`,
    cfg.userPerMinute,
    60_000,
    now,
  );
  if (!user.ok) return { ok: false, retryAfterSec: user.retryAfterSec };

  const tenant = hit(maps.tenant, input.tenantId, cfg.tenantPerHour, 3_600_000, now);
  if (!tenant.ok) return { ok: false, retryAfterSec: tenant.retryAfterSec };

  return { ok: true };
}

/** Test helper — clears buckets (does not affect other app traffic). */
export function resetAiChatRateLimitForTests(): void {
  const maps = store();
  maps.user.clear();
  maps.tenant.clear();
}

export const AI_RATE_LIMIT_USER_MESSAGE =
  "Alcanzaste temporalmente el límite de consultas de Bloqer AI. Intentá nuevamente en unos minutos.";
