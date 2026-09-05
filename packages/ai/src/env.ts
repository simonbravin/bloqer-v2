import { z } from "zod";

function parseTruthyFlag(raw: string | undefined): boolean {
  if (raw == null || raw.trim() === "") return false;
  const v = raw.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

/**
 * Bloqer AI is OFF unless explicitly enabled.
 * Missing / empty / false → disabled.
 * Production-like envs additionally require BLOQER_AI_ALLOW_PRODUCTION=true:
 * VERCEL_ENV=production, APP_ENV=production, or NODE_ENV=production
 * (covers portal, Preview with NODE_ENV=production, and `next start`).
 */
export function resolveBloqerAiEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (!parseTruthyFlag(env.BLOQER_AI_ENABLED)) return false;
  const isProd =
    env.VERCEL_ENV === "production" ||
    env.APP_ENV === "production" ||
    env.NODE_ENV === "production";
  if (isProd && !parseTruthyFlag(env.BLOQER_AI_ALLOW_PRODUCTION)) {
    return false;
  }
  return true;
}

export type BloqerAiEnv = {
  enabled: boolean;
  providerId: string;
  model: string;
  timeoutMs: number;
  maxToolCalls: number;
  maxOutputTokens: number;
  baseUrl?: string;
  openaiApiKey?: string;
};

/** Feature flag only — must not import provider SDKs. */
export function isBloqerAiEnabled(): boolean {
  return resolveBloqerAiEnabled();
}

function isProductionEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  return (
    env.VERCEL_ENV === "production" ||
    env.APP_ENV === "production" ||
    env.NODE_ENV === "production"
  );
}

/** Deterministic FakeAiProvider is for local/E2E only — never selectable in production. */
export function isFakeAiProviderId(providerId: string): boolean {
  const id = providerId.trim().toLowerCase();
  return id === "fake" || id === "fake_secondary" || id.startsWith("fake_");
}

/**
 * Throws if a fake/test provider would be used under a production env.
 * Does not enable AI by itself; complements resolveBloqerAiEnabled.
 */
export function assertFakeProviderAllowed(
  providerId: string,
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (!isFakeAiProviderId(providerId)) return;
  if (isProductionEnv(env)) {
    throw new Error(
      `AI provider "${providerId}" is blocked in production (FakeAiProvider is local/E2E only).`,
    );
  }
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (raw == null || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return fallback;
  return n;
}

/**
 * Field-independent parsing: a bad optional URL must not wipe OPENAI_API_KEY.
 */
export function getBloqerAiEnv(env: NodeJS.ProcessEnv = process.env): BloqerAiEnv {
  const enabled = resolveBloqerAiEnabled(env);
  const providerId = env.BLOQER_AI_PROVIDER?.trim() || "openai";
  const model = env.BLOQER_AI_MODEL?.trim() || "gpt-4.1-mini";
  const timeoutMs = parsePositiveInt(env.BLOQER_AI_TIMEOUT_MS, 60_000);
  const maxToolCalls = parsePositiveInt(env.BLOQER_AI_MAX_TOOL_CALLS, 10);
  const maxOutputTokens = parsePositiveInt(env.BLOQER_AI_MAX_OUTPUT_TOKENS, 2048);

  let baseUrl: string | undefined;
  const rawBase = env.BLOQER_AI_BASE_URL?.trim();
  if (rawBase) {
    const parsed = z.string().url().safeParse(rawBase);
    if (parsed.success) baseUrl = parsed.data;
  }

  const openaiApiKey = env.OPENAI_API_KEY?.trim() || undefined;

  return {
    enabled,
    providerId,
    model,
    timeoutMs,
    maxToolCalls,
    maxOutputTokens,
    baseUrl,
    openaiApiKey,
  };
}
