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
3. Guardar el borrador y adjuntar fotos desde su detalle.
4. Enviar `SUBMITTED`.
5. Un supervisor puede **Devolver con observaciones** a `DRAFT` o **Aprobar parte** → `APPROVED`.

## 5. Postcondiciones
- `APPROVED` es el estado de cierre. **Anular parte** lleva de `DRAFT` a `CANCELLED` según la máquina de estados.
- El consumo de inventario y la sincronización del Real se registran al aprobar cuando corresponde.

## Hallazgo AG-11

La redacción anterior mencionaba anular un parte aprobado. La máquina de estados §17 y el servicio reservan la anulación al borrador. La edición del contenido se cierra al aprobar.

## 6. Eventos
- `jobsite_log.submitted`, `jobsite_log.approved`, `jobsite_log.returned`

## Referencias
- [`STATE_MACHINES.md`](../01-domain/STATE_MACHINES.md) § JobsiteLogEntry
