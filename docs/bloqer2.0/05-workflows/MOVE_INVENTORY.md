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
2. Actualiza las cantidades físicas. El costo de consumo solo es calculable con valor y moneda trazables; el motor FIFO/promedio sigue diferido por D-083 y no se infiere valuación a partir de un nominal (D-124).

## Alcance operativo vigente

La creación de transferencia confirma un par atómico de movimientos; su anulación conserva la trazabilidad y comprueba el stock necesario para revertirlo. Los consumos e ingresos de recepción revalidan sus padres y existencias dentro de la transacción. El saldo físico pertenece al producto/depósito, con independencia de la imputación de obra/EDT. Los formularios mantienen datos tras errores y los listados/reportes respetan empresa y acceso a la obra del depósito.

## 6. Eventos
- `stock_movement.confirmed`

## Referencias
- [`STOCK_FORMULAS.md`](../04-formulas/STOCK_FORMULAS.md)
