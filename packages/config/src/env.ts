import { z } from "zod";

// ─── Core ────────────────────────────────────────────────────────────────────
// Validated eagerly at startup. Both fields have defaults so local dev
// never crashes without a .env file.
const coreSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_ENV: z.enum(["development", "test", "production"]).default("development"),
});

// ─── Database ─────────────────────────────────────────────────────────────────
// Validated lazily — call getDatabaseEnv() before first DB access (Phase 1+).
const databaseSchema = z.object({
  DATABASE_URL: z.string().url("DATABASE_URL must be a valid connection string"),
  DIRECT_URL: z.string().url("DIRECT_URL must be a valid connection string"),
});

// ─── Auth ─────────────────────────────────────────────────────────────────────
// Validated lazily — call getAuthEnv() when auth is wired (Phase 1).
// AUTH_SECRET required by Auth.js v5. AUTH_URL is auto-detected; only set in production.
// Google OAuth creds are read directly by Auth.js from process.env — not validated here
// so the app boots locally without real Google credentials.
const authSchema = z.object({
  AUTH_SECRET: z.string().min(1, "AUTH_SECRET is required"),
  AUTH_URL: z.string().url("AUTH_URL must be a valid URL").optional(),
});

// ─── Email ────────────────────────────────────────────────────────────────────
// Optional: app boots without RESEND_*. Use isEmailConfigured() / getEmailEnv() before sending.
const emailSchema = z.object({
  RESEND_API_KEY: z.string().min(1, "RESEND_API_KEY is required"),
  RESEND_FROM_EMAIL: z.string().email("RESEND_FROM_EMAIL must be a valid email"),
});

export type ResendEmailEnv = z.infer<typeof emailSchema>;

// ─── Storage ──────────────────────────────────────────────────────────────────
// Validated lazily — call getStorageEnv() when R2 is wired (Phase 2+).
// R2_PUBLIC_URL is optional: presigned GET URLs are used for download, not public URLs.
const storageSchema = z.object({
  R2_ACCOUNT_ID: z.string().min(1, "R2_ACCOUNT_ID is required"),
  R2_ACCESS_KEY_ID: z.string().min(1, "R2_ACCESS_KEY_ID is required"),
  R2_SECRET_ACCESS_KEY: z.string().min(1, "R2_SECRET_ACCESS_KEY is required"),
  R2_BUCKET_NAME: z.string().min(1, "R2_BUCKET_NAME is required"),
  R2_PUBLIC_URL: z.string().url("R2_PUBLIC_URL must be a valid URL").optional(),
});

// ─── Parser ───────────────────────────────────────────────────────────────────

function parseEnv<T>(schema: z.ZodType<T>, label: string): T {
  const result = schema.safeParse(process.env);
  if (!result.success) {
    const errors = result.error.flatten().fieldErrors;
    console.error(`\n[config] Missing or invalid env vars (${label}):`);
    for (const [key, messages] of Object.entries(errors)) {
      console.error(`  ${key}: ${(messages as string[]).join(", ")}`);
    }
    throw new Error(`Invalid environment configuration: ${label}. Check your .env.local file.`);
  }
  return result.data;
}

// ─── Exports ──────────────────────────────────────────────────────────────────

// Eagerly validated — safe to import anywhere since both fields have defaults.
export const coreEnv = parseEnv(coreSchema, "core");

// Lazily validated — call once when the integration is first initialized.
export function getDatabaseEnv() {
  return parseEnv(databaseSchema, "database");
}

export function getAuthEnv() {
  return parseEnv(authSchema, "auth");
}

/** `true` when both RESEND_* vars are present and valid. Does not log secrets. */
export function isEmailConfigured(): boolean {
  return emailSchema.safeParse(process.env).success;
}

/**
 * Validated Resend env, or `null` if email is disabled (missing/invalid vars).
 * Never throws; never logs the API key.
 */
export function getEmailEnv(): ResendEmailEnv | null {
  const result = emailSchema.safeParse(process.env);
  return result.success ? result.data : null;
}

/**
 * Public base URL for absolute links in emails (no trailing slash).
 * Reads AUTH_URL, NEXT_PUBLIC_APP_URL, or APP_URL — whichever is a valid http(s) URL first.
 * Does not validate at app boot.
 */
export function getPublicAppBaseUrl(): string | null {
  const raw = [process.env.AUTH_URL, process.env.NEXT_PUBLIC_APP_URL, process.env.APP_URL]
    .map((s) => s?.trim())
    .filter((s): s is string => Boolean(s));
  for (const c of raw) {
    if (!c.startsWith("http://") && !c.startsWith("https://")) continue;
    try {
      const u = new URL(c);
      return `${u.protocol}//${u.host}`;
    } catch {
      continue;
    }
  }
  return null;
}

export function getStorageEnv() {
  return parseEnv(storageSchema, "storage");
}

export function isStorageConfigured(): boolean {
  return storageSchema.safeParse(process.env).success;
}

// ─── Cron / internal jobs (Phase 8D) ─────────────────────────────────────────
// CRON_SECRET read at request time; route returns 503 if missing or too short. Never commit secrets.

const CRON_SECRET_MIN_LENGTH = 16;

export function getOperationalAlertsCronSecret(): string | null {
  const s = process.env.CRON_SECRET?.trim();
  if (!s || s.length < CRON_SECRET_MIN_LENGTH) return null;
  return s;
}

// ─── Platform superadmin (Phase 10A) ─────────────────────────────────────────
// PLATFORM_SUPERADMIN_EMAILS is optional; app boots if unset.

/** Parse PLATFORM_SUPERADMIN_EMAILS (comma-separated). Never throws; trims/lowercases; skips invalid emails. */
export function getPlatformSuperadminEmails(): Set<string> {
  const raw = process.env.PLATFORM_SUPERADMIN_EMAILS;
  if (!raw?.trim()) return new Set();
  const out = new Set<string>();
  for (const part of raw.split(",")) {
    const t = part.trim().toLowerCase();
    if (!t) continue;
    const one = z.string().email().safeParse(t);
    if (one.success) out.add(one.data);
  }
  return out;
}

/** True if email is in the env allowlist (OR path for platform access). */
export function isEmailPlatformSuperadminAllowlisted(email: string): boolean {
  const norm = email.trim().toLowerCase();
  if (!norm) return false;
  return getPlatformSuperadminEmails().has(norm);
}
