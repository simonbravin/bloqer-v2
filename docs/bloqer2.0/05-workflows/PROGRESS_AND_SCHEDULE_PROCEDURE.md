# Procedimiento — Avance físico, cronograma y certificaciones

> Ver decisión [D-045](../00-product/DECISION_LOG.md#d-045--avance-real-del-cronograma-sincronizado-desde-libro-de-obra). Regla [BR-SCH-004](../01-domain/BUSINESS_RULES.md#br-sch-004--sincronización-de-avance-real-desde-libro-de-obra).

## 1. Dimensiones de avance (no confundir)

| Dimensión | Campo / fuente | Quién la mueve | Uso en UI cronograma |
|-----------|----------------|----------------|----------------------|
| **Real** | `ScheduleItem.progressPct` | Automático al aprobar libro ([BR-SCH-004]); manual excepcional (PM) | Chip **Real** |
| **Plan (tiempo)** | Fechas inicio/fin + hoy | PM (fechas del ítem) | Chip **Plan (t)** — solo lectura calculada |
| **Cantidad** | Libro aprobado / presupuesto (`operationalProgressPct`) | Obra (cantidades en parte) | Chip **Cant.** — lectura |
| **Certificado** | Certificaciones emitidas | Administración / certificaciones | Chip **Cert.** — lectura ([BR-SCH-002]) |

## 2. Flujo operativo recomendado

1. El capataz/PM registra el **parte de obra** (`JobsiteLog`) con avances por WBS (`physicalPct` incremental o cantidades).
2. Envía el parte (`SUBMITTED`); validaciones de stock y tope 100 % incluyen partes enviados según política vigente.
3. El PM **aprueba** el parte.
4. El sistema ejecuta `syncScheduleProgressFromJobsiteLog` dentro de la misma transacción:
   - Busca vínculos WBS **primarios** al cronograma del proyecto.
   - Actualiza `progressPct` y, si corresponde, completa la tarea (`IN_PROGRESS` → `COMPLETED` al 100 %).
   - Registra auditoría por ítem y evento agregado `SCHEDULE_PROGRESS_SYNCED_FROM_JOBSITE_LOG`.
5. El cronograma (Gantt, tabla, calendario) refleja el **Real** en la siguiente carga; **Plan (t)**, **Cant.** y **Cert.** se comparan en el diálogo de tarea.

## 3. Enlaces WBS

- Cada `ScheduleItem` puede tener varios `ScheduleItemWbsLink`; solo el marcado **`isPrimary`** participa en la sincronización.
- Si un WBS del parte no tiene ítem de cronograma primario, no hay efecto en cronograma (el parte igualmente queda aprobado).

## 4. Dependencias Finish-to-Start (FS)

- Al mover fechas (formulario, Gantt o acción server), el sistema **guarda** las fechas y devuelve **advertencias** si se viola FS (inicio antes del fin de una predecesora, o sucesora que inicia antes del fin de la tarea).
- Las advertencias no bloquean el guardado en Fase 1; el PM debe corregir o aceptar el riesgo explícitamente.

## 5. Excepciones y datos legacy

- Acumulado físico > 100 % en un WBS: la sync **omite** ese WBS hasta normalizar datos (ver Q-005b en producto).
- Certificaciones **no** actualizan `progressPct` del cronograma (permanece [BR-SCH-002]).

## 6. Pantallas

- **Libro de obra:** listado tabla + calendario mensual por fecha del parte (`?view=table|calendar`).
- **Cronograma:** vistas `?view=gantt|calendar|kanban|table` (default **gantt**) con **Kibo UI**; detalle de tarea en `ScheduleItemDialog` (pestañas Detalle / Dependencias / Historial / Integraciones) con las cuatro dimensiones de avance; deep link `?itemId=<uuid>` y `?dialogTab=deps`.

## 7. Smoke manual (dev)

Ejecutar una vez tras cambios en cronograma/libro:

- [ ] Aprobar un parte con WBS primario enlazado → abrir cronograma (misma sesión) y verificar % **Real** sin F5.
- [ ] Aprobar un parte sobre WBS de tarea **cancelada** → el % Real de esa tarea **no** cambia.
- [ ] Aplicar filtro de estado sin coincidencias → banner “Ninguna tarea coincide…” + **Limpiar filtros**.
- [ ] Gantt: flechas FS visibles entre dos tareas enlazadas; scroll horizontal mantiene alineación (diario/mensual).
- [ ] Gantt: hito `MILESTONE` visible y arrastrable; línea **Hoy** en español; toast al mover fechas.
- [ ] Gantt: barra con relleno Real + indicador Cert (ámbar) cuando hay % certificado.
- [ ] Crear tarea manual → vincular EDT (o al crear) → chip **Sin EDT** desaparece; métricas de costo aparecen.
- [ ] Desvincular EDT primaria con otra secundaria → la secundaria pasa a primaria automáticamente.
- [ ] Cancelar tarea → desaparece de las 4 vistas; filtro **Cancelado** la muestra.
- [ ] Kanban: soltar en Planificado o Cancelado muestra mensaje claro; transición inválida toast del servicio.
- [ ] Libro: chip **En cronograma** abre cronograma con `?itemId=` cuando hay vínculo primario.
- [ ] Cronograma → diálogo → **Ver partes en libro** / **EDT y costos** con `?wbsNodeId=` / control-costos.
- [ ] Calendario Kibo y libro: labels/combobox en español.
- [ ] Confirmar OC imputada a la misma partida → **Comprometido** visible en detalle/tabla (moneda del presupuesto).
- [ ] Con presupuesto de control ≠ base del cronograma: métricas siguen la base (no $0 inventados) + banner mismatch.