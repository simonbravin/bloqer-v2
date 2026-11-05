# Workflow: Compra hasta pago (Procure-to-Pay)

## 1. Objetivo
Recorrer **OC → recepción(es) → factura borrador → emitir → CxP → pago** con trazabilidad completa.

## 2. Actor
PROCUREMENT + FINANCE.

## 3. Precondiciones
- OC confirmada; factura recibida.

## 4. Pasos
1. Matching factura vs OC/recepción (tolerancia cantidades).
2. Crear o completar el borrador de **SupplierInvoice** (implementación de `PurchaseInvoice`) con sus referencias e impuestos.
3. FINANCE **emite** la factura (`ISSUED`) según permisos y controles de compra; se genera **Payable**. No hay un estado documental `APPROVED` adicional en `SupplierInvoice`.
4. En fecha programada, crear **Payment** aplicado a **Payable**.
5. Confirmar pago → **AccountMovement OUTFLOW** `CONFIRMED`; en moneda extranjera se exige FX manual del pago y una cuenta de la misma moneda.
6. Retenciones/`TaxLine` fino son un diseño pendiente; no se simulan mediante impuestos negativos de la factura (D-133; [`TAX_FORMULAS.md`](../04-formulas/TAX_FORMULAS.md)).

## 5. Postcondiciones
- Payable `PAID` o `PARTIAL`; stock y costo actualizados según vistas.

## 6. Eventos
- `purchase_invoice.issued`, `payment.confirmed`, `payable.fully_paid`; si el pago aplica a AP originada en subcontrato, recalcula **`settlement_status`** ([BR-SUB-004]).

## 7. Subcontrato (certificación → AP → pago)
- `subcontract_certification.approved` → genera/habilita factura AP **borrador**; al emitirla se genera `Payable` ([BR-SUB-003], D-089/D-131).
- Certificación subcontrato: `DRAFT` → `ISSUED` → `APPROVED` | **`REJECTED`** ([BR-SUB-005]: rechazo **terminal**; nueva versión con `replaces_certification_id`).
- Solo una certificación **`APPROVED`** habilita esa factura; emitir el certificado no genera deuda. La CxP nace al emitir la factura, y pagos/NC determinan su liquidación derivada.

## Referencias
- [`EXPENSES_AND_PAYMENTS.md`](../02-modules/EXPENSES_AND_PAYMENTS.md), [`02-modules/SUBCONTRACTS.md`](../02-modules/SUBCONTRACTS.md)

## Hallazgo — AG-09: frontera documental/AP

El texto conservaba `APPROVED` de factura y Payable directo al aprobar subcontrato, contradiciendo D-089/D-131 y las máquinas actuales. Se precisa borrador → emisión → CxP y el enum `OUTFLOW`; no se agrega una aprobación ni se adelanta deuda. D-133 impide usar IVA/percepción negativos como sustituto de retenciones.
