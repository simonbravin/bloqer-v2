# Multitenancy

## Requisito
Aislamiento **estricto** de datos por `tenant_id` ([D-001]).

## Estrategia funcional (agnóstica de implementación)
- Cada fila operativa incluye `tenant_id`.
- Autenticación produce `tenant_id` efectivo del usuario.
- Ninguna API retorna datos de otro tenant ([BR-MT-001]).

## Hard rules
- Tests automatizados deben incluir caso “cross-tenant forbidden”.
- Errores 404 vs 403: política de no filtrar existencia entre tenants.

## Multi-empresa dentro del tenant

- **Modelo de datos:** varias filas `Company` bajo un mismo `Tenant` ([ADR-Phase1-02](../08-architecture/ARCHITECTURE_DECISION_RECORDS.md)); `UserMembership.companyId` opcional ancla la membresía a una razón social cuando aplica.
- **Consultas:** todo agregado financiero u operativo sensible debe respetar `tenant_id` **y**, cuando el producto defina contexto de empresa, `company_id` acorde a [`Q-001`](../00-product/OPEN_QUESTIONS.md) y al **corte Phase 1** [D-036](../00-product/DECISION_LOG.md) (membresía única por `(userId, tenantId)` en Prisma).
- **Resolución de sesión:** `getMembershipByUserId` devuelve la primera membresía `ACTIVE` por `userId` (orden `createdAt`); si en el futuro un usuario tiene membresías en **varios tenants**, la capa de auth debe acotar `tenantId` antes de usar ese resultado — hasta entonces asumir un tenant productivo por usuario o usar `getMembership(userId, tenantId)` cuando el tenant sea conocido.

## Referencias
- [`../00-product/DECISION_LOG.md`](../00-product/DECISION_LOG.md) D-001
