# API structure — Bloqer 2.0 (Route Handlers vs Server Actions)

> Criterios de transporte en Next.js. **No** lista endpoints reales ni paths definitivos.

## Decisión

| Mecanismo | Uso recomendado |
|---|---|
| **Route Handlers** (`app/api/.../route.ts`) | Operaciones **importantes**, integraciones, **uploads**, **reportes** (export, queries pesadas), webhooks, clientes no-React, **idempotencia** explícita con headers, APIs reutilizables. |
| **Server Actions** | Formularios **internos** simples, acciones de UI **acotadas** (p. ej. toggle no financiero), mutaciones de bajo riesgo **si** delegan inmediatamente al mismo servicio que el handler. |

**Regla dura:** ambos caminos llaman al **mismo** método de `packages/services` — **cero** duplicación de reglas entre handler y action ([`SERVICE_LAYER.md`](./SERVICE_LAYER.md)).

## Patrón de request (conceptual)

```
Request body / FormData
    → Zod parse (packages/validators)
    → auth + tenant guard (session, membership, company scope)
    → ApplicationService.method(ctx, dto)
    → response normalizada (JSON o redirect)
```

- **`ctx`**: `tenantId`, `userId`, `companyId?`, roles, requestId para logs.  
- **Errores normalizados:** código estable (`BUDGET_CLOSED_VIOLATION`), HTTP apropiado, **sin** stack al cliente en producción.  
- **Idempotency-Key** (header o campo) en mutaciones críticas: cobranzas, pagos, confirmación de movimientos, creación de facturas — dedupe en servidor / constraint único `(tenant_id, idempotency_key)` cuando se implemente.

## Uploads

- Route Handler (o action que **solo** delegue): validar tamaño, MIME, permiso, `tenant_id`; metadata en Postgres; bytes en R2 ([`FILE_STORAGE_ARCHITECTURE.md`](./FILE_STORAGE_ARCHITECTURE.md)).

## Reportes

- Preferir Route Handler **GET** con query params validados + streaming cuando el volumen sea grande; permisos y `tenant_id` antes de ejecutar SQL.

## Endpoints internos vs públicos

- **Internos:** solo sesión de app; mismo origen o API key de job (futuro).  
- **Públicos / webhooks:** firma de proveedor, rate limit, sin datos cross-tenant.

## Qué NO hacer

- No poner Prisma en el handler más allá de un “passthrough” prohibido — usar repository.  
- No usar Server Actions para **uploads grandes** sin chunking/strategy.  
- No omitir validación server por confiar en el formulario.

## Referencias

- [`BACKEND_LAYERING.md`](./BACKEND_LAYERING.md)  
- [`FRONTEND_ARCHITECTURE.md`](./FRONTEND_ARCHITECTURE.md)
