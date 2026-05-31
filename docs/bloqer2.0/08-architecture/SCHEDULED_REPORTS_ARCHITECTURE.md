# Reportes programados por email — Phase 17B+

## Phase 17B (implementado)

- **Alcance:** persistencia y CRUD de configuración únicamente.
- **Tablas:** `scheduled_reports`, `scheduled_report_items`, `scheduled_report_recipients`.
- **No incluye:** cron, `sendEmail`, export builders, filas `EmailDeliveryLog` (`REPORT_SCHEDULED`), destinatarios externos.
- **Permisos:** OWNER / ADMIN (`canManageScheduledReports`).
- **UI:** `/configuracion/reportes` (+ listado por proyecto en `/proyectos/[id]/reportes/programados`).
- **Migración:** `20260530120000_phase_17b_scheduled_reports` — usar `prisma migrate deploy`, no `db:push`.

## Reglas de producto (17B)

| Regla | Implementación |
|-------|----------------|
| Scope TENANT | `projectId` null; solo claves `TENANT_*` |
| Scope PROJECT | `projectId` obligatorio; solo claves `PROJECT_*` |
| Sin mezcla de scopes en un schedule | Validación Zod + registry |
| Destinatarios | Solo `UserMembership` ACTIVE del tenant |
| `nextRunAt` | Calculado en servicio (`calculateNextRunAt`); nunca null |
| Timezone | Default `tenant.timezone` |

## Phase 17C (implementado)

- **UI pulido:** listado y detalle sin mensajes de “solo configuración”; columnas última corrida / resultado.
- **Panel de estado** en `/configuracion/reportes/[id]`: próxima ejecución, última corrida, `lastRunStatus`, enlaces al historial global.
- **Historial de ejecuciones:** agrupado por corrida (`runId` / `runWindow` en metadata de `EmailDeliveryLog`) + tabla de últimos intentos por destinatario.
- **Servicio:** `listScheduledReportEmailDeliveries`, `groupScheduledReportDeliveriesIntoRuns`.
- **Filtro global:** `/notificaciones/emails?scheduledReportId=` + `emailType=REPORT_SCHEDULED`.

## Phase 17D (implementado)

- **HTTP:** `GET` / `POST` `/api/cron/scheduled-reports` — mismo `CRON_SECRET` que alertas operativas (≥16 chars); opcional `?tenantId=`.
- **Vercel Cron:** `5 * * * *` (cada hora, minuto 5) en `apps/web/vercel.json`.
- **Runner:** `scheduled-report-runner.service.ts` — due `ACTIVE` + `nextRunAt <= now`, lock `runLockUntil` 10 min, bundle **un email / destinatario** con N adjuntos (CSV/PDF según config).
- **Exportes:** reutiliza `export*Csv` (`@bloqer/services`) y `buildScheduledReportPdfAttachment` (`@bloqer/report-pdf`); gates de módulo en corrida.
- **Logs:** `EmailDeliveryLog` `REPORT_SCHEDULED`, `relatedEntityType` `SCHEDULED_REPORT`, idempotencia `scheduled:{scheduleId}:{runWindow}:{email}` (índice único parcial 17B).
- **Sin** cola de reintentos automáticos ni destinatarios externos.

## Phase 17E — Cierre operativo (implementado)

- **Ejecutar ahora** (OWNER/ADMIN): envío manual inmediato; idempotencia `scheduled-manual:…`; **no** mueve `nextRunAt`.
- **Reintentar fallidos**: reenvío a destinatarios con `EmailDeliveryLog` `FAILED` (últimos 7 días); clave `scheduled-retry:…`; disponible con envío ACTIVE o PAUSED.
- **Fuera de alcance deliberado** (no implementar sin ADR + producto):

| Ítem | Motivo |
|------|--------|
| Destinatarios externos (`externalEmail`) | Decisión 17B: solo membresía ACTIVE |
| Cola / worker de reintentos | P-EMAIL-04; cron horario + reintento manual alcanza MVP |
| ZIP / multi-paquete | Phase 9D+ / digest |
| Preferencias por usuario | P-EMAIL-02 |
| Reintento automático en fallo Resend | Evita spam; usar “Reintentar fallidos” |

## Checklist de prueba manual (pre-producción)

1. `pnpm --filter @bloqer/database db:migrate:deploy` aplicado en el entorno.
2. `CRON_SECRET` ≥ 16 chars en Vercel + local.
3. Crear envío ACTIVE con 1 reporte + 1 destinatario (OWNER).
4. **Ejecutar ahora** en detalle → historial con `deliveryKind: manual` y correo (o `SKIPPED` si Resend off).
5. `GET /api/cron/scheduled-reports` con Bearer → JSON `schedulesProcessed` ≥ 0 cuando `nextRunAt` vencido.
6. `/notificaciones/emails?emailType=REPORT_SCHEDULED&scheduledReportId=` filtra el envío.

## Referencias

- [`REPORTING_ARCHITECTURE.md`](./REPORTING_ARCHITECTURE.md)
- [`EMAIL_NOTIFICATIONS_ARCHITECTURE.md`](./EMAIL_NOTIFICATIONS_ARCHITECTURE.md)
- [`REPORTING_ERD_GUARDRAILS.md`](./REPORTING_ERD_GUARDRAILS.md)
