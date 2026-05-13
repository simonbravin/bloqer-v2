# SaaS onboarding & trial tenant (Phase 14A)

## Objetivo

Permitir que un usuario **ya autenticado** (Auth.js / Google) que **no tiene** `UserMembership` con `status = ACTIVE` cree su **primer tenant** en Bloqer, con periodo de prueba y metadatos SaaS básicos, **sin** implementar pagos (Stripe), checkout ni portal de facturación.

## Flujo resumido

1. Tras login, si el usuario intenta usar el shell de aplicación (`(app)/*`) sin membresía ACTIVE y **no** es superadmin de plataforma, el layout redirige a **`/onboarding`**.
2. **`/onboarding`**: formulario (es-AR) con datos de empresa; **no** usa `AppLayout` / sidebar del producto.
3. **Server Action** valida con Zod (`@bloqer/validators`) y llama a **`completeTrialOnboarding`** (`@bloqer/services`).
4. El servicio ejecuta **una sola** transacción Prisma que:
   - Re-verifica que no exista membresía ACTIVE (anti-duplicado / doble submit).
   - Asigna `slug` único para el tenant (derivado del nombre + sufijo aleatorio si hace falta).
   - Crea `Tenant` (`status=ACTIVE`, `saasPlan="trial"`, `subscriptionStatus=TRIAL`, `trialEndsAt` = ahora + 30 días UTC).
   - Crea `Company` principal (`status=ACTIVE`) con datos de contacto/domicilio persistidos en columnas de `companies` (Phase 14A).
   - Crea `UserMembership` con `roles=[OWNER]`, `status=ACTIVE`, `companyId` apuntando a la empresa creada.
   - Inserta filas **`TenantModuleSetting`** para cada clave de `OVERVIEW_MODULES` con `isEnabled=true` (explícito para consola plataforma / coherencia; el producto sigue considerando “default on” si faltara fila).
   - Escribe **`AuditLog`** append-only: `TENANT_ONBOARDING_COMPLETED`, `COMPANY_CREATED`, `MEMBERSHIP_CREATED` (mismo patrón que otras mutaciones tenant-scoped).
5. Redirección a **`/dashboard`**.

## Límites y amenazas mitigadas

- **No confiar en el cliente** para `tenantId`, `companyId`, ni rol: el actor es `session.user.id`; roles fijados a **OWNER** en servidor.
- **IDOR / cross-tenant:** N/A en creación inicial; el tenant recién creado solo es accesible tras membresía ACTIVE.
- **Carreras:** el re-chequeo de membresía ACTIVE **dentro** de la transacción evita duplicados **secuenciales** (doble submit cuando la primera ya committed). **No** garantiza por sí solo exclusión ante **dos requests concurrentes** antes del commit: el esquema permite varias membresías ACTIVE en distintos `tenantId` para el mismo `userId` (`@@unique([userId, tenantId])`). Mitigación futura recomendada: bloqueo por usuario (advisory lock), aislamiento serializable con reintento, o regla de negocio única “máx. un tenant creado vía self-signup por usuario”.

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
