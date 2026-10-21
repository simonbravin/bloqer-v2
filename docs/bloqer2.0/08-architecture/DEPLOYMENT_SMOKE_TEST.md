# Post-deploy smoke test — Bloqer 2.0 (Phase 10D)

Run after first production (or staging) deploy, **before** announcing availability. Adapt steps if a feature is intentionally disabled in that environment.

**Prereqs:** migrations applied (`prisma migrate deploy`), env vars set per [`ENVIRONMENT_VARIABLES.md`](./ENVIRONMENT_VARIABLES.md), at least one user can sign in.

**Related:** for role-based training / UAT after UI freeze, use [`OPERATIONAL_SMOKE_CHECKLIST_BY_ROLE.md`](./OPERATIONAL_SMOKE_CHECKLIST_BY_ROLE.md) (J-02). This file stays focused on post-deploy technical checks.

## Regresión INDARI — fase 1 (pendiente de ejecutar)

No anunciar B02 como disponible hasta resolver P-IND-04 y acreditar el alias del portal (P-IND-03). Preparar los casos mutantes con fixtures sintéticos en un entorno de prueba autorizado; no usar los registros de Casa Hogar. Antes del deploy, verificar integración de adjudicación, concurrencia y anulación. Después del deploy autorizado, comprobar la versión publicada y el recorrido con datos de prueba acordados.

1. Escritorio y celular: SC enviada con dos líneas completas y cotizaciones vigentes. Seleccionar una; contador 1 de 2; **Generar órdenes seleccionadas** incluye solo esa línea y la otra queda libre. **Dejar pendiente** desmarca; con ninguna selección el botón queda deshabilitado. En celular comprobar selector y textos sin desborde a 360 px; en escritorio, matriz y teclado.
2. Seleccionar dos proveedores para dos líneas; verificar una OC por grupo. Doble envío no duplica adjudicación. Anular una OC deja libre solo su línea; la otra sigue vinculada. La cobertura de SC respeta BR-PUR-024. El atajo **Adjudicar libres → OC** conserva su alcance de todos los ítems libres de esa cotización.
3. Cotización: cantidad 2, unitario final 121 con IVA 21 %, descuento 10 % e IIBB 3 %. Neto 180,00; IVA 37,80; IIBB 5,40; total 223,20. Guardar y reabrir en modo neto conserva el resultado; no marcar de nuevo IVA incluido sin reingresar valores finales. La línea muestra 217,80 sin IIBB y la cotización 223,20 con IIBB. Verificar también IVA 0 legítimo con una cotización de prueba.
4. OC borrador: probar referencia ausente, unidad distinta, partida global y precio sobre referencia. Verificar mensajes por causa y acceso a **Editar → Justificación desvío**, conservando umbrales y permisos. Partida global no se compara como precio unitario. Revisar código/proveedor y **Ver solicitud de origen**; una OC directa no muestra un origen ficticio.
5. Consultar ayuda por «adjudicar algunos ítems», «precio con IVA» y «sin referencia presupuestaria»; verificar que guía, ayuda y respuestas documentales AI describan el mismo flujo. No usar estos checks para declarar resueltos OC-051 ni los datos históricos.

## Comprobaciones generales

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

## Run log

| Date | Env | Operator | Notes |
|---|---|---|---|
| 2026-08-08 | local + portal.bloqer.app | Cursor agent | Technical pass recorded in [`PHASE_5_ASVS_LITE.md`](./PHASE_5_ASVS_LITE.md). Cron auth OK locally after excluding `/api/cron/*` from session middleware; production deploy of that fix still required for Vercel cron. |


## Regresión INDARI — decimales y concurrencia (smoke UI pendiente)

Tras verificar el deployment y alias, en datos de prueba autorizados: abrir y guardar sin tocar un unitario de 4 dp; entrar/salir del campo sin cambios; editarlo a 4 dp; confirmar dinero a 2 dp y FX a 6. Cargar 1 × $10,00 con IVA incluido al 21% y sin descuento: total de línea $10,00 (IIBB se informa aparte). Reabrir con precio neto y cambiar solo notas: mantener total; cambiar cantidad o precio: recalcular. Probar en escritorio y celular.

Para concurrencia y datos sintéticos, usar `procurement-regression.live.test.ts` exclusivamente con el opt-in y las dos URLs a la DB aislada documentada en fase 0. Incluye panel OC/recepción simultáneos, cobertura parcial y resguardo de importes al editar. No ejecutar fixtures contra `neondb` ni `production`; el guard los rechaza.


## Regresión INDARI — fase 2 (smoke UI pendiente)

En entorno y datos de prueba autorizados, después del deploy:

1. Crear factura desde una OC parcialmente recibida, editar descripción y emitir. Conservar OC e ítems de origen, total y una única CxP. Repetir emitir no crea otra deuda.
2. Verificar una factura manual enlazada a cabecera sin ítems OC: panel y detalle explican que los importes están incluidos pero sus cantidades no se concilian por línea. No tratar el aviso como prueba de duplicación. La carga manual sigue permitida.
3. Borrador automático histórico de prueba con vínculo de línea ausente: emitir debe pedir revisión, sin crear CxP. No restaurar por descripción/importe ni usar datos reales como caso de prueba.
4. Usuario sin acceso a obra y contexto de otra empresa: no acceder al resumen, preview, listado ni avisos. Edición/anulación respetan el alcance existente.
5. NC parcial de factura pagada parcialmente: crédito reduce saldo sin nuevo pago ni movimiento. ND crea su CxP; no cambia cantidades recibidas. Reporte de devengado toma signos D-115.

Integración reproducible: `packages/services/src/ap/supplier-invoice-integrity.live.test.ts`, con el mismo opt-in y guard de DB aislada de fase 0. Tests de costos, saldos y cancelación forman parte de `pnpm test`. Sin fixtures mutables contra producción.
