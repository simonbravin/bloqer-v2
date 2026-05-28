# Platform superadmin — Phase 10A+ (provisioning & invitations)

## Purpose

Cross-tenant **platform** operations (list tenants, provision organizations, invite users, adjust SaaS metadata, suspend, module toggles) are separate from **tenant RBAC** (`OWNER`, `ADMIN`, module permissions). No tenant role grants platform access.

## Access model (OR, never AND)

A user is a **platform superadmin** if **either**:

1. Their normalized email is listed in `PLATFORM_SUPERADMIN_EMAILS` (comma-separated, optional env; parsed with Zod per segment; invalid segments skipped; app boots if unset), **or**
2. They have an **active** `PlatformAdmin` row (`userId`, `active: true`).

**Never** infer platform access from `UserMembership` roles or `can()`.

Implementation: `isPlatformSuperadmin` / `assertPlatformAccess` in `packages/services/src/platform/platform-auth.service.ts`.

## Data model (Prisma)

- **`PlatformAdmin`**: durable grant (`userId`, `active`, timestamps). Bootstrap can use env allowlist until rows exist.
- **`PlatformAuditLog`**: append-only (`id`, `actorUserId`, `action`, `targetTenantId` nullable, `metadata` JSON nullable, `createdAt`). No hard delete in product code.
- **`Tenant`** SaaS fields (internal billing posture, not a payment provider): `saasPlan` (default `"trial"`), `subscriptionStatus` (`SubscriptionStatus` enum), `trialEndsAt`, `billingCustomerId` (placeholder string), `suspendedReason`, `platformInternalNotes`.
- **`TenantModuleSetting`** (Phase **12B**): por tenant, `moduleKey` (string validado contra `PermissionModule`), `isEnabled`, `internalNotes`; único `(tenantId, moduleKey)`. Sin fila ⇒ módulo tratado como habilitado en lectura. Solo mutaciones desde **`updateTenantModuleSetting`** con contexto de plataforma (`assertPlatformAccess`).
- **`TenantInvitation`**: misma tabla que invitaciones de equipo tenant; la plataforma crea filas con `invitedByUserId` = superadmin (aceptación en `/invitaciones/aceptar` sin cambios).

## Audit

`PlatformAuditLog` actions in product code:

| Action | Source |
|--------|--------|
| `platform.tenant.status_updated` | `updatePlatformTenantStatus` |
| `platform.tenant.plan_metadata_updated` | `updatePlatformTenantPlanMetadata` |
| `platform.tenant.module_updated` | `updateTenantModuleSetting` |
| `platform.tenant.provisioned` | `provisionPlatformTenant` |
| `platform.tenant.invitation_created` | `createPlatformTenantInvitation`, `provisionPlatformTenant` |
| `platform.tenant.invitation_cancelled` | `cancelPlatformTenantInvitation` |
| `platform.tenant.trial_extended` | `extendPlatformTenantTrial` |

Lectura: `listPlatformAuditLog` (registro global con actor y tenant), `listPlatformAuditLogForTenant` (resumen en detalle del tenant).

Metadata: `sanitizePlatformAuditMetadata` en `platform-audit.service.ts`.

## Services (`packages/services/src/platform/`)

| Module | Responsibility |
|--------|------------------|
| `platform-auth.service.ts` | `isPlatformSuperadmin`, `assertPlatformAccess`, `PlatformServiceContext` |
| `platform-audit.service.ts` | `createPlatformAuditLog`, `sanitizePlatformAuditMetadata` |
| `platform-audit-read.service.ts` | `listPlatformAuditLog`, `listPlatformAuditLogForTenant` |
| `platform-tenant.service.ts` | Dashboard summary, list/get tenant, status + plan metadata, `extendPlatformTenantTrial` |
| `platform-operations.service.ts` | `listPlatformTenantsEnriched`, `listPlatformExpirationAttention`, `getPlatformDashboardSummaryExtended` |
| `platform-user.service.ts` | `listPlatformTenantUsers` |
| `platform-tenant-module.service.ts` | Module rows + `updateTenantModuleSetting` |
| `platform-tenant-invitations.service.ts` | List/get/create/cancel invitations; `listPlatformTenantCompanies` |
| `platform-tenant-provision.service.ts` | `provisionPlatformTenant` — tenant + company + modules + invitación OWNER (sin membresía para el superadmin) |

Shared helpers: `packages/services/src/onboarding/trial-tenant-bundle.ts`, `packages/services/src/tenant-settings/tenant-invitation-shared.ts`.

Self-service primer tenant sigue en `completeTrialOnboarding` (`/onboarding`) — crea membresía OWNER para el actor.

## UI (`apps/web/app/(platform)/`)

Shell: `PlatformShell` + `PageShell` + `ModuleSubnav` (misma estética que app tenant; sin sidebar de producto).

**URLs** (prefijo `/platform` desde carpeta `app/(platform)/platform/`):

| Route | Purpose |
|-------|---------|
| `/platform` | Resumen (KPIs trials, mora, sin OWNER) |
| `/platform/vencimientos` | Bandeja trials/mora/suspensión/sin OWNER |
| `/platform/registro` | Registro global `PlatformAuditLog` (actor, acción, tenant, metadata) |
| `/platform/tenants` | Lista enriquecida + alertas + acciones rápidas |
| `/platform/tenants/new` | Provisionar organización + invitar OWNER |
| `/platform/tenants/[tenantId]` | Resumen + actividad plataforma |
| `/platform/tenants/[tenantId]/users` | Membresías |
| `/platform/tenants/[tenantId]/invitations` | Invitaciones |
| `/platform/tenants/[tenantId]/invitations/new` | Nueva invitación |
| `/platform/tenants/[tenantId]/invitations/[invitationId]` | Detalle + link flash |
| `/platform/tenants/[tenantId]/modules` | Toggles módulo |
| `/platform/tenants/[tenantId]/settings` | Suscripción y estado operativo |

Subnav por tenant: Resumen · Usuarios · Invitaciones · Módulos · Suscripción (`PlatformTenantSubnav`).

- Unauthenticated → `/login`; not superadmin → `redirect("/dashboard")`.
- Server Actions: `platform-actions.ts`, `platform-invitation-actions.ts`, `platform-provision-actions.ts`.
- Enlace “Plataforma” en header de app cuando `isPlatformSuperadmin`.

## Security checklist

- No Stripe in platform console.
- `tenantId` validado en servicios (UUID + existencia en DB).
- Invitaciones plataforma: mismo token/hash que flujo tenant; **no** bypass de email en aceptación.
- Superadmin **no** recibe membresía automática al provisionar un tenant ajeno.

## Related

- [`PERMISSIONS_ROUTE_MATRIX.md`](./PERMISSIONS_ROUTE_MATRIX.md) — platform routes table.
- [`SECURITY_ARCHITECTURE.md`](./SECURITY_ARCHITECTURE.md) — platform vs tenant RBAC.
- [`SAAS_ONBOARDING_ARCHITECTURE.md`](./SAAS_ONBOARDING_ARCHITECTURE.md) — self-service `/onboarding`.
