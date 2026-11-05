# Cuentas por pagar (AP)

## Definición
Obligación de la empresa hacia **proveedores/subcontratos/servicios** por facturas recibidas o cargas manuales ([D-009]).

**Capa devengada:** los saldos de AP forman parte del agregado **`accrued_amount`** de costo en reporting (obligación reconocida), distinto de **`committed_amount`** (OC confirmada sin factura) y de **`paid_amount`** (caja) — [`COST_FORMULAS.md`](../04-formulas/COST_FORMULAS.md) §1.

## Origen de Payable
1. **PurchaseInvoice** → AP según máquina de factura.
2. **SubcontractCertification APPROVED** → factura AP borrador → al emitir la factura nace CxP (D-089/D-131; BR-SUB-003); liquidación reflejada en settlement_status derivado (D-027/D-115), distinto de payment_status de la certificación cliente.
3. **Manual**: cuenta corriente fotocopiadora, etc.

## Pagos parciales
**Payment** con aplicaciones simétricas a AR ([D-010]).

## Estados y aging
Igual patrón que Receivable. Saldo: `balanceDue = originalAmount − paidAmount − creditedAmount` ([D-115]).

## Notas de crédito / débito ([D-115])
- **ND** en `SupplierInvoice`: al emitir crea `Payable` propia.
- **NC**: aplica `creditedAmount` a la Payable de la factura referenciada (sin egreso de caja).

## Relación tesorería
**AccountMovement OUTCOME** al confirmar pago.

## Reglas
- AP sin proyecto permitido ([D-009]).
- No pagar más que saldo ([BR-TRZ-005]).

## Reportes
Aging AP, proyección egresos ([`CASHFLOW_PROJECTION.md`](./CASHFLOW_PROJECTION.md)).

## Clase financiera derivada ([D-102])

Etiqueta de solo lectura (no columna). Helper `classifySupplierInvoice`:

| classCode | Label UI | Hechos |
|---|---|---|
| `SUBCONTRACT` | Subcontrato | `subcontractCertificationId` (precede a OC) |
| `PURCHASE_COMMITTED` | Compra comprometida | `purchaseOrderId` o línea con `purchaseOrderLineId` |
| `DIRECT_PROJECT` | Costo directo de obra | `projectId` sin OC ni subcert |
| `OVERHEAD` | Gasto general | sin `projectId` |

Alta de obra: UX **Contra OC** vs **Costo directo** (no persiste el modo; solo guía FKs).
