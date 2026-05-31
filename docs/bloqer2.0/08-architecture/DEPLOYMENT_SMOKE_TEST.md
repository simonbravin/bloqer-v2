# Post-deploy smoke test — Bloqer 2.0 (Phase 10D)

Run after first production (or staging) deploy, **before** announcing availability. Adapt steps if a feature is intentionally disabled in that environment.

**Prereqs:** migrations applied (`prisma migrate deploy`), env vars set per [`ENVIRONMENT_VARIABLES.md`](./ENVIRONMENT_VARIABLES.md), at least one user can sign in.

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
| 17 | Cron success | Same route with correct secret → **200** JSON with run summary. |
| 18 | Scheduled reports cron | `GET` or `POST` `/api/cron/scheduled-reports` without secret → **503**; wrong secret → **401**. |
| 19 | Scheduled reports run | With `CRON_SECRET`, route returns **200** JSON (`tenantsProcessed`, `totals.sent`, …). |
| 20 | Scheduled reports UI | OWNER/ADMIN: crear envío en `/configuracion/reportes`, **Ejecutar ahora**, ver fila en historial (`REPORT_SCHEDULED`). |

Record who ran the checklist, date, and environment.
