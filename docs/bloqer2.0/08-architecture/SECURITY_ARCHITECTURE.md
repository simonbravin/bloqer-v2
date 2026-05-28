# Security architecture — Bloqer 2.0

## Decisión

Aplicar **defensa en profundidad**: autenticación fuerte, **autorización en servidor**, **aislamiento por tenant**, validación de entrada con **Zod**, **principio de mínimo privilegio** en integraciones (R2, Resend), y **auditoría** de acciones sensibles. Cumplir lineamientos de [`../07-non-functional/SECURITY_AND_COMPLIANCE.md`](../07-non-functional/SECURITY_AND_COMPLIANCE.md) y permisos simples del producto ([D-012](../00-product/DECISION_LOG.md)).

## Justificación para Bloqer 2.0

- Datos de **obras, contratos y finanzas** son altamente sensibles.
- **Anulaciones y cierres de periodo** ([D-014](../00-product/DECISION_LOG.md)) deben ser rastreables y restringidas.
- **Comprobantes legales** no editables ([D-025](../00-product/DECISION_LOG.md)) implica controles de integridad y permisos claros.

## Problemas que evita

- **IDOR** entre tenants o proyectos.
- **Escalación** de privilegios por flags en cliente.
- **Exfiltración** por URLs de archivos mal configuradas.

## Qué NO hacer

- No exponer **endpoints administrativos** sin rate limit y rol adecuado.
- No guardar **secretos** en el repo ni en variables del cliente.
- No asumir **2FA** resuelto sin decisión explícita ([`../00-product/OPEN_QUESTIONS.md`](../00-product/OPEN_QUESTIONS.md) Q-016).

## Áreas críticas (checklist conceptual)

| Área | Enfoque |
|---|---|
| Datos | `tenant_id` obligatorio, encriptación en tránsito, backups Neon |
| Auth | Sesión segura, rotación, ver [`AUTH_ARCHITECTURE.md`](./AUTH_ARCHITECTURE.md) |
| Archivos | URLs firmadas, permisos, [`FILE_STORAGE_ARCHITECTURE.md`](./FILE_STORAGE_ARCHITECTURE.md) |
| Finanzas | Acciones sensibles solo con rol FINANCE/OWNER según matriz |
| Dependencias | Actualizar toolchain; revisar supply chain en CI cuando exista |

## Referencias funcionales

- [`ENVIRONMENT_VARIABLES.md`](./ENVIRONMENT_VARIABLES.md) — categorías de env, secretos, integraciones opcionales (Phase 10D).
- [`../00-product/PERMISSIONS_MATRIX.md`](../00-product/PERMISSIONS_MATRIX.md)
- [`../00-product/DECISION_LOG.md`](../00-product/DECISION_LOG.md) D-012, D-014, D-025
- [`../07-non-functional/SECURITY_AND_COMPLIANCE.md`](../07-non-functional/SECURITY_AND_COMPLIANCE.md)

## Documentos técnicos relacionados

- [`MULTITENANCY_ARCHITECTURE.md`](./MULTITENANCY_ARCHITECTURE.md)
- [`AUTH_ARCHITECTURE.md`](./AUTH_ARCHITECTURE.md)
- [`PLATFORM_SUPERADMIN_ARCHITECTURE.md`](./PLATFORM_SUPERADMIN_ARCHITECTURE.md) — consola `/platform` (Phase 10A); **no** sustituye RBAC por tenant. Configuración `/configuracion` (10B–10C) solo usa membresía + `can()`, sin `PlatformAdmin` en flujos tenant.
- [`OBSERVABILITY_ARCHITECTURE.md`](./OBSERVABILITY_ARCHITECTURE.md)

## Tenant RBAC vs platform superadmin (Phase 12A–12C)

- **`OWNER`**, **`ADMIN`**, y el resto de roles de **membresía del tenant** aplican al shell de aplicación (`/dashboard`, `/proyectos`, `/configuracion`, …) vía `can()` en `packages/domain`.
- **Phase 12B — módulos por tenant:** además del rol, la **disponibilidad** de cada `PermissionModule` puede estar deshabilitada para el tenant (`TenantModuleSetting`, editable solo en **`/platform/tenants/[tenantId]/modules`**). **`can(VIEW, X)`** otorga capacidad; **el flag de tenant** otorga que el producto esté contratado/habilitado para ese tenant. La navegación principal combina ambos.
- **Phase 12C (pass 1) — servicios:** puntos de entrada de datos de alto riesgo (contabilidad, tesorería, AR/AP, inventario, compras, subcontratos) llaman `assertTenantModuleEnabled` **antes** de los chequeos de rol (`packages/services/src/tenant-modules/tenant-module-enforcement.ts`), con mensaje único `El módulo está deshabilitado para este tenant.` Las rutas de export CSV/PDF/email que reutilizan esos servicios heredan el mismo comportamiento. Sin gates de módulo tenant en `/platform`.
- **Phase 13G — libro de obra:** `jobsite-log.service` llama `assertJobsiteLogTenantModule` (**`JOBSITE_LOG`**) antes de `can()`, mismo mensaje que 12C; alineado a mutaciones de `document.service` cuando `linkedEntityType=JOBSITE_LOG`.
- **Phase 12D — servicios:** `project-cash-flow` y `cost-control` cargan `getTenantModuleGate` una vez por request; bloqueo duro solo en módulos base acordados; exclusiones parciales con DTO (`sectionsExcluded` / `warnings.sectionsExcluded`). `document.service`: sin gate global en lecturas; **mutaciones** bloqueadas si el módulo mapeado desde `linkedEntityType` está deshabilitado. Alertas operativas: `listNegativeStockBalancesForTenant` **sin** gate (sin cambio). Detalle en `PERMISSIONS_ROUTE_MATRIX.md`.
- El acceso a **`/platform`** y mutaciones de plataforma usa **`isPlatformSuperadmin`** (lista `PLATFORM_SUPERADMIN_EMAILS` y/o tabla **`PlatformAdmin`**). No inferir acceso de plataforma desde rol tenant ni al revés. Los toggles de módulos **no** aplican a la consola de plataforma.
- APIs de informes y cron validan sesión + mismos gates de servicio que las páginas; no son permisos de plataforma.

## Invitaciones al tenant (Phase 10C)

- **DB / deploy:** crear tablas con **migración Prisma** acorde al repo; **no** usar `db:push` como sustituto del proceso de deploy acordado; sin migración aplicada, invitaciones fallan en runtime.
- **Token:** valor aleatorio en el enlace (`/invitaciones/aceptar?token=…`); en base de datos solo **`sha256`** (hex). Tratar el token como **secreto** (no loguear, no cachear en CDN).
- **Aceptación:** requiere sesión cuyo **email** coincide con el de la invitación (normalizado); no se acepta `tenantId` desde el cliente.
- **Email:** envío vía Resend **opcional**; la invitación se crea igual. Si el correo **no se despachó**, el enlace con token se muestra una sola vez vía cookie httpOnly de corta duración: path **`/configuracion/equipo/invitaciones`** (admin tenant) o **`/platform/tenants/[tenantId]/invitations`** (superadmin plataforma).
- **Invitaciones desde plataforma:** `createPlatformTenantInvitation` / `provisionPlatformTenant` usan `assertPlatformAccess`; mismas reglas de token y aceptación; auditoría en **`PlatformAuditLog`** (`platform.tenant.invitation_created`).
- **Self-signup (primer tenant):** Phase **14A** — usuario autenticado (p. ej. Google) **sin** `UserMembership` ACTIVE puede crear su primer tenant vía **`/onboarding`**: actor siempre desde sesión; `tenantId` / `companyId` generados en servidor; mutación atómica en Prisma `$transaction` (`completeTrialOnboarding`); **sin** Stripe ni checkout en esta fase. Ver [`SAAS_ONBOARDING_ARCHITECTURE.md`](./SAAS_ONBOARDING_ARCHITECTURE.md).
- **Self-signup (unirse a tenant existente):** no hay registro público arbitrario; unirse al tenant es vía invitación **PENDING** no vencida + email coincidente.
- **Carreras:** dos aceptaciones simultáneas del mismo token o cambios concurrentes de roles pueden colisionar; el flujo usa transacción Prisma pero no bloqueo pesimista global.
