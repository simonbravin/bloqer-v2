# Workflow: Transferencia entre cuentas propias

## 1. Objetivo
Mover fondos entre cuentas del tenant con **dos movimientos enlazados** ([D-023]).

## 2. Actor
FINANCE.

## 3. Precondiciones
- Dos **Account** activas; saldo origen suficiente.

## 4. Pasos
1. **Transferencias** → nueva.
2. Origen, destino, montos, monedas, `fx_rate` si cruza moneda.
3. `date_accounting` y `date_value` para cada pierna (o compartidas según UI).
4. Confirmar → crea par `AccountMovement` con mismo `transfer_id`.

## 5. Postcondiciones
- Saldos ambas cuentas actualizados.

## 6. Eventos
- `internal_transfer.created`

## Referencias
- [`INTERNAL_TRANSFERS.md`](../02-modules/INTERNAL_TRANSFERS.md)
