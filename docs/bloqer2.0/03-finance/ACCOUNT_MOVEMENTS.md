# Account Movements — Ledger unificado

## Definición
**AccountMovement** es el **átomo financiero**: un registro de entrada o salida de dinero en una **Account**, con trazabilidad al documento origen.

## Campos conceptuales clave

| Campo | Descripción |
|---|---|
| `id` | Identificador |
| `tenant_id` | Aislamiento |
| `account_id` | Cuenta afectada |
| `type` | `INFLOW` \| `OUTFLOW` \| `TRANSFER_IN` \| `TRANSFER_OUT` \| `ADJUSTMENT` |
| `amount`, `currency` | Importe y moneda originales; ver [`MONEY_MODEL.md`](./MONEY_MODEL.md) |
| `fx_rate`, `amount_ars` | Exigencia conceptual D-008; no son columnas actuales de `AccountMovement` (ver hallazgo al pie) |
| `date_accounting` | Imputación contable |
| `date_value` | Acreditación bancaria |
| `status` | `CONFIRMED` \| `RECONCILED` \| `CANCELLED`; el movimiento nace confirmado, no hay borrador persistido |
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
- **UX Finanzas vs Tesorería:** `/finanzas/transacciones` es el ledger de **caja operativa** (cobros/pagos/ingresos/egresos con terceros) y **nunca** lista transferencias internas. Esas viven en `/tesoreria/transferencias` (historial del par) y en el **extracto de cuenta** `/tesoreria/cuentas/[accountId]` ([D-048](../00-product/DECISION_LOG.md)). La ruta legacy `/tesoreria/movimientos` redirige al extracto/listado de cuentas. La columna Contraparte no se muestra en el ledger UI; el campo sigue disponible en el alta de ingreso manual ([D-049](../00-product/DECISION_LOG.md)).

## Relación con capas de costo (`paid_amount`)

La capa **`paid_amount`** de reporting de **costo** (presupuesto vs real, rentabilidad en vista “pagado”) se alimenta de **pagos confirmados** y de **`AccountMovement` `OUTFLOW`** vinculados a esos pagos — no de obligaciones AP por sí solas ([`COST_FORMULAS.md`](../04-formulas/COST_FORMULAS.md) §1.3). **Internal transfers** no cuentan como costo de proyecto.

## Eventos
Ver [`EVENTS_AND_AUTOMATIONS.md`](../01-domain/EVENTS_AND_AUTOMATIONS.md) § AccountMovement.

## Integridad
- Periodo cerrado bloquea mutaciones ([BR-TRZ-003]).

## Conciliación bancaria
Los matches de **`BankReconciliation`** (sesión `DRAFT` → `IN_PROGRESS` → `CLOSED` — [D-032], [`STATE_MACHINES.md`](../01-domain/STATE_MACHINES.md) §24) marcan movimientos elegibles como **`RECONCILED`** sin alterar `date_accounting` salvo corrección auditada. Una sesión **`CLOSED`** no permite reordenar matches manualmente sin reapertura o nueva sesión; desconciliar respeta [BR-TRZ-002].

## Hallazgo — AG-09: términos y snapshot de moneda

Se armonizan los enums físicos `INFLOW/OUTFLOW` y la ausencia de `DRAFT` del movimiento, distinguiéndolo del borrador contable. La tabla mantiene campos conceptuales futuros; no afirma que todos estén implementados. En particular, `AccountMovement` no conserva `fxRate/amountArs`, mientras las facturas, `Collection` y `Payment` sí guardan sus snapshots. [P-AG10-01](../08-architecture/PENDING_ARCHITECTURE_ITEMS.md) registra la brecha respecto de D-008 para diseño de todos los escritores/lectores e históricos desconocidos. AG-09 no agrega columnas, no infiere FX 1 para movimientos extranjeros ni declara cerrada esa revisión de tesorería.
