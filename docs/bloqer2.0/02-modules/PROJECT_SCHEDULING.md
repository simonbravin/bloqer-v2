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
- Vincular tarea a `CostItem` / `WbsNode`.
- Registrar avance % de tarea (manual o desde certificación).

## 9. Pantallas y vistas necesarias
- Vista Gantt (si Fase 1 incluye).
- Lista de hitos con fechas y alertas de desvío.
- Comparativa plan vs físico ([`../06-reports/OPERATIONAL_REPORTS.md`](../06-reports/OPERATIONAL_REPORTS.md)).

## 10. Reglas de negocio
- **BR-SCH-001**: un proyecto tiene un único Schedule activo ([BR-SCH-001]).
- **BR-SCH-002**: avance cronograma ≠ avance certificado; reportes los muestran lado a lado ([BR-SCH-002]).
- **BR-SCH-003**: ítem `BLOCKED` con causa obligatoria ([BR-SCH-003]).

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
- Gantt vs hitos vs híbrido ([Q-003]); vínculo WBS ([Q-004]).
