# Cuentas por cobrar (AR)

## Definición
Obligación del **cliente** hacia la empresa por facturas/certificaciones emitidas o cargas manuales ([D-009], [D-051]).

## Origen de una Receivable
1. **SalesInvoice** emitida (automático). Si la factura referencia una **`certification_id`**, las cobranzas y el saldo de esa AR **alimentan el `payment_status` derivado** de la certificación ([BR-CERT-PAYMENT-001]); **no** existe `INVOICED` ni “pagada” en `Certification.status` ([BR-CERT-007]).
2. **Manual / corporativa:** factura de venta sin proyecto vía Registrar transacción (`AR_INCOME`) — capacitaciones, venta de materiales, servicios de estructura ([D-051]).
3. **Solo caja (sin CxC):** `TREASURY_INFLOW` / `MANUAL_ADJUSTMENT` — no crea `Receivable` ([D-037], [D-049]).

## Campos principales
`originalAmount`, `paidAmount`, `creditedAmount`, `balanceDue` (calculado = original − paid − credited), `dueDate`, `currency`, `projectId?`, `clientContactId`, `status`.

## Notas de crédito / débito ([D-115])
- **ND** (`documentKind = DEBIT_NOTE`): al emitir crea Receivable propia (aumenta deuda).
- **NC** (`documentKind = CREDIT_NOTE`): al emitir aplica crédito a la Receivable de la factura referenciada (`creditedAmount`); no crea Receivable ni movimiento de caja.

## Estados derivados
Ver máquina Receivable ([`STATE_MACHINES.md`](../01-domain/STATE_MACHINES.md)); vencimiento derivado al consultar y detección por job diario. **Saldada** (`PAID`) significa sin saldo pendiente: puede resultar de caja, créditos NC o ambos. `paidAmount` contiene solo caja; `creditedAmount` contiene crédito. Consultar una deuda no regulariza esos importes históricos.

## Cobranzas parciales
Una deuda puede recibir varias cobranzas parciales ([D-010]). La implementación actual vincula cada `Collection` con una `Receivable`; no existe una tabla de aplicaciones múltiples ni una selección batch de deudas por cobranza. **Cobrar saldo total** aplica el saldo almacenado en el servidor ([D-053]).

## Relación con tesorería
Al confirmar cobranza → un único evento **`collection.confirmed`** con efectos consolidados ([`EVENTS_AND_AUTOMATIONS.md`](../01-domain/EVENTS_AND_AUTOMATIONS.md) §3.3, [D-029]): **AccountMovement INFLOW**, aplicación a AR, **`receivable.payment_status_recalculated`** en certificaciones vinculadas (**no** cambia `Certification.status`). Vencimientos: **`receivable.overdue_detected`** + recálculo derivado (§3.3b, [D-031]).

## Reglas
- AR sin proyecto permitido ([D-009], [D-051], [BR-AR-003]).
- Anulación factura → anular AR ([BR-AR-004]).
- Aging / listado empresa etiquetan filas sin obra como **“Empresa”**.
- Cuenta y deuda en la misma moneda y ámbito compatible; FX manual del cobro extranjero, independiente del snapshot de la factura ([D-008]). Consultar CxC no requiere Tesorería activa; crear o revertir caja exige el módulo y los permisos correspondientes.
- Anular una cobranza confirmada exige motivo; el historial identifica las anuladas. Anular una NC restaura crédito pendiente sin simular una salida de caja.
- Facturas/NC/ND usan IVA y percepción no negativos conforme D-133; no se recalculan documentos históricos.

## Reportes
Aging por buckets ([`FINANCIAL_REPORTS.md`](./FINANCIAL_REPORTS.md)) y totales **por moneda**. No sumar ARS con USD. Detalle y CSV separan original, caja aplicada, crédito y saldo; snapshots y proyecciones descuentan las NC aplicadas.

## Hallazgo — AG-09: saldo derivado y aplicación real

Se aclara la relación física `Collection → Receivable`, el enum `INFLOW` y la separación D-115 entre caja/crédito. La lectura de saldo puede derivar **Saldada** sin escribir dinero ni estado sobre históricos; los totales multimoneda se presentan separados.
