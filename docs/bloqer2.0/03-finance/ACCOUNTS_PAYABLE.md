# Cuentas por pagar (AP)

## Definición
Obligación de la empresa hacia **proveedores/subcontratos/servicios** por facturas recibidas o cargas manuales ([D-009]).

**Capa devengada:** los saldos de AP forman parte del agregado **`accrued_amount`** de costo en reporting (obligación reconocida), distinto de **`committed_amount`** (OC confirmada sin factura) y de **`paid_amount`** (caja) — [`COST_FORMULAS.md`](../04-formulas/COST_FORMULAS.md) §1.

## Origen de Payable
1. **PurchaseInvoice** / implementación `SupplierInvoice` emitida (`ISSUED`) → AP. Un borrador no genera deuda.
2. **SubcontractCertification APPROVED** → factura AP borrador → al emitir la factura nace CxP (D-089/D-131; BR-SUB-003); liquidación reflejada en settlement_status derivado (D-027/D-115), distinto de payment_status de la certificación cliente.
3. **Manual**: cuenta corriente fotocopiadora, etc.

## Pagos parciales
Una CxP admite varios `Payment` parciales ([D-010]); cada pago actual se aplica a una `Payable`. **Pagar saldo total** usa el saldo guardado en el servidor ([D-053]).

## Estados y aging
Igual patrón que Receivable. Saldo: `balanceDue = originalAmount − paidAmount − creditedAmount` ([D-115]). La etiqueta **Saldada** (`PAID`) puede combinar pagos y créditos NC; no acredita por sí sola una salida de caja. Las consultas derivan la presentación sin regularizar importes históricos ni cambiar el ciclo documental `DRAFT/ISSUED/CANCELLED` de la factura.

## Notas de crédito / débito ([D-115])
- **ND** en `SupplierInvoice`: al emitir crea `Payable` propia.
- **NC**: aplica `creditedAmount` a la Payable de la factura referenciada (sin egreso de caja).

## Relación tesorería
**AccountMovement OUTFLOW** al confirmar pago. Pago/deuda/cuenta conservan la misma moneda y un ámbito compatible; moneda extranjera exige FX manual del pago, con snapshot propio ([D-008]).

## Reglas
- AP sin proyecto permitido ([D-009]).
- No pagar más que saldo ([BR-TRZ-005]).
- Anular un pago confirmado o un documento emitido exige motivo; el historial distingue confirmados y anulados.
- IVA y percepción no negativos en facturas y notas conforme D-133; los borradores inválidos deben corregirse antes de emitir y no se recalculan documentos históricos.

## Reportes
Aging AP, proyección egresos ([`CASHFLOW_PROJECTION.md`](./CASHFLOW_PROJECTION.md)). Totales por moneda, sin sumar ARS con USD. Detalle y CSV distinguen original, pagos, crédito NC y saldo; proyecciones usan ese saldo neto.

## Clase financiera derivada ([D-102])

Etiqueta de solo lectura (no columna). Helper `classifySupplierInvoice`:

| classCode | Label UI | Hechos |
|---|---|---|
| `SUBCONTRACT` | Subcontrato | `subcontractCertificationId` (precede a OC) |
| `PURCHASE_COMMITTED` | Compra comprometida | `purchaseOrderId` o línea con `purchaseOrderLineId` |
| `DIRECT_PROJECT` | Costo directo de obra | `projectId` sin OC ni subcert |
| `OVERHEAD` | Gasto general | sin `projectId` |

Alta de obra: UX **Contra OC** vs **Costo directo** (no persiste el modo; solo guía FKs).

## Hallazgo — AG-09: emisión, caja y crédito

Se reemplaza el término `OUTCOME` por `OUTFLOW` y se precisa que el saldo pertenece a `Payable`, no al estado documental de la factura. D-089/D-131 mantienen la factura borrador de subcontrato como paso previo a CxP; D-115 distingue el crédito aplicado de los pagos efectivos.
