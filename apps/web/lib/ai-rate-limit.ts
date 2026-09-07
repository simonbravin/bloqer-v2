/**
 * Simple in-memory rate limit for Bloqer AI only (tenantId + userId).
 *
 * Compatible with a single Node instance. On Vercel multi-instance the effective
 * limit is approximately N× config (accepted residual until Redis/KV — see
 * BLOQER_AI_ROADMAP.md V1). Does not touch non-AI routes.
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
    lastPruneAt: number;
  };
};

function store() {
  if (!g.__bloqerAiRateLimit) {
    g.__bloqerAiRateLimit = { user: new Map(), tenant: new Map(), lastPruneAt: 0 };
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

function peek(
  map: Map<string, Bucket>,
  key: string,
  limit: number,
  now: number,
): { ok: boolean; retryAfterSec: number; fresh: boolean } {
  const cur = map.get(key);
  if (!cur || cur.resetAt <= now) {
    return { ok: true, retryAfterSec: 0, fresh: true };
  }
  if (cur.count >= limit) {
    return {
      ok: false,
      retryAfterSec: Math.max(1, Math.ceil((cur.resetAt - now) / 1000)),
      fresh: false,
    };
  }
  return { ok: true, retryAfterSec: 0, fresh: false };
}

function commit(
  map: Map<string, Bucket>,
  key: string,
  windowMs: number,
  now: number,
  fresh: boolean,
): void {
  if (fresh) {
    map.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  const cur = map.get(key);
  if (!cur || cur.resetAt <= now) {
    map.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  cur.count += 1;
}

function pruneExpired(map: Map<string, Bucket>, now: number): void {
  for (const [key, bucket] of map) {
    if (bucket.resetAt <= now) map.delete(key);
  }
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

  // Occasional prune so Maps do not grow unbounded across user/tenant keys.
  if (now - maps.lastPruneAt > 60_000) {
    pruneExpired(maps.user, now);
    pruneExpired(maps.tenant, now);
    maps.lastPruneAt = now;
  }

  const userKey = `${input.tenantId}:${input.userId}`;
  const userPeek = peek(maps.user, userKey, cfg.userPerMinute, now);
  if (!userPeek.ok) return { ok: false, retryAfterSec: userPeek.retryAfterSec };

  const tenantPeek = peek(maps.tenant, input.tenantId, cfg.tenantPerHour, now);
  if (!tenantPeek.ok) return { ok: false, retryAfterSec: tenantPeek.retryAfterSec };

  // Commit both only after both peeks succeed (avoid burning user quota on tenant deny).
  commit(maps.user, userKey, 60_000, now, userPeek.fresh);
  commit(maps.tenant, input.tenantId, 3_600_000, now, tenantPeek.fresh);

  return { ok: true };
}

/** Test helper — clears buckets (does not affect other app traffic). */
export function resetAiChatRateLimitForTests(): void {
  const maps = store();
  maps.user.clear();
  maps.tenant.clear();
  maps.lastPruneAt = 0;
}

export const AI_RATE_LIMIT_USER_MESSAGE =
  "Alcanzaste temporalmente el límite de consultas de Bloqer AI. Intentá nuevamente en unos minutos.";
