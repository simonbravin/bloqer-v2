# Workflow: Cerrar período contable operativo

## 1. Objetivo
Congelar ediciones en un rango de fechas ([`PERIOD_CLOSE_AND_LOCKS.md`](../03-finance/PERIOD_CLOSE_AND_LOCKS.md)).

## 2. Actor
ADMIN / OWNER únicamente.

## 3. Precondiciones
- Todas las conciliaciones críticas completadas (recomendación proceso).

## 4. Pasos
1. **Administración** → Cierre de períodos.
2. Seleccionar mes/año.
3. Validar que no existan borradores pendientes críticos (advertencia, no bloqueo duro opcional).
4. **Cerrar** → `period.closed`.
5. Intentos de mutación en fechas cerradas → error `PERIOD_CLOSED`.

## 5. Reapertura
Motivo obligatorio → `period.reopened` auditado.

## Referencias
- [`APPROVAL_WORKFLOWS.md`](../01-domain/APPROVAL_WORKFLOWS.md) § Periodo
