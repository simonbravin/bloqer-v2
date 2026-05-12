# In-app notifications architecture (Phase 8A–9D)

## Model (`Notification`)

Persisted in Postgres via Prisma (`packages/database/prisma/schema.prisma`).

| Field | Notes |
|-------|--------|
| `tenantId` | Required; all queries scoped by tenant |
| `companyId` | Optional context |
| `recipientUserId` | Nullable in DB for future broadcast/role routing; **Phase 8A creates** always pass a non-empty id and `createSystemNotification` rejects empty recipients |
| `type` | `NotificationType` enum (extensible — see Phase 8B below) |
| `title` / `body` | Spanish copy from services |
| `severity` | `INFO` \| `SUCCESS` \| `WARNING` \| `ERROR` |
| `status` | `UNREAD` \| `READ` \| `ARCHIVED` — no hard delete |
| `linkedEntityType` / `linkedEntityId` | Optional; uses domain `LinkedEntityType` |
| `projectId` | Optional FK for filtering / future UX |
| `actionUrl` | Relative in-app path only (`/…`); validated on write (`//`, schemes rejected); UI applies the same rule when rendering links |
| `metadata` | JSON; optional; keep minimal (avoid duplicating long free-text already in `body`) |
| `readAt` / `archivedAt` | Set on transitions |

Indexes: `[tenantId, recipientUserId, status, createdAt]`, `[tenantId, projectId, createdAt]`, `[tenantId, linkedEntityType, linkedEntityId]`.

### `NotificationType` values

**Phase 8A (event-driven):** `DOCUMENT_UPLOAD_CONFIRMED`, `JOBSITE_LOG_RETURNED`, `CERTIFICATION_APPROVED`.

**Phase 8B (operational alerts):** `RECEIVABLE_OVERDUE`, `PAYABLE_OVERDUE`, `NEGATIVE_STOCK`, `CERTIFICATION_APPROVED_WITHOUT_INVOICE`, `STALE_DOCUMENT_UPLOAD`.

## Recipient strategy (Phase 8A)

- **Only** `recipientUserId` with an **ACTIVE** `UserMembership` for the same `tenantId`.
- No broadcast, no `recipientRole`, no fan-out in 8A event hooks.

**Server-only** `createSystemNotification` also validates: optional **`projectId`** belongs to **`tenantId`**, and **`actionUrl`** is `null` or a same-origin path starting with `/` (not `//`).

## Recipient strategy (Phase 8B — operational alerts)

- Helpers in `operational-alerts.service.ts`:
  - **`findActiveUsersForPermission(tenantId, action, module)`** — loads `UserMembership` **ACTIVE** for the tenant, keeps `userId` if `can(roles, action, module)` (from `@bloqer/domain`).
  - **`findActiveOwnerAdminUserIds(tenantId)`** — fallback for stale uploads when `uploadedBy` is empty (membership with role **OWNER** or **ADMIN**).
- Fan-out: one notification row per **(alert entity × recipient)**; no cross-tenant reads.

| Alert | Recipients |
|-------|------------|
| `RECEIVABLE_OVERDUE` | `VIEW AR` (ceiling ≥ VIEW covers EDIT/APPROVE) |
| `PAYABLE_OVERDUE` | `VIEW AP` |
| `NEGATIVE_STOCK` | `VIEW INVENTORY` |
| `CERTIFICATION_APPROVED_WITHOUT_INVOICE` | `VIEW AR` ∪ `VIEW CERTIFICATIONS` (deduped user ids) |
| `STALE_DOCUMENT_UPLOAD` | `uploadedBy` solo si tiene **membresía ACTIVE** en el tenant; si no, OWNER/ADMIN activos |

## Service layer — inbox (Phase 8A)

`packages/services/src/notifications/notification.service.ts`

| Function | Purpose |
|----------|---------|
| `createNotification` | Authenticated path; recipient must equal `ctx.actorUserId` |
| `createSystemNotification` | Internal; explicit `tenantId`; validates recipient membership, optional `projectId` in tenant, and `actionUrl` shape |
| `listMyNotifications` | Inbox for current user; filter `all` \| `unread` \| `read` \| `archived` |
| `getUnreadNotificationCount` | Badge count |
| `markNotificationAsRead` | Own rows only |
| `markAllNotificationsAsRead` | Own `UNREAD` → `READ` |
| `archiveNotification` | Own `UNREAD`/`READ` → `ARCHIVED` |

Cross-tenant access is rejected. OWNER/ADMIN **cannot** read another user’s notifications (no admin inbox in 8A/8B).

## Service layer — operational alerts (Phase 8B)

`packages/services/src/notifications/operational-alerts.service.ts`

Invocable functions (same `ServiceContext` as the rest of services; **Phase 8C** expone runner manual; **Phase 8D** cron):

| Function | Detection (tenant-scoped) |
|----------|---------------------------|
| `runOverdueReceivablesAlert` | `Receivable` status `OPEN` \| `PARTIAL` \| `OVERDUE`; `balanceDue > 0`; **due date strictly before today (UTC calendar day)**; does not mutate `Receivable.status` |
| `runOverduePayablesAlert` | Same pattern for `Payable` |
| `runNegativeStockAlert` | Uses `listNegativeStockBalancesForTenant` (`stock-balance.service.ts`) — same aggregation as reports, **quantity &lt; 0** |
| `runApprovedCertificationsWithoutInvoiceAlert` | `Certification.status === APPROVED` and **no** `SalesInvoice` with `status === ISSUED` linked to that certification (draft/cancelled alone do not satisfy “con factura”) |
| `runStaleUploadingDocumentsAlert` | `DocumentAttachment.status === UPLOADING` and `createdAt` older than **1 hour**; does not delete or cancel (cleanup remains Phase 6C / separate flows); destinatario: uploader con membresía ACTIVE o fallback OWNER/ADMIN |

Each runner returns **`OperationalAlertRunSummary`**: `checkedCount`, `createdCount`, `skippedCount`, `errors[]`. Per notification attempt is wrapped so one failure does not abort the run.

### Idempotency (Phase 8B)

No new Prisma constraints. Before insert, skip if a row exists with:

- same `tenantId`, `type`, `linkedEntityType`, `linkedEntityId`, `recipientUserId`
- `status !== ARCHIVED`
- `createdAt` within the **last 7 days**

Counts: **skipped** = duplicate suppressed; **created** = new row; **errors** = message from failed `createSystemNotification` (e.g. recipient sin membresía activa).

**Linked keys:** AR → `SALES_INVOICE` + `salesInvoiceId`; AP → `SUPPLIER_INVOICE` + `supplierInvoiceId`; certification gap → `CERTIFICATION` + certification id; negative stock → `OTHER` + synthetic `negstock:…`; stale upload → `OTHER` + document id.

## Service layer — operational alerts runner (Phase 8C)

`packages/services/src/notifications/operational-alerts-runner.service.ts`

| Export | Purpose |
|--------|---------|
| `canRunOperationalAlerts(ctx)` | `true` only if `ctx.roles` includes **OWNER** or **ADMIN** (manual runner / future cron guard) |
| `runOperationalAlert(alertType, ctx)` | Single job; `alertType` ∈ `overdueReceivables` \| `overduePayables` \| `negativeStock` \| `approvedCertificationsWithoutInvoice` \| `staleUploadingDocuments` |
| `runAllOperationalAlerts(ctx)` | Runs all five in sequence; returns per-run results + aggregated totals (`checkedCount`, `createdCount`, `skippedCount`, `errorCount`) |

**UI:** `/notificaciones/alertas` — Server Actions only (no public API route). **OWNER/ADMIN** only; otros usuarios reciben `notFound()`. Enlace desde `/notificaciones` solo si `canRunOperationalAlerts`. Enlace a `/notificaciones/emails` (historial de envíos de email, Phase 9D). No historial de corridas de alertas persistido; resultado mostrado solo en pantalla tras el submit. El `tenantId` sale **solo** de la sesión (`getCurrentUser` → `tenantCtx`); el bucle multi-tenant vive en **Phase 8D** (cron).

## Service layer — operational alerts cron (Phase 8D)

`packages/services/src/notifications/operational-alerts-cron.service.ts`

| Export | Purpose |
|--------|---------|
| `runOperationalAlertsForTenant(tenantId)` | Ejecuta las cinco alertas para un tenant **ACTIVE**; sin sesión; si no existe o no está activo → `tenantsProcessed: 0`, `tenants: []` |
| `runOperationalAlertsForAllActiveTenants()` | Itera `Tenant` con `status: ACTIVE`; un tenant que falle no detiene el restante |

Contexto de sistema: `buildOperationalAlertsCronServiceContext` + `runAllOperationalAlertsForSystemContext` en `operational-alerts-runner.service.ts` (actor sentinel `system:operational-alerts-cron`; los runners 8B solo usan `ctx.tenantId`). Sin chequeo OWNER/ADMIN — la **autorización es solo** `CRON_SECRET` en la ruta HTTP.

**HTTP:** `POST` o `GET` `/api/cron/operational-alerts`

- **Auth (obligatoria):** `Authorization: Bearer <CRON_SECRET>` **o** header `x-cron-secret: <CRON_SECRET>` (comparación *timing-safe* cuando las longitudes coinciden; si difieren → rechazo sin llamar a `timingSafeEqual`). Si enviás ambos headers, gana **`Authorization`** (se ignora `x-cron-secret`).
- **Env:** `CRON_SECRET` en variables de entorno (`@bloqer/config` → `getOperationalAlertsCronSecret()`). Mínimo **16 caracteres**; si falta o es corto → **503** `cron_unconfigured` y **no** se ejecuta nada (dev y prod).
- **Query opcional:** `?tenantId=<uuid>` — solo con secreto válido; filtra a ese tenant ACTIVE.
- **Respuesta JSON (sin PII):** `ok`, `tenantsProcessed`, `totals` { `checkedCount`, `createdCount`, `skippedCount`, `errorCount` }, `tenants[]` { `tenantId`, `ok`, mismos contadores }. Sin nombres de cliente/proyecto, sin `storageKey`, sin metadata, sin stack traces. Códigos de error genéricos: `unauthorized`, `cron_unconfigured`, `invalid_tenant_id`.

**Idempotencia:** sin lógica nueva; sigue Phase 8B (ventana 7 días, etc.). El cron puede ejecutarse varias veces al día sin duplicar dentro de la ventana.

**Vercel:** `apps/web/vercel.json` define cron diario `0 12 * * *` hacia esta ruta. El archivo solo lo aplica Vercel si el **root del proyecto** desplegado es `apps/web` (o equivalente en monorepo); si el root es la raíz del repo, hay que mover/replicar `crons` en el `vercel.json` efectivo o ajustar configuración en dashboard ([`DEPLOYMENT_PLAN.md`](./DEPLOYMENT_PLAN.md)). En Vercel, si configurás `CRON_SECRET` en el proyecto, las invocaciones programadas pueden enviar `Authorization: Bearer` automáticamente (ver documentación Vercel Cron).

**Limitaciones 8D:** sin historial persistido de corridas, sin cola de reintentos, sin lock distribuido, sin email **automático** (Phase 8E deja envío solo vía servicio explícito), sin preferencias, sin realtime.

## Email bridge (Phase 8E — foundation; Phase 9D — delivery log)

- **Package:** `@bloqer/email` — `sendEmail()` → Resend cuando `isEmailConfigured()`; si no hay `RESEND_*` válidos → `provider: "disabled"`, sin lanzar.
- **Templates:** HTML + texto plano (`notification-email`, `operational-alert-email`); sin `metadata` ni `storageKey`; CTA solo si `getPublicAppBaseUrl()` devuelve URL (AUTH_URL / NEXT_PUBLIC_APP_URL / APP_URL).
- **Service:** `notification-email.service.ts` — `sendNotificationEmail`, `sendOperationalAlertEmail` (solo tipos Phase 8B); no muta la fila `Notification`, no marca leída, no crea nuevas filas.
- **AuthZ:** destinatario de la notificación o **OWNER** / **ADMIN** (misma regla que runner manual vía `canRunOperationalAlerts`).
- **No envío automático** desde runners 8C, ni desde cron 8D (Phase 8F + preferencias / dedupe).
- **Phase 9D — `EmailDeliveryLog`:** cada invocación de `sendNotificationEmail` / `sendOperationalAlertEmail` deja trazabilidad en DB (`NOTIFICATION` / `OPERATIONAL_ALERT`, estados `PENDING` \| `SENT` \| `SKIPPED` \| `FAILED`). **No** implica envío automático al insertar notificaciones in-app. Ampliaciones (preferencias, cola, dedupe estricta): ver [`EMAIL_NOTIFICATIONS_ARCHITECTURE.md`](./EMAIL_NOTIFICATIONS_ARCHITECTURE.md).
- **UI:** `/notificaciones/emails` — listado de logs (OWNER/ADMIN); enlace desde `/notificaciones` y `/notificaciones/alertas`. Sin botón masivo “enviar todas” en esta fase.

## Permissions

- **NOT** gated on `VIEW NOTIFICATIONS` for the personal inbox (that module remains for future admin/settings).
- Any user with active tenant context can list and mutate **their** notifications.
- **Phase 8C:** ejecutar runners operativos manualmente requiere rol **OWNER** o **ADMIN** en la membresía activa; no alcanza `VIEW NOTIFICATIONS` ni permisos de AR/AP/inventario.
- **Phase 8D:** el endpoint cron **no** usa sesión; solo `CRON_SECRET` (y opcional `tenantId` en query). No está pensado para navegadores de usuario final.
- **Phase 8E:** envío por correo solo vía `sendNotificationEmail` / `sendOperationalAlertEmail` cuando Resend está configurado; sin ruta pública dedicada en esta fase; destinatario de la notificación o OWNER/ADMIN.
- **Phase 9D:** historial de intentos de email en `/notificaciones/emails` (OWNER/ADMIN); ver `listEmailDeliveryLogs` en `email-delivery-log.service.ts`.

- **Header:** bell + unread badge + link to `/notificaciones`. Badge count is loaded in `app/(app)/layout.tsx` with **try/catch** so DB errors do not break the shell (count falls back to `0`).
- **Page:** `/notificaciones` — filters, mark read / mark all read / archive, optional `actionUrl` link (defense-in-depth filter on render). Server actions catch service errors so invalid ids do not surface as unhandled exceptions.
- **Phase 8B:** new `NotificationType` values render like existing ones (title/body/severity badges).
- **Phase 8C:** `/notificaciones/alertas` — formularios que disparan `runOperationalAlertsDispatchAction` (todas o una alerta); muestra contadores y lista breve de mensajes de error (sin stack traces); tras éxito se llama `revalidatePath` de `/notificaciones` y `/notificaciones/alertas` para refrescar badge SSR en navegación posterior.

## Initial integrations (event → notification, Phase 8A)

Best-effort `try/catch` so core flows never fail if notification insert fails.

1. **`confirmDocumentUpload`** — `DOCUMENT_UPLOAD_CONFIRMED` → `uploadedBy`; `actionUrl` when `projectId` present.
2. **`returnJobsiteLog`** — `JOBSITE_LOG_RETURNED` → `createdBy` if distinct from supervisor; `body` includes a truncated return-notes snippet; `metadata` stores only `{ jobsiteLogId }`.
3. **`approveCertification`** — `CERTIFICATION_APPROVED` → `createdBy` if distinct from approver.

## Limitations (Phase 8A–8E)

- **Email:** Resend **opcional** (Phase 8E); la app arranca sin `RESEND_*`. No hay envío automático desde cron ni desde creación de notificación. **Phase 9D:** los intentos explícitos de email quedan en `EmailDeliveryLog`.
- No push, no WebSocket/SSE.
- Cron HTTP implementado (8D); **sin** cola de reintentos dedicada ni lock distribuido (dos invocaciones solapadas pueden correr en paralelo hasta que exista lock).
- No templates UI, **no per-user notification preferences**, no dedupe beyond the 7-day window above.
- Badge count is **SSR snapshot** per layout load (not realtime).
- Operational alerts do **not** auto-clean or mutate source entities; stale uploads are **alert-only** here (cleanup is separate).
- No persisted **run history** for manual operational alert executions (8C) **nor** for cron responses (8D).

## Pending (later phases)

- **Phase 8F+:** email desde cron / eventos con preferencias y dedupe de entrega
- Notification preferences & mute by type
- Stronger dedupe (e.g. entity-level digest) if product requires it
- Mobile push
- Realtime delivery
- Broadcast or role-based routing with explicit product rules beyond permission fan-out

See also: [`02-modules/NOTIFICATIONS.md`](../02-modules/NOTIFICATIONS.md).
