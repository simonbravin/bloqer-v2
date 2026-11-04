# Workflow: Crear presupuesto

## 1. Objetivo
Construir WBS + ítems + análisis de costo + precios para una obra.

## 2. Actor inicial
PM o ADMIN.

## 3. Precondiciones
- Proyecto `DRAFT` o `ACTIVE` (planificación, [D-042]); en pausa, finalizado o cancelado no se modifica.
- Permiso EDIT en Presupuestos.

## 4. Pasos
1. Abrir proyecto → “Nuevo presupuesto”.
2. Definir **Budget** borrador: nombre, moneda y parámetros económicos. El vínculo a contrato formal no está implementado ([Q-057]); la adenda operativa usa `parentBudgetId`.
3. Crear **WBS** y **CostItems** ([`WBS_AND_COST_ITEMS.md`](../02-modules/WBS_AND_COST_ITEMS.md)).
4. Completar **CostAnalysisLines** por ítem.
5. Configurar **BudgetSettings** (GG%, utilidad, impuestos).
6. Validar totales ([`BUDGET_FORMULAS.md`](../04-formulas/BUDGET_FORMULAS.md)).
7. **Enviar a revisión**. Un aprobador autoriza desde `IN_REVIEW`; no hay aprobación directa desde `DRAFT`.

## 5. Postcondiciones
- Budget en `DRAFT` o `IN_REVIEW`. En revisión se bloquean economía y EDT; una devolución permite corregir en `RETURNED_FOR_CHANGES` y reenviar.

## 6. Eventos generados
- `budget.created`, `budget.submitted_for_review`.

## 7. Alternativos
- Importar desde plantilla / copiar versión anterior ([Q-026]).

## Referencias
- [`../02-modules/BUDGETS.md`](../02-modules/BUDGETS.md)

## Hallazgo — AG-04: precondiciones y aprobación

El workflow conservaba el requisito `ACTIVE`, un vínculo a contrato no expuesto y la alternativa de aprobación directa. Se alinea con D-042, D-030, la máquina de estados vigente y el alcance implementado; las plantillas y contratos formales siguen sujetos a Q-026/Q-057.
