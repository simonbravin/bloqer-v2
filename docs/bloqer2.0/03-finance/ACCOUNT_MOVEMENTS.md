# Account Movements — Ledger unificado

## Definición
**AccountMovement** es el **átomo financiero**: un registro de entrada o salida de dinero en una **Account**, con trazabilidad al documento origen.

## Campos conceptuales clave

| Campo | Descripción |
|---|---|
| `id` | Identificador |
| `tenant_id` | Aislamiento |
| `account_id` | Cuenta afectada |
| `type` | `INCOME` \| `OUTCOME` |
| `amount`, `currency`, `fx_rate`, `amount_ars` | Ver [`MONEY_MODEL.md`](./MONEY_MODEL.md) |
| `date_accounting` | Imputación contable |
| `date_value` | Acreditación bancaria |
| `status` | `DRAFT` \| `CONFIRMED` \| `RECONCILED` \| `CANCELLED` |
| `counterparty_id` / `counterpartyContactId` | Contact opcional (ingresos corporativos manuales — [D-049](../00-product/DECISION_LOG.md); no sustituye Collection/Payment) |
| `externalInvoiceRef` | Referencia opcional al comprobante oficial emitido fuera de Bloqer (p. ej. ARCA) |
| `project_id` | Opcional |
| `category_id` | Categoría movimiento |
| `source_doc_type`, `source_doc_id` | Origen polimórfico |
| `transfer_id` | Si pertenece a transferencia interna |

## Reglas
- **Solo `CONFIRMED` y `RECONCILED`** impactan saldos reportados.
- **Transferencia interna:** dos movimientos con mismo `transfer_id` ([BR-TRZ-004]).
- **Anulación:** estado `CANCELLED` + movimiento espejo o reversión explícita.

## Relación con capas de costo (`paid_amount`)

La capa **`paid_amount`** de reporting de **costo** (presupuesto vs real, rentabilidad en vista “pagado”) se alimenta de **pagos confirmados** y de **`AccountMovement` `OUTCOME`** vinculados a esos pagos — no de obligaciones AP por sí solas ([`COST_FORMULAS.md`](../04-formulas/COST_FORMULAS.md) §1.3). **Internal transfers** no cuentan como costo de proyecto.

## Eventos
Ver [`EVENTS_AND_AUTOMATIONS.md`](../01-domain/EVENTS_AND_AUTOMATIONS.md) § AccountMovement.

## Integridad
- Periodo cerrado bloquea mutaciones ([BR-TRZ-003]).

## Conciliación bancaria
Los matches de **`BankReconciliation`** (sesión `DRAFT` → `IN_PROGRESS` → `CLOSED` — [D-032], [`STATE_MACHINES.md`](../01-domain/STATE_MACHINES.md) §24) marcan movimientos elegibles como **`RECONCILED`** sin alterar `date_accounting` salvo corrección auditada. Una sesión **`CLOSED`** no permite reordenar matches manualmente sin reapertura o nueva sesión; desconciliar respeta [BR-TRZ-002].
