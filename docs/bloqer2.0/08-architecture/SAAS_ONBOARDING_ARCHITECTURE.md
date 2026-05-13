# SaaS onboarding & trial tenant (Phase 14A / 14A.1)

## Objetivo

Permitir que un usuario **ya autenticado** (Auth.js / Google) que **no tiene** `UserMembership` con `status = ACTIVE` cree su **primer tenant** en Bloqer, con periodo de prueba y metadatos SaaS básicos, **sin** implementar pagos (Stripe), checkout ni portal de facturación.

## Flujo resumido

1. Tras login, si el usuario intenta usar el shell de aplicación (`(app)/*`) sin membresía ACTIVE y **no** es superadmin de plataforma, el layout redirige a **`/onboarding`**.
2. **`/onboarding`**: formulario (es-AR) con datos de empresa; **no** usa `AppLayout` / sidebar del producto.
3. **Server Action** valida con Zod (`@bloqer/validators`) y llama a **`completeTrialOnboarding`** (`@bloqer/services`).
4. El servicio ejecuta **una sola** transacción Prisma que:
   - Adquiere **`pg_advisory_xact_lock(classid, hashtext(actorUserId))`** (Phase 14A.1): bloqueo **por transacción** que serializa onboarding concurrente del mismo usuario antes de leer/escribir.
   - Re-verifica que no exista membresía ACTIVE (anti-duplicado / doble submit).
   - Asigna `slug` único para el tenant (derivado del nombre + sufijo aleatorio si hace falta).
   - Crea `Tenant` (`status=ACTIVE`, `saasPlan="trial"`, `subscriptionStatus=TRIAL`, `trialEndsAt` = ahora + 30 días UTC).
   - Crea `Company` principal (`status=ACTIVE`) con datos de contacto/domicilio persistidos en columnas de `companies` (Phase 14A).
   - Crea `UserMembership` con `roles=[OWNER]`, `status=ACTIVE`, `companyId` apuntando a la empresa creada.
   - Inserta filas **`TenantModuleSetting`** para cada clave de `OVERVIEW_MODULES` con `isEnabled=true` (explícito para consola plataforma / coherencia; el producto sigue considerando “default on” si faltara fila).
   - Escribe **`AuditLog`** append-only: `TENANT_ONBOARDING_COMPLETED`, `COMPANY_CREATED`, `MEMBERSHIP_CREATED` (mismo patrón que otras mutaciones tenant-scoped).
5. Redirección a **`/dashboard`**.

## Concurrencia (Phase 14A.1)

- **Problema:** dos requests concurrentes del mismo `actorUserId` podían pasar ambas el `findFirst` de membresía ACTIVE antes de que ninguna transacción hiciera commit, porque el esquema solo impone `@@unique([userId, tenantId])` (varios tenants por usuario son posibles en general).
- **Mitigación:** al inicio del callback de `prisma.$transaction`, se ejecuta  
  `SELECT pg_advisory_xact_lock(<classid fijo Bloqer>, hashtext(<actorUserId>::text))`.
  - **Alcance:** el lock es **transaction-scoped** (`xact`): se libera al commit/rollback automáticamente.
  - **Clave:** `classid = 824014001` (constante de producto para no colisionar con otros advisory locks que usen el mismo segundo entero); `key = hashtext(user id)` cabe en `int4` como exige la firma de dos enteros.
  - **Efecto:** el segundo submit concurrente **espera** hasta que termine el primero; luego el re-chequeo de membresía ve la fila creada y devuelve `already_member` sin crear otro tenant.

## Límites y amenazas mitigadas

- **No confiar en el cliente** para `tenantId`, `companyId`, ni rol: el actor es `session.user.id`; roles fijados a **OWNER** en servidor.
- **IDOR / cross-tenant:** N/A en creación inicial; el tenant recién creado solo es accesible tras membresía ACTIVE.
- **Carreras (mismo usuario, self-signup):** cubiertas por el advisory **transaction lock** + re-chequeo de membresía ACTIVE en la misma transacción (idempotencia secuencial preservada).

## Archivos clave

| Capa | Ruta |
|------|------|
| UI | `apps/web/app/onboarding/*` |
| Action | `apps/web/app/onboarding/actions.ts` |
| Servicio | `packages/services/src/onboarding/onboarding.service.ts` |
| Validación | `packages/validators/src/onboarding.ts` |
| Schema | `packages/database/prisma/schema.prisma` (`Company` + campos de contacto) |
| Migración | `packages/database/prisma/migrations/20260513140000_phase_14a_company_onboarding_fields/` |

## Fuera de alcance (Phase 14A)

- Stripe, Customer Portal, métodos de pago, self-service de planes.
- Emails transaccionales de bienvenida (opcional en fases posteriores).

## Referencias

- [`SECURITY_ARCHITECTURE.md`](./SECURITY_ARCHITECTURE.md) — self-signup primer tenant vs invitaciones.
- [`PERMISSIONS_ROUTE_MATRIX.md`](./PERMISSIONS_ROUTE_MATRIX.md) — matriz de ruta `/onboarding`.
