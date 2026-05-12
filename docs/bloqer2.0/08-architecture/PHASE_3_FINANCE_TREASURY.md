# Phase 3 — Finance and treasury

## Objetivos

Cerrar el **circuito dinero documentado**: cuentas de tesorería, ledger (`account_movement`), AR/AP, facturas de venta/compra vinculadas, cobranzas y pagos **parciales** ([D-010](../00-product/DECISION_LOG.md)), transferencias internas (par de movimientos), cashflow real, cierre de período.

## Módulos incluidos

| Módulo | Docs |
|---|---|
| Bank accounts / Treasury | [`../02-modules/TREASURY.md`](../02-modules/TREASURY.md), [`BANK_ACCOUNTS.md`](../02-modules/BANK_ACCOUNTS.md) |
| Account movements | [`../03-finance/ACCOUNT_MOVEMENTS.md`](../03-finance/ACCOUNT_MOVEMENTS.md), [`LEDGER_TABLES_STRATEGY.md`](./LEDGER_TABLES_STRATEGY.md) |
| AR / Sales invoice | [`../03-finance/ACCOUNTS_RECEIVABLE.md`](../03-finance/ACCOUNTS_RECEIVABLE.md), [`SALES_AND_COLLECTIONS.md`](../02-modules/SALES_AND_COLLECTIONS.md) |
| AP / Purchase invoice | [`../03-finance/ACCOUNTS_PAYABLE.md`](../03-finance/ACCOUNTS_PAYABLE.md), [`EXPENSES_AND_PAYMENTS.md`](../02-modules/EXPENSES_AND_PAYMENTS.md) |
| Collections / Payments | workflows [`REGISTER_COLLECTION`](../05-workflows/REGISTER_COLLECTION.md), [`REGISTER_PAYMENT`](../05-workflows/REGISTER_PAYMENT.md) |
| Internal transfers | [`INTERNAL_TRANSFERS.md`](../02-modules/INTERNAL_TRANSFERS.md), D-023 |
| Cashflow | [`CASHFLOW.md`](../03-finance/CASHFLOW.md) |
| Period close | [`PERIOD_CLOSE_AND_LOCKS.md`](../03-finance/PERIOD_CLOSE_AND_LOCKS.md) |

**Eventos canónicos:** [`EVENTS_AND_AUTOMATIONS`](../01-domain/EVENTS_AND_AUTOMATIONS.md) §3.3 `collection.confirmed`, §3.3b receivables.

## Dependencias

- **Phase 2**: certificación + proyecto + cliente + presupuesto para facturar con `certification_id`.  
- Convenciones monetarias: [`MONEY_AND_DECIMAL_STRATEGY.md`](./MONEY_AND_DECIMAL_STRATEGY.md).

## Entregables

- `account`, `account_movement` con estados y fechas contable/valor.  
- `sales_invoice` → `receivable`; emisión y anulación según reglas.  
- `collection` + aplicaciones parciales → movimiento `INCOME` confirmado.  
- `purchase_invoice` → `payable` (puede integrarse con Phase 4 si OC aún no existe — documentar atajo en MVP).  
- `payment` + aplicaciones → `OUTCOME`.  
- `internal_transfer`: exactamente 2 movimientos, mismo `transfer_id`.  
- Jobs o proceso para `receivable.overdue_detected` / derivados ([D-031](../00-product/DECISION_LOG.md)).  
- Period lock aplicado en servicios.

## Criterios de aceptación

- [ ] Nunca float en dinero; FX manual donde aplique ([D-008](../00-product/DECISION_LOG.md)).  
- [ ] No borrar movimientos confirmados; solo cancel/compensate ([`SOFT_DELETE_STRATEGY.md`](./SOFT_DELETE_STRATEGY.md)).  
- [ ] `payment_status` de certificación **derivado** desde AR/collections ([D-026](../00-product/DECISION_LOG.md)).  
- [ ] Tests: cobranza parcial, transferencia interna, period close bloquea mutación.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Doble aplicación cobranza | Idempotency-Key + constraint único ([`API_STRUCTURE.md`](./API_STRUCTURE.md)) |
| Saldo AR desalineado | Definir si balance es derivado o mantenido; tests de reconciliación |

## Qué NO hacer todavía

- Conciliación bancaria formal multi-match puede esperar a Phase 4/5 si no está en MVP técnico ([`MVP_TECHNICAL_SCOPE.md`](./MVP_TECHNICAL_SCOPE.md)).  
- No motor fiscal AFIP.  
- No proyección de caja avanzada si bloquea núcleo — [`CASHFLOW_PROJECTION.md`](../03-finance/CASHFLOW_PROJECTION.md) puede ser Phase 4.

## Prompts sugeridos (IA)

```
Lee LEDGER_TABLES_STRATEGY.md y EVENTS_AND_AUTOMATIONS §3.3.
Implementá confirmCollection en packages/services: una transacción que actualiza receivable, crea account_movement INCOME, emite eventos documentados.
Tests de tenant isolation + period lock.
```

```
Lee ACCOUNTS_PAYABLE.md y BR-SUB-003 (si hay payable desde subcontrato en esta branch).
Implementá applyPayment a payable con líneas parciales.
```

## Referencias

- Anterior: [`PHASE_2_CORE_OPERATIONS.md`](./PHASE_2_CORE_OPERATIONS.md)  
- Siguiente: [`PHASE_4_REPORTING.md`](./PHASE_4_REPORTING.md)
