# Background jobs architecture — Bloqer 2.0

## Decisión

Ejecutar trabajos **asíncronos** (recálculos, vencimientos, proyecciones, digest de notificaciones, envío de emails) fuera del **request crítico** del usuario, con **idempotencia**, **reintentos** y **trazabilidad**. Los jobs documentados funcionalmente en [`../01-domain/EVENTS_AND_AUTOMATIONS.md`](../01-domain/EVENTS_AND_AUTOMATIONS.md) §3.9 (p. ej. `recompute_overdue_receivables`) son **contratos de producto**: el mecanismo exacto (cron Vercel, cola externa) se elige en implementación sin cambiar el significado.

## Justificación para Bloqer 2.0

- Vencimientos AR/AP y RFIs, proyección de caja y alertas no deben depender de que un usuario abra una pantalla.
- Recálculos como **`receivable.overdue_detected`** y **`receivable.payment_status_recalculated`** ([D-031](../00-product/DECISION_LOG.md)) deben ser **confiables** ante fallos transitorios de red o deploys.

## Problemas que evita

- **Timeouts** en Server Actions al procesar grandes volúmenes.
- **Doble aplicación** de efectos si un job se re-ejecuta sin idempotencia.
- **Estado inconsistente** entre “pantalla dice X” y “job no corrió”.

## Qué NO hacer

- No usar jobs para **saltarse** reglas de negocio que deben ser **síncronas** en aprobaciones/pagos (p. ej. validar periodo cerrado [D-014](../00-product/DECISION_LOG.md)).
- No programar jobs **sin** `tenant_id` en el payload cuando el trabajo es tenant-scoped.
- No mezclar **lógica financiera nueva** solo en workers sin pasar por [`SERVICE_LAYER.md`](./SERVICE_LAYER.md).

## Tipos de trabajo (conceptual)

| Tipo | Ejemplos funcionales |
|---|---|
| **Programados** | `recompute_overdue_*`, `compute_cashflow_projection` |
| **Encolados por evento** | envío de email tras `collection.confirmed` (si async) |
| **Mantenimiento** | reindexación de vistas de reporte (si existen) |

## Referencias funcionales

- [`../01-domain/EVENTS_AND_AUTOMATIONS.md`](../01-domain/EVENTS_AND_AUTOMATIONS.md) §3.9, §4
- [`../02-modules/NOTIFICATIONS.md`](../02-modules/NOTIFICATIONS.md)
- [`../03-finance/CASHFLOW_PROJECTION.md`](../03-finance/CASHFLOW_PROJECTION.md)

## Documentos técnicos relacionados

- [`EMAIL_NOTIFICATIONS_ARCHITECTURE.md`](./EMAIL_NOTIFICATIONS_ARCHITECTURE.md)
- [`OBSERVABILITY_ARCHITECTURE.md`](./OBSERVABILITY_ARCHITECTURE.md)
- [`REPORTING_ARCHITECTURE.md`](./REPORTING_ARCHITECTURE.md)

## Cron implementado (Phase 8D)

- **Operational in-app alerts:** `POST` o `GET` `/api/cron/operational-alerts` — auth `CRON_SECRET` (`Authorization: Bearer` preferido, alternativa `x-cron-secret`); bucle por tenants `ACTIVE` (o un `tenantId` en query); delega en `packages/services` (`operational-alerts-cron.service.ts`). Sin cola de reintentos, sin lock distribuido, sin historial persistido de corridas; idempotencia sigue Phase 8B (ventana 7 días). Schedule en `apps/web/vercel.json`: `0 12 * * *` — ver root de Vercel en [`DEPLOYMENT_PLAN.md`](./DEPLOYMENT_PLAN.md). Detalle: [`NOTIFICATIONS_ARCHITECTURE.md`](./NOTIFICATIONS_ARCHITECTURE.md).
- **Reportes programados (17D):** `POST` o `GET` `/api/cron/scheduled-reports` — mismo `CRON_SECRET`; `scheduled-report-cron.service.ts` + runner con lock `runLockUntil` e idempotencia `REPORT_SCHEDULED`. Schedule: `5 * * * *`. Detalle: [`SCHEDULED_REPORTS_ARCHITECTURE.md`](./SCHEDULED_REPORTS_ARCHITECTURE.md).
