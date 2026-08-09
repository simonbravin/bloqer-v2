# Cierre de período y bloqueos

## Objetivo
Impedir mutaciones retroactivas en **movimientos financieros** y **asientos contables** una vez cerrado el mes (o período definido) ([D-014], [D-078]).

## Entidad Period
`periodKey` (YYYY-MM), `start_date`, `end_date`, `status OPEN|CLOSED`, `company_id`, auditoría de cierre/reapertura (`closed_by`, `closed_at`, motivo de reapertura).

Ámbito: **por empresa** del tenant (multi-company).

## Alcance del bloqueo
- **AccountMovement** con `movementDate` ∈ período cerrado: **no crear/editar/anular** sin reapertura ([BR-PER-002]). En docs legacy el campo se llama `date_accounting`; en Prisma es `movementDate`.
- **JournalEntry** con `entryDate` ∈ período cerrado: **no crear / editar / postear / anular borrador / revertir**.
- Otros documentos operativos (OC, certificación) si impactan períodos cerrados: validación cruzada diferida ([BR-PER-002] extensión).

## Quién opera
Solo **ADMIN** y **OWNER** ([BR-PER-001]) — permiso `PERIOD_CLOSE`.

## Reapertura
Motivo obligatorio + audit log ([BR-PER-003]).

## UI
`/contabilidad/cierres`

## Workflow
Ver [`../01-domain/APPROVAL_WORKFLOWS.md`](../01-domain/APPROVAL_WORKFLOWS.md) § Cierre de período y [`../05-workflows/CLOSE_PERIOD.md`](../05-workflows/CLOSE_PERIOD.md).

## No confundir
El cierre de **gastos generales AUTO_WEIGHT** (`OverheadPeriodClose`, [D-043]) es independiente: congela prorrateo GG, no bloquea tesorería ni GL.
