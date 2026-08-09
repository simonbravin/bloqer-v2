# ASVS-lite checklist (Phase 5 closeout)

Short OWASP ASVS-inspired pass for MVP. Record date/environment when run on staging.

| # | Control | Status / note |
|---|---|---|
| 1 | Auth required on app shell (middleware redirects unauthenticated) | **PASS** 2026-08-08 — `/dashboard` → 307 `/login` (local + `portal.bloqer.app`) |
| 2 | Secrets only in env (Vercel/hosting); never committed | `.env*` gitignored; see `ENVIRONMENT_VARIABLES.md` |
| 3 | Cron routes reject missing/wrong `CRON_SECRET` | **PASS** 2026-08-08 — missing/wrong → 401 `unauthorized`; valid → 200 (local with `.env`) |
| 4 | Tenant gate on finance mutations (`assertResourceTenant` / equivalent) | Suite `finance-tenant-isolation.test.ts` + service patches |
| 5 | No float money paths in services (Decimal / roundMoney) | [D-053] / existing money tests |
| 6 | Structured logs include `requestId` (tenantId when available in RSC/actions) | **PASS** local — response `x-request-id` + JSON `http_request` log |

**Staging smoke:** run [`DEPLOYMENT_SMOKE_TEST.md`](./DEPLOYMENT_SMOKE_TEST.md) once per release candidate and record who/when below.

| Date | Env | Operator | Result |
|---|---|---|---|
| 2026-08-08 | local (`dotenv -e .env` → Neon) + boots en `portal.bloqer.app` | Cursor agent | **PASS técnico** — #1 boots, auth gate 307, `x-request-id`, cron #15–16→401 / #17→200 (`tenantsProcessed:1`, `createdCount:7`), sched #18→401 / #19→200, #17b `vercel.json`. Portal `/login` 200. **Hallazgo:** prod aún redirige `/api/cron/*` al login (sesión); fix local: middleware trata `/api/cron/` como público — **deploy pendiente**. UI autenticada #2–14 / #20–21 no corrida (sin credenciales de sesión en el agente). |
