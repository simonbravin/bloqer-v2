# Cronograma / Planificación temporal

## 1. Objetivo
Planificar **cuándo** ocurre el trabajo de la obra (tareas, hitos, dependencias) y permitir comparar **planificado vs ejecutado** frente al avance físico y las certificaciones ([D-017]).

## 2. Usuarios y roles que lo usan
- **PM**, **ADMIN**, **OWNER**, **SITE_FOREMAN** (consulta/edición limitada según permiso).

## 3. Problema que resuelve
Sin cronograma, el costo puede estar “al día” pero la obra retrasada — o certificar sin respaldo temporal.

## 4. Datos que consume (inputs)
- **Project**.
- Opcionalmente ítems **WBS** para vínculo tarea ↔ ítem ([Q-004]).
- Calendario laboral / feriados (Fase 2).

## 5. Datos que produce (outputs)
- **Schedule** con **ScheduleItem** (tareas y/o hitos).
- Curva de avance planificado vs real (reporte).

## 6. Entidades principales
- **Schedule**, **ScheduleItem** (tipo `TASK` | `MILESTONE`).

## 7. Estados y transiciones
- **`Schedule`:** contenedor sin máquina de estados propia en Fase 1 (ver [`STATE_MACHINES.md`](../01-domain/STATE_MACHINES.md) §27).
- **`ScheduleItem`:** `PLANNED` → `IN_PROGRESS` → `COMPLETED`; ramas `BLOCKED`, `CANCELLED`; causa obligatoria en `BLOCKED`.

## 8. Acciones disponibles
- Crear/editar cronograma (Gantt y/o lista de hitos según [Q-003]).
- Ubicar ítem en el árbol (`parent_id` + `sort_order`): al crear (después de / bajo) y reordenar (↑↓, indent/outdent) — [D-103].
- Vincular tarea a `CostItem` / `WbsNode`.
- Registrar avance % de tarea (manual excepcional; **automático desde libro de obra al aprobar** en `TASK` — [D-045] / [D-103] / [BR-SCH-004]; hitos no sincronizan desde libro; hitos se completan a mano o por recepción — [D-104] / [BR-SCH-005]).
- Editar fechas y dependencias FS (advertencias no bloqueantes si hay conflicto).
- Importar WBS: estructura sin fechas por defecto; fechas de borrador opt-in; rollup de contenedores ([D-046]).

## 9. Pantallas y vistas necesarias
- Vista Gantt (si Fase 1 incluye).
- Lista de hitos con fechas y alertas de desvío (filtro Tipo = Hitos).
- Comparativa plan vs físico ([`../06-reports/OPERATIONAL_REPORTS.md`](../06-reports/OPERATIONAL_REPORTS.md)).

## 10. Reglas de negocio
- **BR-SCH-001**: un proyecto tiene un único Schedule activo ([BR-SCH-001]).
- **BR-SCH-002**: avance cronograma ≠ avance certificado; reportes los muestran lado a lado ([BR-SCH-002]).
- **BR-SCH-003**: ítem `BLOCKED` con causa obligatoria ([BR-SCH-003]).
- **BR-SCH-004**: sync de avance real al aprobar libro **solo en `TASK`** ([BR-SCH-004], [D-045], [D-103]).
- **BR-SCH-005**: al confirmar recepción, completar hitos vinculados a la EDT recibida ([BR-SCH-005], [D-104]).
- Altura visual = árbol de `ScheduleItem`, no el vínculo EDT ([D-103]).
- Workspace: fecha prometida de OC y última recepción por EDT; chip de riesgo si la prometida es posterior al inicio de una tarea hermana ([D-104]).

## 11. Validaciones
- Fechas de tarea coherentes con dependencias (sin ciclos).
- `progress_pct` entre 0 y 100.

## 12. Fórmulas relacionadas
- Desvío temporal y SPI simplificado (futuro): [`../04-formulas/PROGRESS_FORMULAS.md`](../04-formulas/PROGRESS_FORMULAS.md).

## 13. Casos borde
- Obra con replanteo que mueve todas las fechas: versión de cronograma (Fase 2) o overwrite con auditoría.

## 14. Reportes relacionados
- Avance de obra (plan vs real), dashboard ejecutivo.

## 15. Relación con otros módulos
- **Proyectos**, **WBS**, **Certificaciones**, **Libro de obra**.

## 16. Permisos
PM edita su obra; FOREMAN puede actualizar avance de tareas si se habilita.

## 17. Eventos disparados / consumidos
- `schedule.updated`; `schedule_item.started`, `schedule_item.completed`, `schedule_item.blocked`, `schedule_item.unblocked`, `schedule_item.cancelled` ([`EVENTS_AND_AUTOMATIONS.md`](../01-domain/EVENTS_AND_AUTOMATIONS.md) §2.14d).

## 18. Fase de implementación
**Fase 1** núcleo; funciones avanzadas (crítico path, calendario laboral) **Fase 2**.

## 19. Preguntas abiertas
- _No aplica_ — Q-003 y Q-004 cerradas en [D-038](../00-product/DECISION_LOG.md) y [D-039](../00-product/DECISION_LOG.md).
