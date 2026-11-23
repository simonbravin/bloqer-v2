# Environment variables — Bloqer 2.0 (Phase 10D)

Canonical validation lives in [`packages/config/src/env.ts`](../../../packages/config/src/env.ts). **Lazy** groups (`getDatabaseEnv`, `getAuthEnv`, `getStorageEnv`) only throw when those helpers run; **eager** `coreEnv` is always parsed at import. Optional integrations use `isEmailConfigured()`, `isStorageConfigured()`, or ad-hoc reads so **missing R2/Resend/cron keys must not prevent the app from starting**.

> **Naming:** Auth.js v5 in this repo expects **`AUTH_SECRET`** and optional **`AUTH_URL`**. There is **no** `NEXTAUTH_SECRET` / `NEXTAUTH_URL` in code paths documented here; if you mirror another guide, map those to `AUTH_SECRET` / `AUTH_URL`.

## Required for minimal app boot (Next.js)

| Variable | Notes |
|----------|--------|
| *(none from `@bloqer/config` core)* | `NODE_ENV` / `APP_ENV` have defaults in `coreSchema`. |

Static pages build without DB; **any route that hits Prisma** needs a valid `DATABASE_URL` at runtime.

## Required for database & Prisma CLI

| Variable | Notes |
|----------|--------|
| `DATABASE_URL` | Pooled Neon URL (or Postgres). Used by Prisma Client + `schema.prisma` `url`. |
| `DIRECT_URL` | Direct connection for migrations / introspection (`directUrl` in Prisma). |

Validated together via `getDatabaseEnv()`. **Migrate deploy** and **seed** need these in the environment where the command runs.

On Vercel, `vercel-migrate-if-needed.mjs` first validates that both URLs identify the same allowed destination. For Neon only, its migration child process gets a minimum `DIRECT_URL` `connect_timeout=15` when missing or between 1 and 14 seconds, allowing a suspended compute to start. Explicit limits of 15+ seconds and an explicit `0` (unlimited) are preserved. Duplicate or invalid timeout values fail closed. The runtime `DATABASE_URL`, original environment and credentials are unchanged; local builds still skip deployment migrations. A connection or migration failure still fails the build: no migration is skipped or marked successful. See [Prisma v6 / Neon connection timeouts](https://docs.prisma.io/docs/orm/v6/overview/databases/neon#resolving-connection-timeouts).

## Required for auth (runtime login / sessions)

| Variable | Notes |
|----------|--------|
| `AUTH_SECRET` | Non-empty secret (Auth.js v5). |
| `AUTH_URL` | Optional in dev; **recommended in production** (canonical site URL for callbacks). |

Validated via `getAuthEnv()` when invoked. Google OAuth uses **`AUTH_GOOGLE_ID`** and **`AUTH_GOOGLE_SECRET`** (read by Auth.js from `process.env` — not in Zod schema; **optional for local boot**, login fails until set).

## Public app base URL (optional; links in email / invitations)

Read by `getPublicAppBaseUrl()` in order: **`AUTH_URL`**, **`NEXT_PUBLIC_APP_URL`**, **`APP_URL`** — first valid `http(s)` wins. Not validated at boot. Needed for absolute invitation links and some email CTAs when sending mail.

| Variable | Role |
|----------|------|
| `AUTH_URL` | Often production site URL; also used as public base candidate. |
| `NEXT_PUBLIC_APP_URL` | Client/build-time friendly production URL. |
| `APP_URL` | Server-side fallback. |

## Optional — Resend email

| Variable | Notes |
|----------|--------|
| `RESEND_API_KEY` | Both required for `isEmailConfigured()` === true. |
| `RESEND_FROM_EMAIL` | Valid email sender. |

If either is missing/invalid, email features no-op; **boot continues**.

## Optional — Cloudflare R2 (documents)

| Variable | Notes |
|----------|--------|
| `R2_ACCOUNT_ID` | Required together with `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` and `R2_BUCKET_NAME` for `isStorageConfigured()`. `R2_PUBLIC_URL` is optional. |
| `R2_ACCESS_KEY_ID` | Object read/write. Prefer a token that can also set bucket CORS (or set CORS in the Cloudflare dashboard). |
| `R2_SECRET_ACCESS_KEY` | |
| `R2_BUCKET_NAME` | |
| `R2_PUBLIC_URL` | **Opcional** para presigned flows. Un valor vacío se ignora (equivale a no definirla). Si está definida, debe ser URL `http(s)` válida. |

### R2 CORS (required for browser uploads)

Browser uploads go **direct to R2** (presigned PUT) to bypass the Vercel function body limit (4.5 MB). The bucket must allow CORS from the app origins:

```json
[
  {
    "AllowedOrigins": ["https://portal.bloqer.app", "http://localhost:3000"],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag", "Content-Length", "Content-Type"],
    "MaxAgeSeconds": 3600
  }
]
```

Configure in Cloudflare Dashboard → R2 → bucket → Settings → CORS policy. Without this, browser uploads fail after `initiate-upload`.

If you use Vercel **preview** URLs, add those exact origins too (R2 does not expand `*.vercel.app`).

## Optional — Bloqer AI and supplier invoice preview

Canonical parsing lives in [`packages/ai/src/env.ts`](../../../packages/ai/src/env.ts). These flags are independent of storage readiness and never authorize a financial operation.

| Variable | Current behavior |
|----------|------------------|
| `BLOQER_AI_ENABLED` | Global AI opt-in; absent/empty/false disables AI. |
| `BLOQER_AI_ALLOW_PRODUCTION` | Additional opt-in when **any** of `VERCEL_ENV`, `APP_ENV` or `NODE_ENV` equals `production`. A Vercel Preview / `next start` with `NODE_ENV=production` also requires this flag. |
| `BLOQER_AI_SUPPLIER_INVOICE_PREVIEW_ENABLED` | Separate opt-in for document reading; requires both applicable AI gates above. It is off by default. |
| `BLOQER_AI_PURCHASE_REQUEST_AUDIO_ENABLED` | D-148 / ADR-020: separate opt-in for reviewed purchase request dictation; also requires the global AI and applicable production gates. Off by default. |
| `BLOQER_AI_TRANSCRIPTION_MODEL` | Defaults to `gpt-4o-mini-transcribe` through the existing provider. Structured proposal preparation uses `BLOQER_AI_MODEL`. No new service subscription; provider usage may incur charges. |
| `BLOQER_AI_PROVIDER` | Defaults to `openai`; the current preview requires vision and structured output capabilities. Fake providers are blocked in production-like environments. |
| `OPENAI_API_KEY` | Server-only credential for the existing OpenAI provider. Presence alone does not prove that a request will succeed. |
| `BLOQER_AI_MODEL` | Defaults to `gpt-4.1-mini`; changing it requires checking the document capabilities used by the existing provider. |
| `BLOQER_AI_BASE_URL` | Optional provider endpoint; absent or invalid uses the current provider default. Do not use it to route business documents to an unapproved service. |

For these flags, `true`, `1`, `yes` and `on` are enabled (case-insensitive, trimmed). Do not set them globally just to run a pilot. Confirm the intended environment, DB, account and document corpus first; preserve the previous values for rollback.

`GET /api/ai/supplier-invoice-preview` requires a session and reports provider/flag availability. It does **not** prove R2 connectivity, extraction quality or the full business flow. The invoice form offers **Desde un comprobante** only when storage is configured and that capability returns `enabled: true`. Browser upload additionally requires R2 CORS for the exact application origin. See the [pilot preflight](./DEPLOYMENT_SMOKE_TEST.md#primer-paquete--preparación-del-piloto-documental).

## Optional — Operational alerts cron

| Variable | Notes |
|----------|--------|
| `CRON_SECRET` | Min **16** characters after trim (`getOperationalAlertsCronSecret()`). If missing/short, `/api/cron/operational-alerts` returns **503** and does not run jobs. |

## Optional / bootstrap — platform superadmin

| Variable | Notes |
|----------|--------|
| `PLATFORM_SUPERADMIN_EMAILS` | Comma-separated emails; parsed with Zod per segment. **Unset = empty allowlist**; app boots. Access may still use `PlatformAdmin` DB rows per [`PLATFORM_SUPERADMIN_ARCHITECTURE.md`](./PLATFORM_SUPERADMIN_ARCHITECTURE.md). |

## Seed (local / bootstrap only)

| Variable | Notes |
|----------|--------|
| `SEED_USER_EMAIL` | Required by `pnpm --filter @bloqer/database db:seed` (`packages/database/src/seed.ts`). |

## Quick matrix

| Concern | Variables |
|---------|-----------|
| DB + migrate | `DATABASE_URL`, `DIRECT_URL` |
| Auth | `AUTH_SECRET`, `AUTH_URL` (recommended prod), `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` |
| Public URLs in mail | `AUTH_URL` / `NEXT_PUBLIC_APP_URL` / `APP_URL` |
| Email send | `RESEND_API_KEY`, `RESEND_FROM_EMAIL` |
| R2 | `R2_*` |
| Cron | `CRON_SECRET` |
| Platform allowlist | `PLATFORM_SUPERADMIN_EMAILS` |
| Seed | `SEED_USER_EMAIL` |

See also [`.env.example`](../../../.env.example).

### Lectura de cotizaciones (5/E1)

`BLOQER_AI_PROCUREMENT_QUOTE_PREVIEW_ENABLED` es opt-in y su valor por defecto es `false`. Requiere también los gates `BLOQER_AI_ENABLED`/`BLOQER_AI_ALLOW_PRODUCTION` según entorno, y proveedor con visión/salida estructurada. Reutiliza modelo, credenciales, límite por sesión y timeout existentes; no configura servicios nuevos. No habilitar por desplegar el código: ejecutar primero el piloto sintético de lectura y revisión.

