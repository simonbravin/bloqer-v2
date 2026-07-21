# Cuentas por cobrar (AR)

## Definición
Obligación del **cliente** hacia la empresa por facturas/certificaciones emitidas o cargas manuales ([D-009], [D-051]).

## Origen de una Receivable
1. **SalesInvoice** emitida (automático). Si la factura referencia una **`certification_id`**, las cobranzas y el saldo de esa AR **alimentan el `payment_status` derivado** de la certificación ([BR-CERT-PAYMENT-001]); **no** existe `INVOICED` ni “pagada” en `Certification.status` ([BR-CERT-007]).
2. **Manual / corporativa:** factura de venta sin proyecto vía Registrar transacción (`AR_INCOME`) — capacitaciones, venta de materiales, servicios de estructura ([D-051]).
3. **Solo caja (sin CxC):** `TREASURY_INFLOW` / `MANUAL_ADJUSTMENT` — no crea `Receivable` ([D-037], [D-049]).

## Campos principales
`total_amount`, `paid_amount`, `balance`, `due_date`, `currency`, `project_id?`, `client_id`, `status`.

## Estados derivados
Ver máquina Receivable ([`STATE_MACHINES.md`](../01-domain/STATE_MACHINES.md)); `OVERDUE` por job diario.

## Cobranzas parciales
**Collection** con líneas `applies_to`: cada línea `(receivable_id, amount)` ([D-010]).

## Relación con tesorería
Al confirmar cobranza → un único evento **`collection.confirmed`** con efectos consolidados ([`EVENTS_AND_AUTOMATIONS.md`](../01-domain/EVENTS_AND_AUTOMATIONS.md) §3.3, [D-029]): **AccountMovement INCOME**, aplicación a AR, **`receivable.payment_status_recalculated`** en certificaciones vinculadas (**no** cambia `Certification.status`). Vencimientos: **`receivable.overdue_detected`** + recálculo derivado (§3.3b, [D-031]).

## Reglas
- AR sin proyecto permitido ([D-009], [D-051], [BR-AR-003]).
- Anulación factura → anular AR ([BR-AR-004]).
- Aging / listado empresa etiquetan filas sin obra como **“Empresa”**.

## Reportes
Aging por buckets ([`FINANCIAL_REPORTS.md`](./FINANCIAL_REPORTS.md)).
