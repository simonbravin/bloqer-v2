# Ledger tables strategy — Bloqer 2.0

## Decisión

Modelar la tesorería como **ledger unificado** en `account_movement` ([`../03-finance/ACCOUNT_MOVEMENTS.md`](../03-finance/ACCOUNT_MOVEMENTS.md), [D-024](../00-product/DECISION_LOG.md)) con:

- Tipos `INCOME` | `OUTCOME`  
- Estados `DRAFT` | `CONFIRMED` | `RECONCILED` | `CANCELLED`  
- `date_accounting` y `date_value` ([D-023](../00-product/DECISION_LOG.md))  
- **`transfer_id`** para **transferencias internas** e **internal_transfer** como agregado lógico (1 registro padre opcional o solo par de movimientos — decidir en Prisma; la regla funcional es **par con mismo `transfer_id`**, [R-INT-007](../01-domain/ENTITY_RELATIONSHIPS.md)).

## AR / AP y aplicaciones

- `receivable` y `payable` mantienen montos; **cobranzas** (`collection`) y **pagos** (`payment`) generan `account_movement` confirmado y líneas de **aplicación** que reducen saldo ([D-010](../00-product/DECISION_LOG.md)).  
- **Anulación:** nuevo movimiento compensatorio o transición controlada — **no** borrado silencioso ([`SOFT_DELETE_STRATEGY.md`](./SOFT_DELETE_STRATEGY.md)).

## Stock

- `stock_movement` es ledger de **cantidades** (no dinero, salvo `unit_cost` para valuación).  
- Transferencia stock: **dos** filas con `transfer_id` ([R-INT-013](../01-domain/ENTITY_RELATIONSHIPS.md)).  
- Reserva: `stock_reservation` afecta **disponible**, no borrar consumos confirmados.

## Conciliación bancaria

- `bank_reconciliation` sesión con estados `DRAFT` | `IN_PROGRESS` | `CLOSED` | `CANCELLED` ([D-032](../00-product/DECISION_LOG.md)).  
- Tabla puente `bank_reconciliation_match` sugerida: vincula línea de extracto (o hash) con `account_movement_id`.  
- `RECONCILED` en movimiento: no editar sin desconciliar ([BR-TRZ-002](../01-domain/BUSINESS_RULES.md)).

## Integridad

- Periodo cerrado: bloqueo [R-INT-009](../01-domain/ENTITY_RELATIONSHIPS.md).  
- `source_doc_type` / `source_doc_id` para trazabilidad polimórfica hacia `collection`, `payment`, `internal_transfer`, ajustes.

## Problemas que evita

- **Doble registro** de caja (documento + movimiento desconectado).  
- Pérdida de vínculo cobranza ↔ AR.  
- Edición retroactiva silenciosa de movimientos conciliados.

## Qué NO hacer

- No recalcular **histórico** de movimientos confirmados por cambio de tipo de cambio global.  
- No modelar **internal transfer** como un solo movimiento neto.  
- No usar ledger solo como “cache” desechable — es fuente para **cashflow real** ([`../03-finance/CASHFLOW.md`](../03-finance/CASHFLOW.md)).

## Referencias

- [`../03-finance/TREASURY_MODEL.md`](../03-finance/TREASURY_MODEL.md)  
- [`../01-domain/EVENTS_AND_AUTOMATIONS.md`](../01-domain/EVENTS_AND_AUTOMATIONS.md) §3.3  
- [`MONEY_AND_DECIMAL_STRATEGY.md`](./MONEY_AND_DECIMAL_STRATEGY.md)
