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
Pendiente [Q-001]: si se introduce `company_id`, también debe filtrarse globalmente.

## Referencias
- [`../00-product/DECISION_LOG.md`](../00-product/DECISION_LOG.md) D-001
