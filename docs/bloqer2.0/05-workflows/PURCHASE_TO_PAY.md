# Workflow: Compra hasta pago (Procure-to-Pay)

## 1. Objetivo
Recorrer **OC → recepción(es) → factura → aprobación pago → pago** con trazabilidad completa.

## 2. Actor
PROCUREMENT + FINANCE.

## 3. Precondiciones
- OC confirmada; factura recibida.

## 4. Pasos
1. Matching factura vs OC/recepción (tolerancia cantidades).
2. **PurchaseInvoice** `ISSUED`.
3. FINANCE **aprueba para pago** `APPROVED`.
4. En fecha programada, crear **Payment** aplicado a **Payable**.
5. Confirmar pago → **AccountMovement OUTCOME** `CONFIRMED`.
6. Si retenciones → líneas `TaxLine` en pago ([`TAX_FORMULAS.md`](../04-formulas/TAX_FORMULAS.md)).

## 5. Postcondiciones
- Payable `PAID` o `PARTIAL`; stock y costo actualizados según vistas.

## 6. Eventos
- `purchase_invoice.issued`, `payment.confirmed`, `payable.fully_paid`; si el pago aplica a AP originada en subcontrato, recalcula **`settlement_status`** ([BR-SUB-004]).

## 7. Subcontrato (certificación → AP → pago)
- `subcontract_certification.approved` → genera `Payable` ([BR-SUB-003]).
- Certificación subcontrato: `DRAFT` → `SUBMITTED` → `APPROVED` | **`REJECTED`** ([BR-SUB-005]: rechazo **terminal**; nueva versión con `replaces_certification_id`).
- Solo **`APPROVED`** crea/incrementa AP.

## Referencias
- [`EXPENSES_AND_PAYMENTS.md`](../02-modules/EXPENSES_AND_PAYMENTS.md), [`02-modules/SUBCONTRACTS.md`](../02-modules/SUBCONTRACTS.md)
