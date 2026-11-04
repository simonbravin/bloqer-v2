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
- No asumir 1:1 tenant–empresa: el modelo físico ya permite **N `Company` por `Tenant`** ([ADR-Phase1-02](./ARCHITECTURE_DECISION_RECORDS.md)); el alcance de producto sigue en [`../00-product/OPEN_QUESTIONS.md`](../00-product/OPEN_QUESTIONS.md) **Q-001** (incl. sub-problema **mismo usuario en dos sociedades** vs `@@unique([userId, tenantId])` en `UserMembership`).

## UserMembership y contexto de empresa (Q-001)

- **Hoy:** una fila `UserMembership` por `(userId, tenantId)` y un solo `companyId` opcional → **una** empresa anclada o membresía global al tenant.
- **Default hasta selector ([D-092]):** si el tenant tiene exactamente una `Company` ACTIVE, sesión, invitaciones, membresías y proyectos nuevos se anclan a esa empresa. No se elige entre varias.
- **Selector de empresa en el shell:** adecuado para cambiar el contexto **dentro** de esa semántica; no sustituye por sí solo membresías múltiples por usuario sin migración (ver Q-001).

## Estrategia de defensa en profundidad vigente (ADR-018)

1. **Sesión** lleva identidad + tenant permitido.
2. **Handlers** inyectan `tenant_id` al contexto del request.
3. **Servicios/repositorios** aplican filtros y guards explícitos. Las lecturas masivas se acotan desde la consulta; las cargas por ID comprueban pertenencia antes de usar/devolver datos o mutar. El cliente Prisma simple **no** inyecta filtros ni rechaza consultas sin tenant automáticamente.
4. **Padre dueño de hijos existentes:** los 22 modelos del [catálogo cerrado](./TENANT_ISOLATION_MODEL.md) heredan tenant de un padre obligatorio. Se verifican el padre autorizado y las relaciones adicionales; no se admiten nuevas excepciones por analogía.
5. **Tests** de regresión para “no cross-tenant” en servicios críticos. Las pruebas de políticas no sustituyen integración SQL; el estado de cada recorrido requiere evidencia propia.

La reconciliación fue confirmada explícitamente por el usuario en [ADR-018](./ARCHITECTURE_DECISION_RECORDS.md), el 03/11/2026. No añade middleware, columnas ni migraciones. Un control automático adicional requiere diseño y ADR propios; no se considera ya implementado.

## Referencias funcionales

- [`../00-product/DECISION_LOG.md`](../00-product/DECISION_LOG.md) D-001
- [`../07-non-functional/MULTITENANCY.md`](../07-non-functional/MULTITENANCY.md)
- [`../AGENTS.md`](../AGENTS.md) §2 regla 4

## Documentos técnicos relacionados

- [`AUTH_ARCHITECTURE.md`](./AUTH_ARCHITECTURE.md)
- [`SECURITY_ARCHITECTURE.md`](./SECURITY_ARCHITECTURE.md)
- [`BACKEND_LAYERING.md`](./BACKEND_LAYERING.md)
