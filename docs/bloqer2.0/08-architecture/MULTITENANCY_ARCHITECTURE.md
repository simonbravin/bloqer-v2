# Multitenancy architecture — Bloqer 2.0

## Decisión

Implementar **aislamiento lógico estricto** por `tenant_id` en **todas** las entidades operativas ([D-001](../00-product/DECISION_LOG.md)). Cada request autenticado resuelve un **tenant activo** (y eventualmente contexto de empresa dentro del tenant si el producto lo define). Toda lectura/escritura SQL pasa por **scope de tenant** en la capa de persistencia o en servicios; **no** confiar solo en convenciones.

## Justificación para Bloqer 2.0

- SaaS multi-cliente desde el origen ([`../07-non-functional/MULTITENANCY.md`](../07-non-functional/MULTITENANCY.md)).
- Datos financieros y documentos legales **no** pueden filtrarse entre tenants.
- Simplifica el modelo frente a “schemas por cliente” en la fase inicial.

## Problemas que evita

- **Data leaks** por un `where` olvidado.
- **IDs enumerables** cross-tenant (mitigar con autorización + scope).
- **Soporte** imposible al no saber qué tenant afecta un registro.

## Qué NO hacer

- No usar **tenant_id opcional** en tablas operativas “porque es global” sin documentación explícita.
- No resolver tenant **solo** desde query params o body sin validar contra la sesión.
- No introducir **cachés** (edge, KV) que mezclen claves sin prefijo de `tenant_id`.
- No asumir 1:1 tenant–empresa hasta resolver [`../00-product/OPEN_QUESTIONS.md`](../00-product/OPEN_QUESTIONS.md) Q-001; la arquitectura debe permitir **evolución** (p. ej. `company_id` bajo `tenant_id`).

## Estrategia de defensa en profundidad (conceptual)

1. **Sesión** lleva identidad + tenant permitido.
2. **Handlers** inyectan `tenant_id` al contexto del request.
3. **Repositories / Prisma middleware** aplican filtro por defecto en modelos tenant-scoped.
4. **Tests** de regresión para “no cross-tenant” en servicios críticos.

## Referencias funcionales

- [`../00-product/DECISION_LOG.md`](../00-product/DECISION_LOG.md) D-001
- [`../07-non-functional/MULTITENANCY.md`](../07-non-functional/MULTITENANCY.md)
- [`../AGENTS.md`](../AGENTS.md) §2 regla 4

## Documentos técnicos relacionados

- [`AUTH_ARCHITECTURE.md`](./AUTH_ARCHITECTURE.md)
- [`SECURITY_ARCHITECTURE.md`](./SECURITY_ARCHITECTURE.md)
- [`BACKEND_LAYERING.md`](./BACKEND_LAYERING.md)
