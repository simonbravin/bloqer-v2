# Workflow: Conciliar banco

## 1. Objetivo
Cuadrar extracto con movimientos internos ([`BANK_RECONCILIATION.md`](../02-modules/BANK_RECONCILIATION.md)).

## 2. Actor
FINANCE.

## 3. Precondiciones
- Extracto disponible (manual Fase 1).

## 4. Pasos
1. Abrir conciliación por cuenta y rango fechas.
2. Ingresar saldos inicial/final del extracto.
3. Marcar pares extracto ↔ movimiento sistema.
4. Crear movimientos faltantes si hay diferencias justificadas.
5. Revisar la diferencia entre el saldo final del banco y el saldo del libro calculado por fecha valor, cuando esté disponible.
6. Cerrar cuando el extracto cuadra aritméticamente y los movimientos y líneas del período están emparejados. Ver D-075.

## 5. Postcondiciones
- La sesión queda cerrada y sus emparejamientos se conservan. La diferencia de saldos se muestra por separado para poder identificar arrastres anteriores al rango.

## 5b. Reapertura
Sesión `CLOSED` → **Reabrir** con motivo → `IN_PROGRESS` ([D-080]); matches se conservan.

## 6. Eventos
- `account_movement.reconciled`, `bank_reconciliation.closed`, `bank_reconciliation.reopened`

## Referencias
- [`OPEN_QUESTIONS.md`](../00-product/OPEN_QUESTIONS.md) Q-007
