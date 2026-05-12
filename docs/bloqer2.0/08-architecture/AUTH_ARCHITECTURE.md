# Auth architecture — Bloqer 2.0

## Decisión

Usar **Auth.js / NextAuth** como **primera opción** para autenticación en Next.js App Router: sesión segura, integración con proveedores si se requiere, y hooks del lado servidor para resolver **usuario → roles → permisos**. La **autorización de negocio** (qué módulos y acciones) se alinea a [`../00-product/PERMISSIONS_MATRIX.md`](../00-product/PERMISSIONS_MATRIX.md) y [`../00-product/USER_ROLES.md`](../00-product/USER_ROLES.md).

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
