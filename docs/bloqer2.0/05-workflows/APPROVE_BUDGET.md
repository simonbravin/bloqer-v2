# Workflow: Aprobar y cerrar presupuesto

## 1. Objetivo
Pasaje `IN_REVIEW → APPROVED → CLOSED`, con camino **`RETURNED_FOR_CHANGES`** cuando el revisor pide correcciones ([`APPROVAL_WORKFLOWS.md`](../01-domain/APPROVAL_WORKFLOWS.md), [D-030]).

## 2. Actor
ADMIN / OWNER (PM si habilitado).

## 3. Precondiciones
- Budget completo según [BR-BUD-005].
- Permiso APPROVE.

## 4. Pasos
1. Abrir budget en `IN_REVIEW` (o `DRAFT` / `RETURNED_FOR_CHANGES` → enviar a `IN_REVIEW`).
2. Revisar totales y análisis de costos.
3. Si hay correcciones estructurales: **Devolver para cambios** → `RETURNED_FOR_CHANGES` (`budget.returned_for_changes`). El autor edita; luego **`budget.submitted_for_review`** → `IN_REVIEW` otra vez.
4. Si OK: **Aprobar** → `APPROVED` (`budget.approved`) — estructura económica bloqueada; metadata según [BR-BUD-006].
5. Opcional: **Cerrar** → `CLOSED` (`budget.closed`) al fijar base contractual/comercial ([BR-BUD-002], [D-005]). En `CLOSED` solo metadata [BR-BUD-008].

## 5. Postcondiciones
- Habilitadas certificaciones contra ítems del budget vigente.

## 6. Eventos
- `budget.submitted_for_review`, `budget.returned_for_changes`, `budget.approved`, `budget.closed`.

## Referencias
- [`STATE_MACHINES.md`](../01-domain/STATE_MACHINES.md) § Budget
