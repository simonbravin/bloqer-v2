# Cuentas por pagar (AP)

## Definición
Obligación de la empresa hacia **proveedores/subcontratos/servicios** por facturas recibidas o cargas manuales ([D-009]).

**Capa devengada:** los saldos de AP forman parte del agregado **`accrued_amount`** de costo en reporting (obligación reconocida), distinto de **`committed_amount`** (OC confirmada sin factura) y de **`paid_amount`** (caja) — [`COST_FORMULAS.md`](../04-formulas/COST_FORMULAS.md) §1.

## Origen de Payable
1. **PurchaseInvoice** → AP según máquina de factura.
2. **`SubcontractCertification`** → AP **solo** en **`APPROVED`** ([BR-SUB-003]); liquidación hacia subcontrato reflejada en **`settlement_status`** derivado ([BR-SUB-004]), no confundir con `payment_status` de certificación a cliente.
3. **Manual**: cuenta corriente fotocopiadora, etc.

## Pagos parciales
**Payment** con aplicaciones simétricas a AR ([D-010]).

## Estados y aging
Igual patrón que Receivable.

## Relación tesorería
**AccountMovement OUTCOME** al confirmar pago.

## Reglas
- AP sin proyecto permitido ([D-009]).
- No pagar más que saldo ([BR-TRZ-005]).

## Reportes
Aging AP, proyección egresos ([`CASHFLOW_PROJECTION.md`](./CASHFLOW_PROJECTION.md)).
