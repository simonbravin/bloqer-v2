# Workflow: Crear orden de cambio

## 1. Objetivo
Documentar cambio de alcance/precio en obra con aprobación ([`CHANGE_ORDERS.md`](../02-modules/CHANGE_ORDERS.md)).

## 2. Actor
PM.

## 3. Precondiciones
- Proyecto `ACTIVE`.
- Identificación de ítems WBS afectados.

## 4. Pasos
1. Crear **ChangeOrder** `DRAFT`.
2. Describir motivo y adjuntar respaldo (RFI, mail).
3. Simular impacto económico por línea.
4. Enviar a `SUBMITTED`.
5. Aprobador (ADMIN/OWNER) → `APPROVED`.
6. **Aplicar** (`APPLIED`): cierra el circuito operativo del CO. **No** escribir en `Budget` `CLOSED` ni alterar precio vendido / WBS contractual sin **Adenda** + budget complementario. Si el cambio es contractual, iniciar o completar [`ADD_PHASE_OR_ADDENDUM.md`](./ADD_PHASE_OR_ADDENDUM.md) ([BR-CO-002], [BR-CO-003]).

## 5. Postcondiciones
- Cambio operativo trazado; impacto contractual/económico reflejado solo tras **Adenda** cuando corresponda.

## 6. Eventos
- `change_order.*`

## Referencias
- [`APPROVAL_WORKFLOWS.md`](../01-domain/APPROVAL_WORKFLOWS.md) § Change Order
