# Workflow: Registrar gasto / factura no OC

## 1. Objetivo
Registrar obligaciones y pagos de **gastos generales** o compras menores sin OC previa.

## 2. Actor
FINANCE o PROCUREMENT según tipo.

## 3. Precondiciones
- Proveedor/servicio identificado como Contact.

## 4. Pasos
1. Cargar **PurchaseInvoice** o documento equivalente con categoría **gasto general**.
2. `project_id` vacío o prorrateo manual ([Q-013]).
3. Aprobar para pago y ejecutar [`REGISTER_PAYMENT.md`](./REGISTER_PAYMENT.md).

## 5. Postcondiciones
- AP y movimiento egreso actualizados.

## Referencias
- [`EXPENSES_AND_PAYMENTS.md`](../02-modules/EXPENSES_AND_PAYMENTS.md)
