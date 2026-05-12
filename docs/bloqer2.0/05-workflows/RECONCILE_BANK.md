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
5. Cerrar sesión cuando cuadra → movimientos `RECONCILED`.

## 5. Postcondiciones
- Saldo sistema alineado con banco a fecha valor.

## 6. Eventos
- `account_movement.reconciled`, `bank_reconciliation.closed`

## Referencias
- [`OPEN_QUESTIONS.md`](../00-product/OPEN_QUESTIONS.md) Q-007
