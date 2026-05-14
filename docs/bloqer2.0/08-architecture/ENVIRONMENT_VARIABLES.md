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
| `R2_ACCOUNT_ID` | All five required together for `isStorageConfigured()`. |
| `R2_ACCESS_KEY_ID` | |
| `R2_SECRET_ACCESS_KEY` | |
| `R2_BUCKET_NAME` | |
| `R2_PUBLIC_URL` | **Opcional** para presigned flows. Un valor vacío se ignora (equivale a no definirla). Si está definida, debe ser URL `http(s)` válida. |

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
