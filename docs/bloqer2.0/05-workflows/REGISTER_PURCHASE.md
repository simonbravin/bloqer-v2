# Workflow: Registrar compra (con o sin OC)

## 1. Objetivo
Registrar compra según política: **OC → recepción → factura** o **factura directa** ([D-006], [D-020]).

## 2. Actor
PROCUREMENT.

## 3. Precondiciones
- Proveedor rol SUPPLIER; proyecto para imputación (salvo gasto general).

## 4. Pasos — Con OC
1. Crear **PurchaseOrder** borrador.
2. Aprobar y **confirmar** → impacta comprometido ([D-006]).
3. Registrar **Receipt** cuando ingresa bien/servicio.
4. Cargar **PurchaseInvoice** del proveedor → **Payable**.

> **Implementación UI (Bloqer v2):** la recepción confirmada **no** crea factura ni C×P automáticamente. Desde el detalle de la OC o de la recepción, usar **Registrar factura desde OC** (prellena borrador con cantidades recibidas). Luego **Emitir factura** en Facturas proveedor para generar la **Payable**; el pago se registra desde **Cuentas por pagar → Registrar pago**.

## 5. Pasos — Sin OC
1. Cargar **PurchaseInvoice** directamente imputada → impacta al confirmar factura ([D-006]).
2. Si hay stock: generar movimiento desde recepción implícita o ajuste (definir política).

## 6. Postcondiciones
- Costo proyecto actualizado según vista comprometido/pagado.

## 7. Eventos
- `purchase_order.confirmed`, `receipt.confirmed`, `purchase_invoice.issued`

## Referencias
- [`PROCUREMENT.md`](../02-modules/PROCUREMENT.md)
