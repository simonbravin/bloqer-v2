# Workflow: Registrar pago a proveedor

## 1. Objetivo
Ejecutar egreso imputando una o más **Payables** ([D-010]).

## 2. Actor
FINANCE.

## 3. Precondiciones
- Cuenta origen con saldo disponible (según política).
- Periodo abierto ([`PERIOD_CLOSE_AND_LOCKS.md`](../03-finance/PERIOD_CLOSE_AND_LOCKS.md)).

## 4. Pasos
1. **Pagos** → nuevo pago.
2. Seleccionar proveedor y facturas pendientes.
3. Distribuir montos (parciales permitidos).
4. Cargar retenciones si aplican.
5. Confirmar → genera movimiento egreso + marca Payables.

## 5. Postcondiciones
- Estados AP actualizados; tesorería refleja egreso.

## 6. Eventos
- `payment.confirmed`

## Referencias
- [`EXPENSES_AND_PAYMENTS.md`](../02-modules/EXPENSES_AND_PAYMENTS.md)
