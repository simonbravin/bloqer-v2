# Workflow: Movimiento de inventario

## 1. Objetivo
Registrar ingreso/egreso/ajuste/transferencia entre depósitos ([`INVENTORY.md`](../02-modules/INVENTORY.md)).

## 2. Actor
WAREHOUSE (+ PROCUREMENT en recepción desde OC).

## 3. Precondiciones
- Producto y depósito definidos.
- Stock suficiente para egresos.

## 4. Pasos — Transferencia entre depósitos
1. Seleccionar producto, cantidad, origen, destino.
2. Confirmar → genera **dos StockMovement** (`TRANSFER_OUT`, `TRANSFER_IN`) con `transfer_id`.

## 5. Pasos — Egreso a obra
1. Egreso con imputación a **project_id** y motivo.
2. Actualiza costo obra según valuación.

## 6. Eventos
- `stock_movement.confirmed`

## Referencias
- [`STOCK_FORMULAS.md`](../04-formulas/STOCK_FORMULAS.md)
