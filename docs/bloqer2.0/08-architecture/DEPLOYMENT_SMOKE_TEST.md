# Post-deploy smoke test — Bloqer 2.0 (Phase 10D)

Run after first production (or staging) deploy, **before** announcing availability. Adapt steps if a feature is intentionally disabled in that environment.

**Prereqs:** migrations applied (`prisma migrate deploy`), env vars set per [`ENVIRONMENT_VARIABLES.md`](./ENVIRONMENT_VARIABLES.md), at least one user can sign in.

**Related:** for role-based training / UAT after UI freeze, use [`OPERATIONAL_SMOKE_CHECKLIST_BY_ROLE.md`](./OPERATIONAL_SMOKE_CHECKLIST_BY_ROLE.md) (J-02). This file stays focused on post-deploy technical checks.

| # | Check | Pass criteria |
|---|--------|----------------|
| 1 | App boots | Home/login loads without 500; no crash loop. |
| 2 | Login | Google (or configured provider) completes; session persists. |
| 3 | Tenant context | `/dashboard` loads with tenant; navigation shows expected modules for role. |
| 4 | Platform link | `/platform` link visible **only** for platform superadmin; other users never see it. |
| 5 | Directory | Create a **contact** (or open list + create) without error. |
| 6 | Projects | Create **project** or open existing; detail loads. |
| 7 | Budget / WBS | Open project **budget** or WBS route; page loads (create if product allows). |
| 8 | Documents | Upload flow: either R2 path works or **placeholder / disabled** behavior is clear and non-fatal. |
| 9 | Invitations | Create invitation (equipo); accept flow on `/invitaciones/aceptar` with matching email; membership appears. |
| 10 | Notifications | `/notificaciones` inbox loads; badge if applicable. |
| 11 | CSV export | Trigger a **CSV** report export from UI or `GET /api/reports/...` as documented; file downloads. |
| 12 | PDF export | Al menos **un reporte corporativo** (`GET /api/reports/finanzas/ar-aging.csv?format=pdf`) y **uno de proyecto** (`GET /api/reports/proyectos/{id}/ingresos-gastos.csv?format=pdf`) descargan PDF válido (`%PDF`); encabezado muestra tenant/empresa y pie paginación. |
| 13 | Email disabled | With Resend **off**, app still boots; invitation copy-link or transactional email skips gracefully. |
| 14 | Email enabled | With Resend **on** + public base URL, a test email sends (optional in staging). |
| 15 | Cron secret | `GET` or `POST` `/api/cron/operational-alerts` **without** `CRON_SECRET` (or too short) → **503** `cron_unconfigured`. |
| 16 | Cron wrong secret | Same route with wrong Bearer / `x-cron-secret` → **401** `unauthorized`. |
| 17 | Cron success | Same route with correct secret → **200** JSON with `ok`, `tenantsProcessed`, `totals` (`checkedCount`, `createdCount`, `skippedCount`, `errorCount`). |
| 17b | Cron schedule in Vercel | Project cron `0 12 * * *` (12:00 UTC) targets `/api/cron/operational-alerts`. Confirm deploy **root** is `apps/web` (or the effective `vercel.json` that Vercel resolves includes this `crons` entry). `CRON_SECRET` in Vercel env matches what the scheduled job sends (`Authorization: Bearer`). |
| 17c | Cron effect (optional staging) | With a test AR past due (OPEN/PARTIAL, balance &gt; 0): after a successful run, receivable `status` is `OVERDUE` and an in-app `RECEIVABLE_OVERDUE` exists for a VIEW AR / OWNER-ADMIN user — **or** `totals.skippedCount` increases if within the 7-day dedupe window. |
| 18 | Scheduled reports cron | `GET` or `POST` `/api/cron/scheduled-reports` without secret → **503**; wrong secret → **401**. |
| 19 | Scheduled reports run | With `CRON_SECRET`, route returns **200** JSON (`tenantsProcessed`, `totals.sent`, …). |
| 20 | Scheduled reports UI | OWNER/ADMIN: crear envío en `/configuracion/reportes`, **Ejecutar ahora**, ver fila en historial (`REPORT_SCHEDULED`). |
| 21 | Notifications inbox UX | `/notificaciones` paginates (20/page); `?page=` beyond range still shows last page (no empty false-negative). Severity badges in Spanish (Info / Éxito / Aviso / Error). |

Record who ran the checklist, date, and environment.
