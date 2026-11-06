# Workflow: Registrar cobranza de cliente

## 1. Objetivo
Registrar un ingreso parcial o total aplicado a una **Receivable** ([D-010]). Una deuda puede recibir varios cobros.

## 2. Actor
FINANCE / SALES según política.

## 3. Precondiciones
- Factura emitida con saldo, período abierto, Tesorería activa y permisos sobre la deuda y la cuenta de destino.

## 4. Pasos
1. Abrir la obligación en **Cuentas por cobrar** de la obra o de la empresa y elegir **Cobrar**. En la empresa también se puede iniciar desde **Finanzas → Transacciones → Registrar transacción**.
2. Elegir cuenta de destino de la misma moneda, fecha y monto parcial, o aplicar el saldo total que verifica el servidor.
3. Para moneda extranjera, cargar el tipo de cambio manual de la cobranza en ARS por unidad, con hasta seis decimales ([D-008]).
4. Confirmar para guardar **Collection** y el **AccountMovement** `INFLOW` y actualizar la deuda en la misma operación.

## 5. Postcondiciones
- Receivable actualizado; posible `fully_paid`.
- Si proviene de una certificación, su estado financiero se deriva de la deuda y las cobranzas. El ciclo documental de la certificación se conserva.

## Hallazgo — AG-14: entrada y aplicación de la cobranza

El texto anterior indicaba un alta desde Cobranzas, selección de varias facturas y `INCOME`. El recorrido de D-010 aplica un cobro a una obligación y usa `INFLOW`. Las entradas y los controles reflejan la operación actual.

## 6. Eventos
- `collection.confirmed`, `receivable.fully_paid`

## Referencias
- [`SALES_AND_COLLECTIONS.md`](../02-modules/SALES_AND_COLLECTIONS.md)
