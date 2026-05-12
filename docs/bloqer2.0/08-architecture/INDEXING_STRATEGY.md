# Indexing strategy — Bloqer 2.0

## Decisión

Diseñar índices **desde el inicio** pensando en: (1) listados por **tenant**, (2) **proyecto**, (3) **fechas contables**, (4) **estado**, (5) joins de reportes frecuentes. **No** crear índices masivos antes de medir; sí dejar **plantillas** para paths obvios.

## Patrones obligatorios

### Multitenancy

- Índice compuesto **`(tenant_id, ...)`** como prefijo en:  
  - `account_movement (tenant_id, account_id, date_accounting)`  
  - `receivable (tenant_id, project_id, due_date)`  
  - `payable (tenant_id, supplier_contact_id, due_date)`  
  - `project (tenant_id, code)` unique opcional  
  - `certification (tenant_id, project_id, period_start)`

### Ledger

- `account_movement (tenant_id, date_accounting)` para reportes de caja.  
- `account_movement (transfer_id)` único sparse donde `transfer_id IS NOT NULL` para validar pares (validación principal sigue en servicio).

### Polimorfismo

- `(tenant_id, entity_type, entity_id)` en `document_attachment`, `audit_log` si se filtra por entidad.

### FKs calientes

- Todas las FKs expuestas en listados de producto deben tener índice en la columna **hija** (Prisma no siempre crea automáticamente el índice óptimo para cada ordenación).

## Problemas que evita

- **Seq scan** en tenants grandes.  
- Deadlocks por falta de índice en updates por `id` secundario.

## Qué NO hacer

- No duplicar índices redundantes `(tenant_id)` y `(tenant_id, id)` sin necesidad.  
- No indexar **todas** las columnas JSONB sin patrón de query.  
- No fijar índices únicos globales que ignoren `tenant_id` (p. ej. `code` de proyecto debe ser unique **por tenant**).

## Referencias

- [`TENANT_ISOLATION_MODEL.md`](./TENANT_ISOLATION_MODEL.md)  
- [`../06-reports/REPORT_CATALOG.md`](../06-reports/REPORT_CATALOG.md)
