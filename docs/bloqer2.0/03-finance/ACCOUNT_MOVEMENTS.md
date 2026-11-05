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
| `fxRate`, `amountArs` | Cotización manual (ARS por 1 unidad) y equivalente al confirmar, según D-008/D-134. Vacíos en históricos sin dato registrado. |
| `movementDate` | Fecha contable de la operación. Define el bloqueo del período y el asiento. |
| `valueDate` | Fecha valor de las piernas de transferencias nuevas según D-137. Opcional para movimientos históricos o sin fecha valor registrada. |
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
- **Apertura:** un saldo inicial no nulo crea un `OPENING_BALANCE` por su magnitud, ingreso para saldo positivo y egreso para negativo. El saldo inicial entra una sola vez en el saldo de cuenta ([D-136]).
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

AG-09 identificó la brecha física de `fxRate` y `amountArs`. AG-10 implementa D-134 con dos columnas opcionales, utilizadas en los movimientos nuevos. Facturas, `Collection` y `Payment` conservan sus propios snapshots. Los cobros y pagos copian el de la operación de caja al movimiento. Los históricos conservan su moneda e importe original. La posición en ARS señala faltantes de cotización cuando corresponda.
