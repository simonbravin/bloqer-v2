# Audit fields strategy — Bloqer 2.0

## Decisión

Toda entidad operativa relevante incluye **metadatos de auditoría técnica**:

| Campo | Tipo sugerido | Notas |
|---|---|---|
| `created_at` | `TIMESTAMPTZ` | default now |
| `updated_at` | `TIMESTAMPTZ` | trigger o actualización en servicio |
| `created_by_user_id` | UUID nullable | FK lógica a `user` |
| `updated_by_user_id` | UUID nullable | FK lógica a `user` |

Además, el producto exige **`AuditLog`** de negocio para acciones críticas ([`../02-modules/AUDIT_LOG.md`](../02-modules/AUDIT_LOG.md)): aprobaciones, anulaciones, cambios en montos, reapertura de periodo, etc.

## Separación de responsabilidades

- **Campos en fila:** “quién/cuándo” de **última** mutación útil para UI y soporte.  
- **`audit_log`:** historial **append-only** (conceptual) con diff o snapshot según política; no sustituye **ledger** financiero.

## Problemas que evita

- Pérdida de contexto ante disputas (“quién cerró el periodo”).  
- Conflación entre **auditoría** y **estado de negocio**.

## Qué NO hacer

- No actualizar `updated_at` en **jobs de solo lectura** que tocan columnas derivadas sin evento de negocio (definir política clara).  
- No guardar **PII innecesaria** en `audit_log` payload.  
- No usar auditoría como **única** protección contra borrado indebido — ver [`SOFT_DELETE_STRATEGY.md`](./SOFT_DELETE_STRATEGY.md) y permisos.

## Referencias

- [`../07-non-functional/AUDIT_AND_TRACEABILITY.md`](../07-non-functional/AUDIT_AND_TRACEABILITY.md)  
- [`SERVICE_LAYER.md`](./SERVICE_LAYER.md)
