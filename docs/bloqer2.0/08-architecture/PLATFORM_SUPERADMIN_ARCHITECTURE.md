# Platform superadmin — Phase 10A

## Purpose

Cross-tenant **platform** operations (list tenants, adjust SaaS metadata, suspend) are separate from **tenant RBAC** (`OWNER`, `ADMIN`, module permissions). No tenant role grants platform access.

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

## Audit

Mutations in `platform-tenant.service.ts` write `PlatformAuditLog` inside the same transaction as the tenant update:

- `platform.tenant.status_updated` — before/after operational `status`.
- `platform.tenant.plan_metadata_updated` — before/after plan / subscription fields.

`platform-tenant-module.service.ts` writes **`platform.tenant.module_updated`** when a superadmin changes `TenantModuleSetting`.

Metadata is passed through `sanitizePlatformAuditMetadata` in `platform-audit.service.ts` (shallow keys, bounded strings, no obvious secret key names).

## Services (`packages/services/src/platform/`)

| Module | Responsibility |
|--------|------------------|
| `platform-auth.service.ts` | `isPlatformSuperadmin`, `assertPlatformAccess`, `PlatformServiceContext` |
| `platform-audit.service.ts` | `createPlatformAuditLog`, `sanitizePlatformAuditMetadata` |
| `platform-tenant.service.ts` | Dashboard summary, list/get tenant, `updatePlatformTenantStatus`, `updatePlatformTenantPlanMetadata` |
| `platform-user.service.ts` | `listPlatformTenantUsers` (memberships for a tenant; `tenantId` validated by DB lookup) |
| `platform-tenant-module.service.ts` | `listPlatformTenantModuleRows`, `updateTenantModuleSetting` (audit `platform.tenant.module_updated`) |

All use Prisma only inside services. **`tenantId`** for mutations comes from validated Zod input (including path-aligned `tenantId` in server actions), not from a separate client-controlled tenant header.

## UI (`apps/web/app/(platform)/`)

Dedicated layout (no tenant app sidebar). **URLs públicas** (todo bajo `/platform`):

- `/platform` — resumen (`platform/page.tsx`)
- `/platform/tenants` — lista
- `/platform/tenants/[tenantId]` — detalle
- `/platform/tenants/[tenantId]/modules` — toggles de módulo (Phase **12B**)
- `/platform/tenants/[tenantId]/settings` — metadata SaaS / estado operativo
- `/platform/tenants/[tenantId]/users` — membresías (vista plataforma)

El segmento `(platform)` es solo **route group** (no aparece en la URL); el segmento de URL `platform` viene de la carpeta `app/(platform)/platform/`.

- Layout and pages: unauthenticated → `/login`; not superadmin → **`redirect("/dashboard")`** (consistent with product shell).
- Unknown tenant / forbidden from service → **`notFound()`** on entity pages.
- Avatar menu in main app: **“Plataforma”** link only when `isPlatformSuperadmin` (SSR in `(app)/layout.tsx`).

## Security checklist

- No Stripe or other subscription provider integration in 10A.
- **Database:** Phase 10A does not rely on `db:push`; apply a normal Prisma/Neon migration in your environment when promoting schema changes.
- No `tenantId` from query string for platform APIs; path param flows into services as `tenantId` string validated against DB.
- Server Actions re-check session and use `getPlatformServiceContext`; services call `assertPlatformAccess`.

## Related

- [`PERMISSIONS_ROUTE_MATRIX.md`](./PERMISSIONS_ROUTE_MATRIX.md) — platform routes table.
- [`SECURITY_ARCHITECTURE.md`](./SECURITY_ARCHITECTURE.md) — defense in depth; platform is an additional admin surface.
