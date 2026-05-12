# Workflow: Crear presupuesto

## 1. Objetivo
Construir WBS + ítems + análisis de costo + precios para una obra.

## 2. Actor inicial
PM o ADMIN.

## 3. Precondiciones
- Proyecto `ACTIVE`.
- Permiso EDIT en Presupuestos.

## 4. Pasos
1. Abrir proyecto → “Nuevo presupuesto”.
2. Definir **Budget** borrador: nombre, moneda, vínculo contrato opcional.
3. Crear **WBS** y **CostItems** ([`WBS_AND_COST_ITEMS.md`](../02-modules/WBS_AND_COST_ITEMS.md)).
4. Completar **CostAnalysisLines** por ítem.
5. Configurar **BudgetSettings** (GG%, utilidad, impuestos).
6. Validar totales ([`BUDGET_FORMULAS.md`](../04-formulas/BUDGET_FORMULAS.md)).
7. **Enviar a revisión** (opcional) o solicitar aprobación directa.

## 5. Postcondiciones
- Budget en `DRAFT` o `IN_REVIEW` (si política permite edición bajo revisión).

## 6. Eventos generados
- `budget.created`, `budget.submitted_for_review`.

## 7. Alternativos
- Importar desde plantilla / copiar versión anterior ([Q-026]).

## Referencias
- [`../02-modules/BUDGETS.md`](../02-modules/BUDGETS.md)
