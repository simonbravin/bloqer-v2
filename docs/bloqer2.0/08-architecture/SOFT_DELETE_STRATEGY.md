# Soft delete strategy — Bloqer 2.0

## Decisión

- **Entidades legales / financieras confirmadas:** **no** se borran físicamente; se **anulan** con estado (`CANCELLED`, etc.) o **movimiento compensatorio** ([D-025](../00-product/DECISION_LOG.md), [BR-INV-007](../01-domain/BUSINESS_RULES.md)).  
- **Entidades de trabajo borrador:** pueden eliminarse físicamente **solo** si el producto lo permite explícitamente y sin vínculos activos.  
- **Soft delete genérico** (`deleted_at`): opcional para catálogos (p. ej. `contact` archivado) según [`../01-domain/STATE_MACHINES.md`](../01-domain/STATE_MACHINES.md) para `Contact` `ARCHIVED`.

## Tablas donde el DELETE físico está **prohibido** tras confirmación

- `account_movement` (confirmado)  
- `stock_movement` (confirmado)  
- `receivable`, `payable`, `sales_invoice`, `purchase_invoice` (emitidos)  
- `certification` emitida (`ISSUED`+)  
- Cualquier comprobante alineado a [D-025](../00-product/DECISION_LOG.md)

## Estrategia por tipo

| Tipo | Estrategia |
|---|---|
| Borrador descartable | `DELETE` o `status = CANCELLED` según módulo |
| Confirmado | `status` terminal + reversión compensatoria auditada |
| Catálogo | `ARCHIVED` / `deleted_at` + exclusión de selectores |

## Problemas que evita

- Pérdida de **trazabilidad legal** y desbalance de ledger.  
- “Borrar” cobranza para arreglar saldo.

## Qué NO hacer

- No usar `ON DELETE CASCADE` agresivo en tablas financieras sin ADR.  
- No **hard delete** por conveniencia en producción para arreglar bugs.  
- No mezclar `deleted_at` con `CANCELLED` sin guía de queries (siempre filtrar ambos).

## Referencias

- [`LEDGER_TABLES_STRATEGY.md`](./LEDGER_TABLES_STRATEGY.md)  
- [`../01-domain/STATE_MACHINES.md`](../01-domain/STATE_MACHINES.md)  
- [`../02-modules/AUDIT_LOG.md`](../02-modules/AUDIT_LOG.md)
