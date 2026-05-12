# Workflow: Registrar cobranza de cliente

## 1. Objetivo
Registrar ingreso aplicado a **Receivables** ([D-010]).

## 2. Actor
FINANCE / SALES según política.

## 3. Precondiciones
- Facturas emitidas con saldo > 0.

## 4. Pasos
1. **Cobranzas** → nueva cobranza.
2. Seleccionar cliente y facturas/saldos.
3. Indicar cuenta destino y FX si distinto.
4. Confirmar → **AccountMovement INCOME**.

## 5. Postcondiciones
- Receivable actualizado; posible `fully_paid`.

## 6. Eventos
- `collection.confirmed`, `receivable.fully_paid`

## Referencias
- [`SALES_AND_COLLECTIONS.md`](../02-modules/SALES_AND_COLLECTIONS.md)
