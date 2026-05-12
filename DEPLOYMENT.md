# Deployment Guide

## Workflow

**dev → Vercel Preview → production**

1. Push feature branch → Vercel Preview builds automatically (uses Neon preview branch)
2. Merge to `main` → Vercel Production build (uses Neon `main` branch)
3. Never push schema changes directly to production without a migration

## Environment Variables

| Variable | dev | preview | prod | Notes |
|---|---|---|---|---|
| `AUTH_SECRET` | required | required | required | `openssl rand -base64 32` |
| `AUTH_URL` | optional | optional | required | Auto-detected in dev/preview |
| `AUTH_GOOGLE_ID` | optional | required | required | Google Cloud Console |
| `AUTH_GOOGLE_SECRET` | optional | required | required | Google Cloud Console |
| `DATABASE_URL` | required | required | required | Neon pooled connection string |
| `DIRECT_URL` | required | required | required | Neon direct (non-pooled) connection string |
| `SEED_USER_EMAIL` | seed only | — | — | Your dev email, only for `db:seed` |

### Local dev `.env.local`

```
AUTH_SECRET=<generate with openssl rand -base64 32>
DATABASE_URL=<Neon pooled URL for dev branch>
DIRECT_URL=<Neon direct URL for dev branch>
SEED_USER_EMAIL=your@email.com
```

## Neon Branch Strategy

- `main` branch → production database
- Vercel Preview deployments → Vercel + Neon integration creates a preview branch per PR automatically
- Local dev → use the Neon `dev` branch (create once, reuse)

## Schema Changes

| Scenario | Command |
|---|---|
| Local dev iteration | `pnpm --filter @bloqer/database db:push` |
| Production-ready change | `pnpm --filter @bloqer/database db:migrate` (generates migration file, commit it) |
| Generate Prisma client after schema change | `pnpm --filter @bloqer/database db:generate` |

Never use `db:push` on production. Always use migrations for production schema changes.

## Vercel Build Command

```
cd ../.. && pnpm build --filter @bloqer/web
```

Set in Vercel project settings → Build & Development Settings → Build Command.

## Preview Deployment Checklist

- [ ] `DATABASE_URL` and `DIRECT_URL` point to Neon preview branch (via Neon-Vercel integration)
- [ ] `AUTH_SECRET` set in Vercel environment (preview)
- [ ] `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` set in Vercel environment (preview)
- [ ] `AUTH_URL` set to the preview URL if OAuth redirect fails
- [ ] Schema is in sync: run `db:push` or ensure migration was applied

## Seed (dev only)

```bash
SEED_USER_EMAIL=your@email.com pnpm --filter @bloqer/database db:seed
```

Creates: 1 tenant (`demo`), 1 company (`Demo Company`), 1 user membership with `OWNER` role.
