# Conciliación bancaria

## 1. Objetivo
Emparejar **movimientos internos** (`AccountMovement`) con **líneas de extracto bancario** para detectar diferencias, pendientes y fraudes operativos ([Q-007]).

## 2. Usuarios y roles que lo usan
- **FINANCE**, **ADMIN**.

## 3. Problema que resuelve
Saldos que no cuadran con banco real; cheques/pagos no acreditados.

## 4. Datos que consume (inputs)
- Extracto: **manual** en Fase 1 (carga línea a línea o CSV futuro).
- Movimientos `CONFIRMED` de la cuenta.

## 5. Datos que produce (outputs)
- **BankReconciliation** por periodo/cuenta.
- Movimientos pasan a `RECONCILED` cuando matchean.

## 6. Entidades principales
- **BankReconciliation**, líneas extracto (conceptual).

## 7. Estados y transiciones
**`BankReconciliation`** (sesión por cuenta/rango): `DRAFT` → `IN_PROGRESS` → `CLOSED` \| `CANCELLED` ([`STATE_MACHINES.md`](../01-domain/STATE_MACHINES.md) §24, [D-032]).  
- **`DRAFT`:** creada, sin trabajo de match consolidado.  
- **`IN_PROGRESS`:** operador empareja extracto vs movimientos.  
- **`CLOSED`:** sesión cerrada; **no** se editan matches manuales sin **reapertura formal** o **nueva sesión**.  
- **`CANCELLED`:** anulada sin efectos activos de sesión.

## 8. Acciones disponibles
- Importar extracto (Fase 2 CSV/OFX).
- Marcar parejas manualmente.
- Crear movimiento faltante desde diferencia (ajuste).
- Desconciliar movimiento ([BR-TRZ-002]).

## 9. Pantallas y vistas necesarias
- Vista dos columnas: extracto vs sistema.
- Resumen diferencias.

## 10. Reglas de negocio
- Movimiento `RECONCILED` no editable sin desconciliar ([BR-TRZ-002]).
- Conciliación no altera `date_accounting` salvo proceso de corrección auditado.

## 11. Validaciones
- Saldo inicial + Σ extracto = saldo final declarado.

## 12. Fórmulas relacionadas
- Diferencia = saldo banco − saldo sistema a fecha valor ([`TREASURY_BALANCE_FORMULAS.md`](../04-formulas/TREASURY_BALANCE_FORMULAS.md)).

## 13. Casos borde
- Débitos bancarios no cargados en sistema: crear egreso desde conciliación.

## 14. Reportes relacionados
- Estado conciliación mensual por cuenta.

## 15. Relación con otros módulos
- **Tesorería**, **Cuentas bancarias**.

## 16. Permisos
Solo FINANCE/ADMIN.

## 17. Eventos disparados / consumidos
- `bank_reconciliation.started`, `bank_reconciliation.closed`, `bank_reconciliation.cancelled`; en ledger: `account_movement.reconciled` al confirmar match ([`EVENTS_AND_AUTOMATIONS.md`](../01-domain/EVENTS_AND_AUTOMATIONS.md) §2.14e, [D-032]).

## 18. Fase de implementación
**Fase 1** manual; **importación** Fase 2 ([Q-007]).

## 19. Preguntas abiertas
- Formato importación prioridad ([Q-007]).
