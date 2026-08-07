# Auth architecture — Bloqer 2.0

## Decisión

Usar **Auth.js / NextAuth** como **primera opción** para autenticación en Next.js App Router: sesión segura, integración con proveedores si se requiere, y hooks del lado servidor para resolver **usuario → roles → permisos**. La **autorización de negocio** (qué módulos y acciones) se alinea a [`../00-product/PERMISSIONS_MATRIX.md`](../00-product/PERMISSIONS_MATRIX.md) y [`../00-product/USER_ROLES.md`](../00-product/USER_ROLES.md).

### Proveedores (ADR-Auth-Credentials-01)

- **Google OAuth** (primario histórico).
- **Credentials** email + password con verificación de cuenta vía Resend; `passwordHash` en `User` (bcryptjs); sin username-login.
- Magic link como método de login: **diferido**.
- Credentials/`authorize` solo en runtime Node (`packages/auth/src/auth.ts`); middleware edge sin Prisma.
- Unirse a tenant: solo invitación ([D-064](../00-product/DECISION_LOG.md#d-064--invitación-por-email-al-tenant-q-015)); primer tenant vía `/onboarding` (Phase 14A).

### Duración de sesión

- Estrategia: **JWT** (`session.strategy = "jwt"` en `packages/auth`).
- **Idle `maxAge`:** **7 días** (`SESSION_IDLE_MAX_AGE_SEC`). Mientras el usuario navega, el middleware re-emite la cookie y extiende el `exp`; sin uso durante 7 días, expira. No es un tope duro desde el login.
- **Tope absoluto:** **30 días** desde `authTime` en el JWT (`SESSION_ABSOLUTE_MAX_AGE_SEC`), aunque el idle se renueve. El callback `jwt` devuelve `null` al vencer.
- Invalidación post-reset / suspend: claim `pwdAt` vs `User.passwordUpdatedAt` y status en Node (`getSession` → usado por `getCurrentUser`); el middleware Edge no valida contra DB (ADR-Auth-Credentials-01). Si `signOut` no puede borrar cookies en RSC, la request igual se niega (`null`).
- No hay “remember me” aparte: UX larga = idle + absoluto arriba (o, a futuro, MFA / logout remoto).
- `updateAge` de Auth.js **no aplica** a estrategia JWT; no usarlo como control de lifetime.

## Justificación para Bloqer 2.0

- Modelo de permisos **simple** en producto (VIEW / EDIT / APPROVE por módulo, [D-012](../00-product/DECISION_LOG.md)) mapea bien a **guards** en servidor.
- ERP necesita **sesión fuerte** y trazabilidad de **quién** aprueba o anula ([`../02-modules/AUDIT_LOG.md`](../02-modules/AUDIT_LOG.md)).
- Auth.js reduce tiempo de arranque frente a auth custom.

## Problemas que evita

- **JWT mal usado** en cliente con claims de permisos que envejecen mal.
- **Autorización solo en UI** (botones ocultos pero API abierta).

## Qué NO hacer

- No poner **roles finos por campo** en código (el producto los rechaza en Fase 1, [D-012](../00-product/DECISION_LOG.md)).
- No usar la **sesión** como única fuente de `tenant_id` sin validar membresía en base.
- No bloquear **2FA / políticas** aquí sin revisar [`../00-product/OPEN_QUESTIONS.md`](../00-product/OPEN_QUESTIONS.md) Q-016 — la arquitectura debe permitir proveedor MFA o reglas por rol más adelante.
- No documentar **secrets** ni flujos OAuth concretos en esta carpeta.

## Integración con multitenancy

- Tras autenticar, resolver **tenant activo** (selector en UI si aplica).
- Toda mutación lleva **actor** (`user_id`) para auditoría.

## Referencias funcionales

- [`../02-modules/USERS_AND_PERMISSIONS.md`](../02-modules/USERS_AND_PERMISSIONS.md)
- [`../00-product/PERMISSIONS_MATRIX.md`](../00-product/PERMISSIONS_MATRIX.md)
- [`../00-product/USER_ROLES.md`](../00-product/USER_ROLES.md)
- [`../07-non-functional/SECURITY_AND_COMPLIANCE.md`](../07-non-functional/SECURITY_AND_COMPLIANCE.md)

## Documentos técnicos relacionados

- [`MULTITENANCY_ARCHITECTURE.md`](./MULTITENANCY_ARCHITECTURE.md)
- [`SECURITY_ARCHITECTURE.md`](./SECURITY_ARCHITECTURE.md)
- [`FRONTEND_ARCHITECTURE.md`](./FRONTEND_ARCHITECTURE.md)
