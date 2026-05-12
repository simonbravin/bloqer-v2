# Tenant isolation model — Bloqer 2.0

## Decisión

Implementar **row-level logical isolation** con columna **`tenant_id` (UUID, NOT NULL)** en **todas** las entidades operativas. Opcionalmente **`company_id`** bajo el tenant para multi-razón social ([`DATA_MODEL_OVERVIEW.md`](./DATA_MODEL_OVERVIEW.md)). La aplicación **nunca** confía en el cliente para el tenant activo: se toma de **sesión** y se valida membresía.

## Justificación

- [D-001](../00-product/DECISION_LOG.md); alineado a [`MULTITENANCY_ARCHITECTURE.md`](./MULTITENANCY_ARCHITECTURE.md).
- Construcción y finanzas: error de tenant es **incidente grave**.

## Catálogo: tablas sin `tenant_id` (excepciones explícitas)

Solo **catálogos globales de plataforma** o tablas puramente técnicas de Auth.js (si viven en la misma DB). Ejemplos conceptuales:

- Referencias externas comunes (muy raras; preferir datos por tenant).
- Tablas de proveedor OAuth / sesión de Auth (documentar en `AUTH_ARCHITECTURE`).

**Regla:** cualquier fila que mencione **proyecto, dinero, stock o contacto de negocio** → **`tenant_id` obligatorio**.

## Estrategia de enforcement

1. **Prisma middleware** o capa repositorio: auto-inyectar `tenant_id` en `create`; rechazar `findMany` sin filtro en modelos tenant-scoped en runtime de desarrollo (assert).
2. **Tests** de integración: intento de lectura cross-tenant debe fallar.
3. **Índices**: siempre incluir `tenant_id` leading en índices de listados ([`INDEXING_STRATEGY.md`](./INDEXING_STRATEGY.md)).

## `company_id` (opcional)

- Si **Alternativa B** ([`DATA_MODEL_OVERVIEW.md`](./DATA_MODEL_OVERVIEW.md)): `company_id` en `project`, y potencialmente en `sales_invoice`, `purchase_invoice`, `account` cuando el producto distinga emisor.
- **Invariante:** `company.tenant_id` debe coincidir con el `tenant_id` de la fila hija.

## Problemas que evita

- Data leaks por query olvidada.
- APIs que aceptan `tenant_id` del body.

## Qué NO hacer

- No usar `tenant_id` nullable “temporalmente”.  
- No compartir **secuencias de numeración** entre tenants sin prefijo o tabla de secuencias por tenant ([Q-002](../00-product/OPEN_QUESTIONS.md)).  
- No cachear agregados **sin** clave de tenant.

## Referencias

- [`../07-non-functional/MULTITENANCY.md`](../07-non-functional/MULTITENANCY.md)  
- [`../01-domain/ENTITY_RELATIONSHIPS.md`](../01-domain/ENTITY_RELATIONSHIPS.md) §8–9
