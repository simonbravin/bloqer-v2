# Procedimiento ? Avance físico, cronograma y certificaciones

> Ver decisión [D-045](../00-product/DECISION_LOG.md#d-045--avance-real-del-cronograma-sincronizado-desde-libro-de-obra), [D-103](../00-product/DECISION_LOG.md#d-103--cronograma-árbol-de-filas-hitos-visuales-y-sync-solo-en-tareas) y [D-104](../00-product/DECISION_LOG.md#d-104--hito-de-cronograma-completado-por-recepción-de-oc--fechas-de-compra-en-workspace). Reglas [BR-SCH-004](../01-domain/BUSINESS_RULES.md#br-sch-004--sincronización-de-avance-real-desde-libro-de-obra) y [BR-SCH-005](../01-domain/BUSINESS_RULES.md#br-sch-005--hito-completado-por-recepción-de-compra).

## 1. Dimensiones de avance (no confundir)

| Dimensión | Campo / fuente | Quién la mueve | Uso en UI cronograma |
|-----------|----------------|----------------|----------------------|
| **Real** | `ScheduleItem.progressPct` | Automático al aprobar libro en **TASK** ([BR-SCH-004], [D-103]); hitos: manual (PM) o al confirmar recepción ([D-104]) | Chip **Real** |
| **Plan (tiempo)** | Fechas inicio/fin + hoy | PM (fechas del ítem) | Chip **Plan (t)** ? solo lectura calculada |
| **Cantidad** | Libro aprobado / presupuesto (`operationalProgressPct`) | Obra (cantidades en parte) | Chip **Cant.** ? lectura |
| **Certificado** | Certificaciones emitidas | Administración / certificaciones | Chip **Cert.** ? lectura ([BR-SCH-002]) |

## 2. Flujo operativo recomendado

1. El capataz/PM registra el **parte de obra** (`JobsiteLog`) con avances por WBS (`physicalPct` incremental o cantidades).
2. Envía el parte (`SUBMITTED`); validaciones de stock y tope 100 % incluyen partes enviados según política vigente.
3. El PM **aprueba** el parte.
4. El sistema ejecuta `syncScheduleProgressFromJobsiteLog` dentro de la misma transacción:
   - Busca vínculos WBS **primarios** al cronograma del proyecto en ítems **`type = TASK`** ([D-103]: los `MILESTONE` se omiten).
   - Actualiza `progressPct` y, si corresponde, completa la tarea (`IN_PROGRESS` ? `COMPLETED` al 100 %).
   - Registra auditoría por ítem y evento agregado `SCHEDULE_PROGRESS_SYNCED_FROM_JOBSITE_LOG`.
5. El cronograma (Gantt, tabla, calendario) refleja el **Real** en la siguiente carga; **Plan (t)**, **Cant.** y **Cert.** se comparan en el diálogo de tarea.

## 2bis. Hito por recepción de OC ([D-104])

1. Depósito/Compras confirma un `PurchaseReceipt` (`DRAFT` ? `CONFIRMED`).
2. El sistema completa cada `ScheduleItem` `MILESTONE` del mismo proyecto vinculado (cualquier link) a un `wbsNodeId` de las líneas recibidas, si está `PLANNED` o `IN_PROGRESS` ([BR-SCH-005]).
3. Cualquier cantidad confirmada alcanza; anular la recepción **no** reabre el hito.
4. En el workspace, con EDT: chips **Entrega OC** / **Recibido** y riesgo si la prometida es posterior al inicio de una tarea hermana con la misma EDT.

## 3. Enlaces WBS

- Cada `ScheduleItem` puede tener varios `ScheduleItemWbsLink`; solo el marcado **`isPrimary`** participa en la sincronización de **tareas**.
- Los hitos pueden vincular EDT para métricas de costo y para completar por recepción, pero **no** reciben % Real del libro ([D-103]).
- Si un WBS del parte no tiene ítem de cronograma primario `TASK`, no hay efecto en cronograma (el parte igualmente queda aprobado).
- La **altura** en el Gantt es `parent_id` + `sort_order`, independiente del vínculo EDT ([D-103]).

## 4. Dependencias Finish-to-Start (FS)

- Al mover fechas (formulario, Gantt o acción server), el sistema **guarda** las fechas y devuelve **advertencias** si se viola FS (inicio antes del fin de una predecesora, o sucesora que inicia antes del fin de la tarea).
- Las advertencias no bloquean el guardado en Fase 1; el PM debe corregir o aceptar el riesgo explícitamente.

## 5. Excepciones y datos legacy

- Acumulado físico > 100 % en un WBS: la sync **omite** ese WBS hasta normalizar datos (ver Q-005b en producto).
- Certificaciones **no** actualizan `progressPct` del cronograma (permanece [BR-SCH-002]).
- Ítems `MILESTONE` **no** reciben sync desde libro ([D-103]); sí pueden completarse por recepción ([D-104]).
- `PLANNED ? COMPLETED` solo para hitos ([D-104]).

## 6. Pantallas

- **Libro de obra:** listado tabla + calendario mensual por fecha del parte (`?view=table|calendar`).
- **Cronograma:** vistas `?view=gantt|calendar|kanban|table` (default **gantt**) con **Kibo UI**; detalle de tarea en `ScheduleItemDialog` (pesta?as Detalle / Dependencias / Historial / Integraciones) con las cuatro dimensiones de avance; deep link `?itemId=<uuid>` y `?dialogTab=deps`. Filtro `?type=TASK|MILESTONE`. Contenedores colapsables en Gantt (localStorage).

## 7. Smoke manual (dev)

Ejecutar una vez tras cambios en cronograma/libro:

- [ ] Aprobar un parte con WBS primario enlazado ? abrir cronograma (misma sesión) y verificar % **Real** sin F5.
- [ ] Aprobar un parte sobre WBS de tarea **cancelada** ? el % Real de esa tarea **no** cambia.
- [ ] Aprobar un parte con WBS primario en un **hito** ? el % Real del hito **no** cambia ([D-103]).
- [ ] Crear hito vinculando EDT de una hoja existente ? queda **hermano, debajo** (no hijo).
- [ ] Confirmar recepción de OC con la EDT del hito ? hito `COMPLETED`, diamante verde ([D-104]).
- [ ] OC con `expectedDeliveryDate` posterior al inicio de tarea hermana ? chip de riesgo.
- [ ] Tarea atrasada ? barra roja; colapsar capítulo ? hijos ocultos.
- [ ] Filtro Tipo = Hitos ? solo diamantes en las 4 vistas.
- [ ] Aplicar filtro de estado sin coincidencias ? banner ?Ninguna tarea coincide? + **Limpiar filtros**.
- [ ] Gantt: flechas FS visibles entre dos tareas enlazadas; scroll horizontal mantiene alineación (diario/mensual).
- [ ] Gantt: hito `MILESTONE` visible, color fijo, arrastrable; línea **Hoy** en espa?ol; toast al mover fechas.
- [ ] Gantt: barra con relleno Real + indicador Cert (ámbar) cuando hay % certificado.
