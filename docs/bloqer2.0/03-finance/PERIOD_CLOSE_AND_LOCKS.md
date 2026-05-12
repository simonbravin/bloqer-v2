# Cierre de período y bloqueos

## Objetivo
Impedir mutaciones retroactivas en **movimientos financieros** una vez cerrado el mes (o período definido) ([D-014]).

## Entidad Period
`start_date`, `end_date`, `status OPEN|CLOSED`, auditoría de cierre/reapertura.

## Alcance del bloqueo
- **AccountMovement** con `date_accounting` ∈ período cerrado: **no crear/editar/anular** sin reapertura.
- Otros documentos operativos (OC, certificación) si impactan períodos cerrados: validación cruzada ([BR-PER-002]).

## Quién opera
Solo **ADMIN** y **OWNER** ([BR-PER-001]).

## Reapertura
Motivo obligatorio + audit log ([BR-PER-003]).

## Workflow
Ver [`../01-domain/APPROVAL_WORKFLOWS.md`](../01-domain/APPROVAL_WORKFLOWS.md) § Cierre de período.
