# Workflow: Agregar fase / adenda presupuestaria

## 1. Objetivo
Incorporar **nuevo alcance** vía **Addendum** contractual y **Budget** hijo que complementa el vigente ([D-002], [D-005]).

## 2. Actor
ADMIN / PM con permiso.

## 3. Precondiciones
- Contrato base activo o política interna que habilita adenda.
- Cambio que afecta **precio vendido, alcance contractual o WBS contractual** (típicamente con base en `CLOSED` o contrato vigente) — vehículo **Adenda**, no solo Change Order ([BR-CO-003], [D-005]).
- Un **Change Order** aprobado puede ser el **origen documental** del pedido de adenda, pero la adenda es quien formaliza el impacto contractual.

## 4. Pasos
1. **Contratos** → registrar **Addendum** con monto y alcance ([`CONTRACTS_AND_ADDENDUMS.md`](../02-modules/CONTRACTS_AND_ADDENDUMS.md)).
2. Crear **nuevo Budget** con `parent_budget_id` apuntando al activo (`CLOSED` o cadena vigente).
3. Construir WBS incremental (solo ítems nuevos o ajustes contractuales).
4. Aprobar nuevo budget complementario.
5. Marcar como **fase activa** conjunta: sistema interpreta presupuesto proyecto = suma versiones activas ([D-002]).

## 5. Postcondiciones
- Certificaciones pueden usar nuevos topes por ítem.

## 6. Eventos
- `contract.addendum_added`, `budget.addendum_added`.

## Referencias
- [`DECISION_LOG.md`](../00-product/DECISION_LOG.md) D-002, D-005
