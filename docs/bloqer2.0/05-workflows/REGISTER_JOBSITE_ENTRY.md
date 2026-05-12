# Workflow: Registrar parte de obra

## 1. Objetivo
Cargar **JobsiteLogEntry** diario con evidencias ([`JOBSITE_LOG.md`](../02-modules/JOBSITE_LOG.md)).

## 2. Actor
FOREMAN o PM.

## 3. Precondiciones
- Proyecto activo; permiso EDIT libro obra.

## 4. Pasos
1. Seleccionar proyecto y fecha.
2. Completar clima, cuadrilla, tareas, incidencias.
3. Adjuntar fotos.
4. Enviar `SUBMITTED`.
5. PM **Aprueba** → `APPROVED`.

## 5. Postcondiciones
- Parte inmutable salvo anulación con motivo.

## 6. Eventos
- `jobsite_log.submitted`, `jobsite_log.approved`

## Referencias
- [`STATE_MACHINES.md`](../01-domain/STATE_MACHINES.md) § JobsiteLogEntry
