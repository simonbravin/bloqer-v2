# Workflow: Registrar pago a proveedor

## 1. Objetivo
Ejecutar un egreso aplicado a una **Payable**, parcial o total ([D-010]). La misma deuda puede recibir varios pagos; la selección batch de obligaciones no forma parte de este flujo.

## 2. Actor
FINANCE.

## 3. Precondiciones
- Cuenta origen con saldo disponible (según política).
- Periodo abierto ([`PERIOD_CLOSE_AND_LOCKS.md`](../03-finance/PERIOD_CLOSE_AND_LOCKS.md)).
- CxP emitida con saldo, acceso a su empresa/obra y permisos de la operación; Tesorería activa.
- Cuenta compatible con la empresa de la deuda y de la misma moneda.

## 4. Pasos
1. **Cuentas por pagar** de la obra o empresa → abrir la obligación → **Pagar / Registrar pago**. En empresa también existe **Finanzas → Transacciones → Registrar transacción → Pago**; no se requiere un menú nuevo «Pagos».
2. Elegir cuenta y fecha del pago.
3. Cargar el monto parcial o usar **Pagar saldo total**, que aplica el saldo guardado en servidor ([D-053]).
4. En moneda extranjera ingresar el **tipo de cambio manual del pago**, ARS por 1 unidad, hasta 6 decimales ([D-008]); método y referencia son opcionales. El circuito fino de retenciones/`TaxLine` sigue pendiente y no se simula mediante IVA/percepción negativos de factura (D-133).
5. Confirmar → genera `Payment` y movimiento `OUTFLOW`, y actualiza la CxP en la misma operación. Bloquea si faltan fondos o el período está cerrado.

## 5. Postcondiciones
- Saldo/estado AP actualizados; tesorería refleja el egreso. **Saldada** puede combinar pagos y créditos NC, por lo que no equivale necesariamente a pago íntegro en caja.
- El detalle permite consultar la factura/CxP de origen y **Cancelar pago** con motivo y permisos. Se conservan registros anulados; un pago conciliado exige desconciliar antes.

## 6. Eventos
- `payment.confirmed`

## Referencias
- [`EXPENSES_AND_PAYMENTS.md`](../02-modules/EXPENSES_AND_PAYMENTS.md)

## Hallazgo — AG-09: punto de entrada y alcance actual

La descripción anterior anunciaba un menú de alta «Pagos», aplicación a varias deudas y retenciones que no están expuestos en el flujo actual. Se armoniza con CxP → Registrar pago, una obligación por operación y FX manual propio; no se agrega una función batch ni se modifica D-010.
