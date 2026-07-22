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

## Recipient strategy (Phase 8A + audience helper)

- **Only** `recipientUserId` with an **ACTIVE** `UserMembership` for the same `tenantId`.
- Shared helper: `resolveNotificationAudience` in `notification-audience.service.ts` ([D-054]):
  - `primaryUserIds` (creators / uploaders) filtered to ACTIVE membership
  - `permissionTargets` → union of `findActiveUsersForPermission`
  - **`alwaysCcOwnerAdmin` default true** — active OWNER/ADMIN always receive a copy
  - `excludeUserId` for the actor / supervisor
- Read/unread is **per recipient row**: marking read for user A does not affect user B’s copy.
- No project-scoped fan-out yet (no `ProjectMembership` model).

**Server-only** `createSystemNotification` also validates: optional **`projectId`** belongs to **`tenantId`**, and **`actionUrl`** is `null` or a same-origin path starting with `/` (not `//`).

## Recipient strategy (Phase 8B — operational alerts)

- Helpers live in `notification-audience.service.ts` (re-exported from `operational-alerts.service.ts`):
  - **`findActiveUsersForPermission(tenantId, action, module)`** — loads `UserMembership` **ACTIVE** for the tenant, keeps `userId` if `can(roles, action, module)` (from `@bloqer/domain`).
  - **`findActiveOwnerAdminUserIds(tenantId)`** — membership with role **OWNER** or **ADMIN**.
  - Runners resolve recipients via **`resolveNotificationAudience`** so OWNER/ADMIN are always included.
- Fan-out: one notification row per **(alert entity × recipient)**; no cross-tenant reads.

| Alert | Recipients |
|-------|------------|
| `RECEIVABLE_OVERDUE` | `VIEW AR` ∪ OWNER/ADMIN |
| `PAYABLE_OVERDUE` | `VIEW AP` ∪ OWNER/ADMIN |
| `NEGATIVE_STOCK` | `VIEW INVENTORY` ∪ OWNER/ADMIN |
| `CERTIFICATION_APPROVED_WITHOUT_INVOICE` | `VIEW AR` ∪ `VIEW CERTIFICATIONS` ∪ OWNER/ADMIN |
| `STALE_DOCUMENT_UPLOAD` | `uploadedBy` (ACTIVE) ∪ OWNER/ADMIN |

## Service layer — inbox (Phase 8A)

`packages/services/src/notifications/notification.service.ts`

| Function | Purpose |
|----------|---------|
| `createNotification` | Authenticated path; recipient must equal `ctx.actorUserId` |
| `createSystemNotification` | Internal; explicit `tenantId`; validates recipient membership, optional `projectId` in tenant, and `actionUrl` shape |
| `listMyNotifications` | Inbox for current user; filter `all` \| `unread` \| `read` \| `archived`; returns `{ items, total, page, pageSize }` (default **20**/page, max 50); **clamps** `page` to last valid page when out of range |
| `getUnreadNotificationCount` | Badge count |
| `getNotificationBellSnapshot` | `{ unreadCount, items }` — last 5 non-archived (`UNREAD`/`READ`) for the header dropdown |
| `markNotificationAsRead` | Own rows only |
| `markAllNotificationsAsRead` | Own `UNREAD` → `READ` |
| `archiveNotification` | Own `UNREAD`/`READ` → `ARCHIVED` |

Cross-tenant access is rejected. OWNER/ADMIN **cannot** read another user’s notifications (no admin inbox in 8A/8B).

Audience helper: `packages/services/src/notifications/notification-audience.service.ts` — `resolveNotificationAudience`, `findActiveUsersForPermission`, `findActiveOwnerAdminUserIds`.

## Service layer — operational alerts (Phase 8B)

`packages/services/src/notifications/operational-alerts.service.ts`

Invocable functions (same `ServiceContext` as the rest of services; **Phase 8C** expone runner manual; **Phase 8D** cron):

| Function | Detection (tenant-scoped) |
|----------|---------------------------|
| `runOverdueReceivablesAlert` | `Receivable` status `OPEN` \| `PARTIAL` \| `OVERDUE`; `balanceDue > 0`; **due date strictly before today (UTC calendar day)**; **materializa** `status → OVERDUE` cuando estaba `OPEN`/`PARTIAL`, luego notifica |
| `runOverduePayablesAlert` | Same pattern for `Payable` (materializa `OVERDUE` + notifica) |
| `runNegativeStockAlert` | Uses `listNegativeStockBalancesForTenant` (`stock-balance.service.ts`) — same aggregation as reports, **quantity &lt; 0** |
| `runApprovedCertificationsWithoutInvoiceAlert` | `Certification.status === APPROVED` and **no** `SalesInvoice` with `status === ISSUED` linked to that certification (draft/cancelled alone do not satisfy “con factura”) |
| `runStaleUploadingDocumentsAlert` | `DocumentAttachment.status === UPLOADING` and `createdAt` older than **1 hour**; does not delete or cancel (cleanup remains Phase 6C / separate flows); destinatarios vía `resolveNotificationAudience` (uploader ∪ OWNER/ADMIN) |

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

**Prod vs manual:** en producción las alertas corren **solas** vía cron diario (`0 12 * * *` = **12:00 UTC**) si `CRON_SECRET` está configurado. El panel UI es **opcional** (smoke, demos, reintento si el cron falló); no reemplaza el cron. Vencimientos AR/AP usan **día calendario UTC** (`isObligationOverdue` / `startOfTodayUtc`) — no timezone de usuario ni GMT−2.

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

**Vercel:** `apps/web/vercel.json` define cron diario `0 12 * * *` (**12:00 UTC**, ~09:00 ART) hacia esta ruta. El archivo solo lo aplica Vercel si el **root del proyecto** desplegado es `apps/web` (o equivalente en monorepo); si el root es la raíz del repo, hay que mover/replicar `crons` en el `vercel.json` efectivo o ajustar configuración en dashboard ([`DEPLOYMENT_PLAN.md`](./DEPLOYMENT_PLAN.md)). En Vercel, si configurás `CRON_SECRET` en el proyecto, las invocaciones programadas pueden enviar `Authorization: Bearer` automáticamente (ver documentación Vercel Cron).

**Overdue semantics:** `dueDate` estrictamente anterior al día calendario **UTC** de referencia; “vence hoy” (UTC) **no** es overdue. No hay timezone por tenant/usuario en esta fase.

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

- **Header (in-app “push” UX, [D-054]):** `NotificationBell` dropdown — last **5** non-archived notifications, badge **only when `unreadCount > 0`**, footer “Ver todas” → `/notificaciones`. Client polls `GET /api/notifications/bell` every **30s** while the tab is visible (pauses when hidden); also refreshes on open. Initial unread seed from SSR in `app/(app)/layout.tsx` (try/catch → `0`).
- **Page:** `/notificaciones` — filters, **pagination 20**/page (`?page=`), mark read / mark all read / archive, optional `actionUrl` link (defense-in-depth filter on render). No search in this phase. Access is via header bell (“Ver todas”); **no** Config sidebar item. Server actions revalidate `/notificaciones` and `/` layout so the SSR badge stays consistent after mutations.
- **Phase 8B:** new `NotificationType` values render like existing ones (title/body/severity badges).
- **Phase 8C:** `/notificaciones/alertas` — formularios que disparan `runOperationalAlertsDispatchAction` (todas o una alerta); muestra contadores y lista breve de mensajes de error (sin stack traces); tras éxito se llama `revalidatePath` de `/notificaciones` y `/notificaciones/alertas` para refrescar badge SSR en navegación posterior.

## Initial integrations (event → notification, Phase 8A)

Best-effort `try/catch` so core flows never fail if notification insert fails. Recipients via `resolveNotificationAudience` (OWNER/ADMIN CC; actor excluded):

1. **`confirmDocumentUpload`** — `DOCUMENT_UPLOAD_CONFIRMED` → `uploadedBy` ∪ OWNER/ADMIN; `actionUrl` when `projectId` present.
2. **`returnJobsiteLog`** — `JOBSITE_LOG_RETURNED` → `createdBy` ∪ OWNER/ADMIN; `body` includes a truncated return-notes snippet; `metadata` stores only `{ jobsiteLogId }`.
3. **`approveCertification`** — `CERTIFICATION_APPROVED` → `createdBy` ∪ OWNER/ADMIN (sin fan-out por `VIEW CERTIFICATIONS` hasta existir asignación a obra / `ProjectMembership`).

## Limitations (Phase 8A–8E + D-054)

- **Email:** Resend **opcional** (Phase 8E); la app arranca sin `RESEND_*`. No hay envío automático desde cron ni desde creación de notificación genérica (sí best-effort en procurement). **Phase 9D:** los intentos explícitos de email quedan en `EmailDeliveryLog`.
- No **browser Web Push**, no WebSocket/SSE (polling 30s only).
- Cron HTTP implementado (8D); **sin** cola de reintentos dedicada ni lock distribuido (dos invocaciones solapadas pueden correr en paralelo hasta que exista lock).
- No templates UI, **no per-user notification preferences**, no dedupe beyond the 7-day window above.
- No project-scoped routing (requires future `ProjectMembership`).
- Operational alerts: AR/AP overdue **do** set `status` to `OVERDUE` when OPEN/PARTIAL; other alerts (stock, stale upload, cert without invoice) do **not** mutate source entities (stale uploads remain alert-only; cleanup is separate).
- No persisted **run history** for manual operational alert executions (8C) **nor** for cron responses (8D).

## Pending (later phases)

- **Phase 8F+:** email desde cron / eventos con preferencias y dedupe de entrega
- Notification preferences & mute by type
- Stronger dedupe (e.g. entity-level digest) if product requires it
- Browser / mobile Web Push
- SSE/WebSocket realtime
- Project-scoped recipient routing
- New event types (collections, internal transfers, etc.) when product requires them

See also: [`02-modules/NOTIFICATIONS.md`](../02-modules/NOTIFICATIONS.md).
