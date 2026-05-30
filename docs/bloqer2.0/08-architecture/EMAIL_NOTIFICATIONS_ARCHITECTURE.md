# Email & notifications architecture — Bloqer 2.0

## Decisión

Enviar correos transaccionales con **Resend** cuando el proyecto tenga variables de entorno válidas. Las plantillas viven en **`@bloqer/email`** (HTML + texto plano en Phase 8E; React Email puede sustituir o complementar más adelante). Las **notificaciones in-app** siguen el modelo funcional ([`../02-modules/NOTIFICATIONS.md`](../02-modules/NOTIFICATIONS.md)); los **eventos** que disparan correo deben alinearse a [`../01-domain/EVENTS_AND_AUTOMATIONS.md`](../01-domain/EVENTS_AND_AUTOMATIONS.md) §4 y jobs ([`BACKGROUND_JOBS_ARCHITECTURE.md`](./BACKGROUND_JOBS_ARCHITECTURE.md)).

## Phase 8E — Foundation (implementado)

- **Config (`@bloqer/config`):** `isEmailConfigured()` y `getEmailEnv()` (retorna `null` si faltan o son inválidos `RESEND_API_KEY` + `RESEND_FROM_EMAIL`). No son obligatorias para arrancar la app; no se loguea la API key. `getPublicAppBaseUrl()` para enlaces absolutos en el cuerpo del mail (AUTH_URL, NEXT_PUBLIC_APP_URL, APP_URL).
- **Package (`@bloqer/email`):** `sendEmail({ to, subject, html, text, attachments? })` → `{ ok, provider: "resend" | "disabled", messageId?, error? }`. Si email no está configurado → `ok: true`, `provider: "disabled"` (no-op). Dependencia **`resend`** solo en este package. **Adjuntos (Phase 9C):** opcional `attachments: [{ filename, content, contentType }]` mapeado a la API de Resend (sin persistir el archivo).
- **Templates:** `notification-email.ts`, `operational-alert-email.ts` — título, cuerpo, marca Bloqer, CTA opcional, footer fijo; sin `storageKey` ni metadata interna.
- **Service (`notification-email.service.ts`):** `sendNotificationEmail`, `sendOperationalAlertEmail` (solo tipos operativos Phase 8B). Carga `Notification` por `tenantId`, valida destinatario con membresía ACTIVE, envía al **email del usuario** (`User.email`). El **Subject** del correo se deriva del título de la notificación con saneamiento de saltos de línea (mitigación básica de header injection). No muta la notificación, no marca leída, no crea filas nuevas. AuthZ: **recipient** o **OWNER** / **ADMIN** (`canRunOperationalAlerts`).
- **No envío automático** desde creación de notificación, runners 8C, ni cron 8D (evita spam accidental). Phase 8F puede conectar cron/eventos con preferencias y dedupe de entrega.
- **Schema 8E:** sin tabla de entregas; **Phase 9D** agrega `EmailDeliveryLog` para trazabilidad de emails enviados (ver sección 9D).

## Phase 9C — Envío manual de reportes por email (implementado)

- **Solo acción explícita del usuario** (“Enviar por email” en pantallas de reporte). **No** hay envío automático al exportar, **no** hay cron, **no** hay preferencias de frecuencia, **no** hay scheduler de reportes.
- **`sendReportByEmail`** (`packages/report-pdf/src/report-email.service.ts`): valida input (Zod), genera CSV o PDF con los mismos builders que Phase 9A/9B, nombre de archivo con `safeReportFilename`, llama a `sendEmail` con adjunto. Si `isEmailConfigured()` es falso → devuelve `ok: true`, `provider: "disabled"`, `skippedReason: "email_not_configured"` (la UI indica envío simulado / correo deshabilitado).
- **Sin** subir adjuntos a R2, **sin** `DocumentAttachment` para el flujo de reporte por email.
- **Phase 9D:** cada intento de envío de reporte queda en **`EmailDeliveryLog`** (`REPORT_MANUAL`, `PENDING` → `SENT` \| `SKIPPED` \| `FAILED`).
- **PDF** solo para AR aging, AP aging y control de costos (igual que 9B); el resto solo CSV por email.
- **Seguridad:** `recipientEmail` y `subject` validados/saneados en servidor; sin `tenantId` desde el cliente; mismos gates de permiso que las rutas `GET /api/reports/**`.

## Phase 9D — EmailDeliveryLog (foundation)

- **Modelo Prisma** `EmailDeliveryLog` (`tenantId`, `recipientEmail`, `subject`, `emailType`, `status`, `provider`, `providerMessageId`, `skippedReason`, `errorMessage`, vínculo opcional a entidad, `reportType`/`reportFormat` para reportes, `idempotencyKey` informativa, `metadata` acotado sin secretos).
- **Índices:** compuestos por tenant + fecha / destinatario / estado / tipo / entidad relacionada; **`@@index([tenantId, idempotencyKey])` sin `@@unique`** — no se bloquean reenvíos manuales por clave; dedupe duro queda para fases posteriores si el producto lo exige.
- **Servicio** `packages/services/src/email-delivery/email-delivery-log.service.ts`: `createEmailDeliveryLog`, `markEmailDeliverySent` \| `Skipped` \| `Failed`, `getEmailDeliveryLogById`, `listEmailDeliveryLogs`. Listado: solo **OWNER** / **ADMIN** (`canRunOperationalAlerts`).
- **`sendReportByEmail`:** crea fila `PENDING` antes de generar adjunto; `SKIPPED` + `email_not_configured` si Resend no está configurado; `SENT` / `FAILED` según `sendEmail`; `idempotencyKey` informativa por minuto (no bloquea reenvíos manuales).
- **`sendNotificationEmail` / `sendOperationalAlertEmail`:** registran cada intento (`NOTIFICATION` / `OPERATIONAL_ALERT`); skips tempranos crean fila `SKIPPED` con placeholder de email interno cuando no hubo destinatario real; **no** se activa envío automático al crear notificaciones in-app.
- **UI:** `/notificaciones/emails` — tabla con filtros básicos (OWNER/ADMIN).
- **Pendiente (fuera de 9D):** envío programado de reportes, preferencias por usuario, cola de reintentos, dedupe estricta por `idempotencyKey`.

## Justificación para Bloqer 2.0

- Aprobaciones, vencimientos de AR/AP, alertas operativas y recordatorios son **core** del día a día ([`../06-reports/`](../06-reports/), [`../03-finance/ACCOUNTS_RECEIVABLE.md`](../03-finance/ACCOUNTS_RECEIVABLE.md)).
- Resend encaja con despliegues tipo Vercel y dominios de envío verificados.
- Arranque local y previews sin credenciales Resend deben seguir siendo posibles (Q-009).

## Problemas que evita

- Emails **ad-hoc** sin trazabilidad ni diseño consistente.
- Mezclar **contenido** de email con strings en servicios sin plantilla.
- Caída del boot por variables de correo ausentes en desarrollo.

## Qué NO hacer

- No enviar email **síncrono** en la misma transacción crítica de pago/cobranza si puede bloquear — preferir **cola** o envío tras commit (según implementación).
- No incluir **datos sensibles** innecesarios (listados completos de proveedores, montos de otros tenants, etc.).
- No documentar **API keys** aquí.

## Modelo conceptual

- **Evento de dominio** → **Notification intent** (tenant, user(s), template, payload mínimo).
- **Idempotencia de entrega** por `event_id` / dedupe key (cuando exista log de entregas).
- **Preferencias** por usuario (futuro) sin romper obligatorias legales/seguridad.

## Pendientes (producto / técnico)

| ID | Descripción |
|----|-------------|
| **P-EMAIL-01** | **Phase 9D (base):** `EmailDeliveryLog` en Prisma + servicio + UI listado; ampliar con dedupe estricta / retención / export si hace falta |
| **P-EMAIL-02** | Preferencias por usuario (opt-in/opt-out por tipo de notificación) |
| **P-EMAIL-03** | Digest diario/semanal de no leídas |
| **P-EMAIL-04** | Cola de reintentos / worker para envíos fallidos |
| **P-EMAIL-05** | Envíos **programados** o digest que adjunten exportes server-side (CSV 9A; PDF subset 9B+), con cola/worker — **no** implementado; Phase **9C** cubre solo envío **manual** desde la app |

## Referencias funcionales

- [`../02-modules/NOTIFICATIONS.md`](../02-modules/NOTIFICATIONS.md)
- [`../01-domain/EVENTS_AND_AUTOMATIONS.md`](../01-domain/EVENTS_AND_AUTOMATIONS.md) §4
- [`../00-product/OPEN_QUESTIONS.md`](../00-product/OPEN_QUESTIONS.md) Q-009
- [`NOTIFICATIONS_ARCHITECTURE.md`](./NOTIFICATIONS_ARCHITECTURE.md) (in-app + puente 8E)

## Documentos técnicos relacionados

- [`BACKGROUND_JOBS_ARCHITECTURE.md`](./BACKGROUND_JOBS_ARCHITECTURE.md)
- [`DEPLOYMENT_PLAN.md`](./DEPLOYMENT_PLAN.md)
- [`OBSERVABILITY_ARCHITECTURE.md`](./OBSERVABILITY_ARCHITECTURE.md)
- [`SECURITY_ARCHITECTURE.md`](./SECURITY_ARCHITECTURE.md)
