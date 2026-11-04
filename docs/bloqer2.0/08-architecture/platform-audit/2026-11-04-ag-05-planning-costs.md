# AG-05 — Planificación, recursos, materiales y costos

> **Antecedente histórico parcial.** Las decisiones de este corte fueron aprobadas e implementadas después; el estado vigente está en el [informe de cierre](./2026-11-04-ag-05-closure.md). Se conservan abajo los resultados y pendientes tal como se registraron en ese momento. Corrección de discovery: el runner PDF ya seleccionaba `.tsx`; los tres smoke de cronograma están incluidos en los 2.182 casos generales, aunque también se ejecutaran focalmente. No se suman como casos distintos adicionales.

**Estado: correcciones independientes verificadas; etapa abierta por Q-069, Q-070 y Q-071.** No se autoriza avanzar a AG-06. El registro distingue las correcciones locales de la [publicación previa de AG-00–04](./2026-11-04-ag-00-ag-04-publication.md).

## 1. Encargo y base

El Owner pidió publicar los cambios pendientes y después auditar, corregir y verificar AG-05 antes de continuar. La primera parte terminó con [PR #3](https://github.com/simonbravin/bloqer-v2/pull/3), Production `3407c023eb00dec9d6361e4842af016480b1c813`. AG-05 comenzó sobre ese commit y árbol limpio, rama `codex/pruebas`, a las 03:59:47 UTC del 04/11/2026. Sus cambios posteriores permanecen locales: no están en aquel despliegue.

Base y atribución: `output/platform-audit/ag-05-2026-11-04/initial-snapshot.json` conserva hashes de 2.528 archivos iniciales. El manifiesto final y el [registro estructurado](./2026-11-04-ag-05-planning-costs.json) identifican las fuentes resultantes. El diff se obtiene contra ese HEAD publicado, incluyendo archivos nuevos. Los logs y capturas de pruebas usan únicamente datos sintéticos.

Participantes: coordinador; `ag05_schedule` (servicios/validators de cronograma y escritores directos D-045/D-104); `ag05_resources_materials` (tableros y relaciones financieras); `ag05_frontend` (UI/actions/export routes y revisión independiente del backend temporal); `release_verification` (revisión independiente de costos y revalidación). Se asignó un escritor por archivo. La revisión de publicación inicial tuvo evidencia separada.

## 2. Fuentes, inventario y alcance

Fuentes aplicadas: [AGENTS raíz](../../../../AGENTS.md), [guardrails](../AGENT_GUARDRAILS.md), [plan](../PLATFORM_AUDIT_PLAN.md), [procedimiento](../PLATFORM_AUDIT_RUNBOOK.md), [PROJECT_SCHEDULING](../../02-modules/PROJECT_SCHEDULING.md), [RFIS](../../02-modules/RFIS.md), [CHANGE_ORDERS](../../02-modules/CHANGE_ORDERS.md), [máquinas de estado](../../01-domain/STATE_MACHINES.md), [modelo monetario](../../03-finance/MONEY_MODEL.md), [fórmulas de costo](../../04-formulas/COST_FORMULAS.md), [scoping](../TENANT_COMPANY_SCOPING.md) y decisiones D-008, D-039, D-044, D-045, D-053, D-066, D-083, D-095, D-104, D-108, D-109, D-111 y D-115 del [Decision Log](../../00-product/DECISION_LOG.md).

- **Cronograma:** `/proyectos/[id]/cronograma`, cuatro vistas de escritorio, Field, tareas independientes/vinculadas, padres/orden, dependencias, estados, avance, contexto/historial, importación y exportaciones. Cadena real: `features/schedule` → actions → validators/services → Project/ProjectSchedule/ScheduleItem/links/dependencies/AuditLog. Las consultas usan Prisma en services; no se inventó una capa de repositorios ausente ni se llevó Prisma a web.
- **Materiales y recursos:** `/materiales`, `/mano-obra`, `/equipos`; operativo, varianza, look-ahead, filtros y atajos. APU/CostItem/WBS → SC/OC/recepción/stock o factura → DTO → tabla/Field/detalle. La cobertura operativa se distingue del compromiso financiero. Positivos y negativos ejecutados en SQL; la fixture visual tiene material positivo y recursos vacíos.
- **EDT y costos:** `/control-costos` y detalle, fuentes permitidas, moneda declarada, capas netas, exposición por compromiso, unidades, período, selección presupuestaria, CSV y consumidores de cronograma/AI. La comparabilidad multimoneda y la falta de valuación siguen pendientes; declarar moneda no resuelve esos dos hallazgos.
- **Escritores conectados:** actualización/envío/aprobación de parte de obra y confirmación de recepción, exclusivamente por su efecto D-045/D-104. AP, compras, stock y subcontratos se revisaron como fuentes/relaciones; sus etapas completas siguen pendientes.
- **Brecha de implementación:** no hay entidades operativas Rfi/Contract/Addendum legal/ChangeOrder formal. Q-057 difiere contratos y cambios formales; Q-006 aún no define RFIs. Se aclaró el inventario documental, sin diseñar entidades ni aprobar el límite propuesto de Q-069 por inferencia.

Schema/ERD, FKs y optionalidad se inspeccionaron para las relaciones anteriores; no se agregaron campos, modelos, estados, eventos, dependencias ni migraciones. Se preservó el catálogo cerrado de aislamiento y la semántica de empresa compartida. No se auditó toda la contabilidad, compras, inventario o captura de campo por inspeccionar sus consumidores.

Auth/roles/gates: SQL incluye OWNER, PROJECT_MANAGER, VIEWER y FOREMAN según cada recorrido, módulos activados/desactivados, tenant/empresa ajenos, obra compartida y ACL por asignación. La muestra UI principal corresponde a OWNER sintético y se agregó una comprobación acotada VIEWER en build local; no se atribuye esa muestra a todos los roles. Se mantienen permisos existentes, sin simplificar roles.

No se ejecutaron proveedores AI, email/R2 reales, OAuth, crons externos ni notificaciones remotas. El tool AI de materiales se verificó en su contrato de respuesta, conservando advertencias. Guía, ayuda e índice documental se actualizaron juntos.

## 3. Recorridos y evidencia

### T-01 — Planificación y persistencia

Los once escritores manuales validan entrada, acceso y pertenencia; serializan por Project, releen el estado vigente y guardan efecto/auditoría en la misma transacción. Dependencias concurrentes opuestas no crean ciclo; las repetidas conservan idempotencia. Reordenamiento valida el conjunto completo de hermanos y usa una operación SQL por lote. Padres, WBS y dependencias ajenos se rechazan antes de producir efectos.

`schedule-audit.live.test.ts` comprueba estado/lifecycle, ACL/gates, rollback, concurrencia, 503 hermanos, presupuesto opcional y exportación XLSX real. `schedule-budget-import.live.test.ts` revalida los nueve casos de AG-04. Los mensajes de action y el mutex cliente evitan doble envío, recuperan fallas de red y conservan campos; requests de contexto/historial descartan respuestas de una tarea anterior.

### T-02 — Parte/recepción → cronograma

D-045 usa orden de locks Project → parte, relee estado/versión y valida hijos antes de aprobar; un cero físico aprobado reinicia el avance anterior. Una edición previa no pisa una aprobación concurrente. La acumulación de una WBS compartida permanece global por obra/WBS: aprobar 25 y 30 desde empresas A/B en ambos órdenes produce Real 55, no el resultado del último contexto empresarial.

D-104 usa Project → recepción/OC/líneas, valida el documento confirmado y la línea realmente recibida antes del hito. Se conservó D-108, con autodraft AP posterior al commit. Las automatizaciones no requieren permiso manual EDIT SCHEDULE al actor que aprueba la fuente. Casos SQL reales cubren ambos escritores, pertenencia, carrera y rollback.

### T-03 — APU y cobertura

Los tableros consultan solo presupuesto y fuentes accesibles. Necesidad usa Decimal hasta la serialización; no redondea mediante Number intermedio. La unidad integra la identidad de la fila. Las líneas adjudicadas a OC sustituyen su SC de origen; las libres siguen presentes. Una OC borrador puede aportar cobertura operativa sin transformarse en compromiso financiero confirmado. Fechas `@db.Date` se conservan como día calendario y una tarea sin fechas no recibe fechas ficticias.

`planning-boards-audit.live.test.ts` ejecutó 11 casos distintos. La varianza monetaria aplica NC negativa/ND positiva conforme D-115. Las **cantidades** de esas notas quedan expresamente pendientes de Q-070; no se extrapoló el signo monetario.

### T-04 — Costos y detalle

Services valida Project/ACL y el presupuesto por su propia empresa; después verifica el grafo Budget ↔ CostItem ↔ WBS/APU y relaciones de documentos antes de sumar. La exposición aplica `max(0, compromiso − devengado vinculado)` por compromiso y después agrega. Un exceso de una OC no reduce otra. Se mantiene el fallback D-066 documentado para facturas legacy; una nota ambigua no se reparte por intuición.

Facturas/notas usan neto sin IVA/IIBB; las líneas de otro presupuesto no aparecen como sin imputar. Cantidades de unidad incompatible son `null`/`—`, sin conversión; el CSV deja la celda vacía. El detalle pasa el mismo período a documentos y resumen, lo identifica y omite saldos globales que ese recorte no demuestra. Moneda real se transmite en DTO/UI/CSV; esto no autoriza sumar monedas diferentes (Q-069).

Quince casos SQL de `cost-control-audit.live.test.ts` y 16 de `cost-control-relations.live.test.ts` comprueban scopes, integridad en ambos sentidos, capas, período, signos/importes, exportaciones y mensajes sin datos ajenos. El guard de grafo se comparte con Varianza de materiales para no dejar el inverso sin revisar.

## 4. Hallazgos y cambios aplicados

IDs estables de esta corrida, prioridad por impacto y estado. La base es el HEAD publicado indicado; salvo donde se especifica, no se atribuye una fecha histórica de introducción a partir de esta auditoría. Cada grupo conserva una causa y sus consumidores, sin contar cada pantalla como defecto separado.

1. **GA-AG-05-001 · P1 · Resuelto localmente:** entradas de cronograma/contexto/historial omitían permisos, gates o pertenencia. Guards reales en `schedule-helpers`, `schedule.service` y consumidores; SQL de acceso directo y negativos.
2. **GA-AG-05-002 · P1 · Resuelto localmente:** mutaciones leían antes de la serialización y podían guardar estado/auditoría incoherentes. Lock Project, relectura y auditoría atómica; rollback y carreras SQL.
3. **GA-AG-05-003 · P1 · Resuelto localmente:** árbol, dependencias y orden admitían referencias inconsistentes o carrera de ciclo. Validación del conjunto, extremos y jerarquía dentro del lock; batch SQL, ciclos opuestos e idempotencia comprobados.
4. **GA-AG-05-004 · P2 · Resuelto localmente:** fechas/datos inválidos y serialización de días alteraban recorridos. Validator de calendario real, rangos/progreso/motivos y fecha SQL sin desplazamiento por zona. No se inventó un bug horario en stock `@db.Date`.
5. **GA-AG-05-005 · P1 · Resuelto localmente:** una base económica ausente, inaccesible o fallada impedía planificar, contrario a D-039. Workspace temporal independiente, sin metadatos ajenos/sustituidos; advertencia económica opcional, fechas y exportaciones disponibles.
6. **GA-AG-05-006 · P1 · Resuelto localmente:** D-045 podía usar parte previo y omitir un cero físico explícito. Escritores coordinados/relectura y sincronización de cero; acumulación compartida estable entre empresas verificada.
7. **GA-AG-05-007 · P1 · Resuelto localmente:** D-104 podía confirmar con fuentes/líneas obsoletas o incompatibles. Lock/relectura/validación/auditoría antes de efectos; no se cambió la semántica de AP postcommit.
8. **GA-AG-05-008 · P2 · Resuelto localmente:** exportaciones presuponían base económica y podían construir ejes de duración no acotada. Nullable real en DTO/PDF/XLSX y máximo técnico de 120 meses calendario inclusivos para Gantt; tabla sola mantiene rango sin ese eje.
9. **GA-AG-05-009 · P1 · Resuelto localmente:** tableros y commitments podían consultar fuentes/presupuestos fuera de empresa/ACL o capacidad específica. `ServiceContext` completo, filtros por entidad y permisos de cada fuente; consumidores OC y CC adaptados.
10. **GA-AG-05-010 · P2 · Resuelto localmente:** adjudicación parcial eliminaba toda la SC o duplicaba cobertura. Sustitución por línea adjudicada, conservando libres y distinguiendo cobertura de compromiso financiero; SQL de adjudicación parcial.
11. **GA-AG-05-011 · P2 · Resuelto localmente:** redondeo intermedio/unidades mezcladas distorsionaban necesidad y cobertura. Decimal, agrupación por unidad y vinculación inequívoca; unidades incompatibles separadas, sin conversiones nuevas.
12. **GA-AG-05-012 · P1 · Resuelto localmente:** varianza monetaria de recursos sumaba NC como positiva. Signos D-115 y permisos/fechas coherentes; la cantidad de notas sigue en Q-070.
13. **GA-AG-05-013 · P1 · Resuelto localmente:** costos/detalle/selectores confundían empresa de obra compartida con empresa de presupuesto y podían omitir ACL. Guard independiente antes de lecturas; agrega control canónico a selector y acumulado mensual sin retirar capacidades legítimas.
14. **GA-AG-05-014 · P1 · Resuelto localmente:** relaciones secundarias podían introducir datos de otro presupuesto/documento. Guard Budget/CostItem/APU bidireccional y validación de cabecera/línea/parent/payable/recepción/subcontrato; CONFLICT genérico sin identificadores ajenos.
15. **GA-AG-05-015 · P1 · Resuelto localmente:** piso de compromiso agregado compensaba en exceso otras OC/tipos. Mapa por compromiso, imputación real y piso antes de agrupar; tests puros y SQL con sobreconsumo/tipificación diferente.
16. **GA-AG-05-016 · P1 · Resuelto localmente:** no imputado/mensual mezclaba bruto con neto y referencias de otro presupuesto. Neto D-095, signos D-115, company scope y selección de WBS correcta; SQL con impuestos y adenda.
17. **GA-AG-05-017 · P2 · Resuelto localmente:** cantidades de recurso se comparaban con unidad de partida distinta. DTO nullable/UI/CSV coherentes; importes sin conversión de unidades.
18. **GA-AG-05-018 · P2 · Resuelto localmente:** documentos filtrados y resumen de detalle podían describir períodos distintos. Mismo rango de fechas, `periodFiltered`, rótulos de período y ocultación de saldos globales; SQL y revisión independiente.
19. **GA-AG-05-019 · P2 · Resuelto localmente:** consultas financieras auxiliares se usaban como condición de entrada a tableros de cantidades. Selector accesible de presupuestos, sin probe económico redundante; D-039 preservado.
20. **GA-AG-05-020 · P1 · Resuelto localmente:** fuentes restringidas podían aparentar costo completo y tool AI omitía advertencias. Gate/permiso antes de leer cada fuente y warnings conservados en consumidores/AI; fuentes omitidas no se confunden con ausencia probada.
21. **GA-AG-05-021 · P2 · Resuelto localmente:** actions no vinculaban siempre entidad/obra ni normalizaban errores/refresh de todos los consumidores. Binding service, Zod/error funcional e invalidación coherente de cronograma/materiales/recursos/costos/avances.
22. **GA-AG-05-022 · P2 · Resuelto localmente:** doble envío, cierre pendiente y respuesta tardía podían perder contexto/datos de usuario. Mutex síncrono, recuperación de red, campos preservados y descarte de requests anteriores; evidencia focal y navegador de importación pendiente.
23. **GA-AG-05-023 · P2 · Resuelto localmente:** filtros Field y búsqueda diferida podían quedar desalineados al navegar/limpiar. Sincronización URL/estado y cancelación explícita del debounce; consumidores compartidos preservan API compatible.
24. **GA-AG-05-024 · P1 · Resuelto localmente:** helper puro importado desde frontera `use client` impedía su uso servidor. Extraído a adapter puro; regresión RSC y tipos/build verifican esa frontera.
25. **GA-AG-05-025 · P2 · Resuelto localmente:** KPI sumaban unidades heterogéneas, faltaban unidades/moneda explícitas y una barra corta cortaba el porcentaje. Conteos de filas, unidad por fila, ISO de presupuesto, null visible, controles accesibles y porcentaje solo con espacio, manteniendo tooltip. `CalendarBody` además omitía keys estables en sus features: Fragment por ID elimina la advertencia real de React; el contador adicional usa «más». Sin nuevas fórmulas. Las últimas correcciones de presentación se verificaron con captura/recarga, tipos, lint y build, sin inventar tests cosméticos.
26. **GA-AG-05-026 · P2 · Resuelto documentalmente:** resumen de MONEY_MODEL describía OC APPROVED como compromiso, contradiciendo D-044/estados reales. Se conservan estados CONFIRMED/PARTIALLY_RECEIVED/RECEIVED, piso por compromiso y fallback D-066 en fórmulas; `## Hallazgo` registra la contradicción resuelta.
27. **GA-AG-05-027 · P1 · Pendiente de Q-069:** importes originales de monedas distintas no son comparables por declarar una moneda. [Propuesta](./2026-11-04-ag-05-comparability-scope-proposal.md): base nativa del presupuesto y error funcional al detectar otra moneda; sin FX implícito ni omisión silenciosa. Guard financiero aún no aplicado.
28. **GA-AG-05-028 · P2 · Pendiente de Q-070:** cantidades de NC/ND se suman positivas en cobertura de recursos. D-115 solo resuelve dinero. [Propuesta](./2026-11-04-ag-05-resource-notes-proposal.md): cantidades netas por recurso/unidad, o alternativa INVOICE-only. No se adoptó una fórmula sin aprobación.
29. **GA-AG-05-029 · P1 · Pendiente de Q-071:** consumos sin costo/moneda trazables aparecen como cero, pudiendo afirmar ahorro no demostrado. [Propuesta](./2026-11-04-ag-05-stock-valuation-proposal.md): Sin valuación/— y varianza no calculable; sin FIFO, FX ni backfill. D-083 difiere la valuación completa; no se inventó costo de stock.
30. **GA-AG-05-030 · P2 · Brecha de alcance, decisión pendiente:** RFIs no implementadas; no se confunden con partes de obra/adendas económicas. Se propone diferir desarrollo formal con definición propia mediante Q-069; Q-006 y Q-057 mantienen su estado. No se presenta ausencia de módulo como bug de una implementación existente.

Los cambios visibles actualizan [Guía Operativa](../../GUIA_OPERATIVA_BLOQER_V2.md), artículos de ayuda `planning-procurement` y `control` y el índice de Bloqer AI. El CSS de porcentaje y refactors mecánicos internos no agregan reglas operativas; su impacto adicional documental/AI es nulo. Ninguna de las tres propuestas pendientes se incorporó como regla vigente.

## 5. Verificación automática

Evidencia local: `output/platform-audit/ag-05-2026-11-04/`; resumen deduplicado en `verification-summary.json`. Revisión: working tree posterior al HEAD indicado, con hashes de manifiesto; no se atribuye esta ejecución a Production.

- `pnpm run test --force --concurrency=2`, sin DB ni servicios externos: **2.182 casos aprobados, cero fallos, nueve tareas**. Hubo **24 suites live omitidas** por flags; el contador TAP `skipped: 0` de casos no las convierte en ejecutadas. Sus nombres están en el resumen. Casos focales adicionales se solapan con la suite general y no se suman como cobertura nueva.
- `pnpm run typecheck --force --concurrency=2`: **13/13 tareas** aprobadas. `pnpm run lint --force --concurrency=2`: packages y web aprobados, sin warnings.
- Se repitieron tipos y lint tras las últimas correcciones de presentación: aprobados. **Build de producción aprobado**, dos tareas, DB apuntada a un destino deshabilitado y `VERCEL` ausente para no migrar. No se ejercitaron proveedores externos. La suite general precede esas correcciones de unidades/etiquetas/keys; no se infla su contador repitiendo pruebas cosméticas.
- SQL: **81 casos distintos aprobados**, cero fallos en las selecciones finales: cronograma/importación 39 (30 nuevos AG-05 + nueve regresiones AG-04), tableros 11, relaciones de costos 16, costos/consumidores 15. Se deduplican las repeticiones entre corridas focales. Logs: `schedule-live-final`, `schedule-residual-live`, `schedule-closing-live`, `resources-sql-final`, `resources-relational-sql`, `cost-relations-sql`, `cost-relations-receipts-subcontracts-sql`, `cost-control-live-final` y `cost-control-residual-live`.
- Destino SQL comprobado antes de escribir: `bloqer_audit_ag01_20261103` en `ep-curly-math-aptjniho.c-7.us-east-1.aws.neon.tech`, 70 migraciones existentes. Fixtures por tenant y teardown mantenido, sin seeds ni cambios de `.env`; no se escribió en `neondb` ni producción.
- XLSX: buffers del exportador público generados y reabiertos en SQL real para planificación independiente y advertencia económica. PDF: **3/3 smoke reales** con Helvetica local, separado del runner general. No se verificó una descarga interactiva del navegador.
- El caso de fuente económica opcional induce CONFLICT/VALIDATION en ese punto; tareas, permisos, DB y generación de exportaciones siguen siendo reales. No prueba disponibilidad de la fuente inducida.
- Rendimiento observado en fixture aislada: mover 503 hermanos, 3.247 ms; importar 503 partidas, 9.448 ms. No constituyen benchmark ni SLO de producción. El límite de exportación se verifica antes de construir ejes/páginas.
- Índice documental regenerado: 529 chunks; se valida frescura con su comando mantenido. Fuentes propuestas/Open Questions no se indexan como decisiones vigentes.

Fallos intermedios conservados: la primera corrida SQL de cronograma encontró un dato de fixture de empresa incorrecto y un filtro inválido de teardown; ambos fueron corregidos y el residuo propio se retiró mediante cleanup mantenido con guard de identidad, con cero remanentes. Los tipos iniciales detectaron errores de integración de DTO nullable/fixture y fueron corregidos antes de la corrida conjunta. No se atribuyen a un fallo del producto sin reproducción. La revisión descartó la hipótesis de pérdida de un consumo por horario: `movementDate` es SQL DATE, no timestamp.

El dev server terminó por heap OOM tras aproximadamente una hora de recompilaciones, durante una navegación opcional del VIEWER; login/dashboard sí habían cargado. La pantalla de obra de esa corrida no se cuenta como aprobada. [P-AG05-01](../PENDING_ARCHITECTURE_ITEMS.md#p-ag05-01--memoria-del-servidor-de-desarrollo-durante-smoke-prolongado) conserva evidencia y condición de reproducción, sin afirmar una causa de producto ni extrapolar la falla a Production. La repetición en un build local fresco aprobó obra asignada, cronograma y detalle de consulta; no reproduce la carga de una hora de HMR ni cierra la observación de memoria a largo plazo.

No ejecutado: workflow operativo autenticado en Production, proveedores externos, E2E CI de AG-05, descarga real de navegador, valuación de inventario completa y nuevas reglas Q-069/070/071. El build y limpieza final conservan su resultado efectivo en el JSON de esta corrida.

## 6. Verificación visual y operativa

Instancia local autorizada en `http://localhost:3100`, base aislada anterior, cuenta OWNER sintética y obra «Auditoría AG03 · Obra sintética». No se usaron datos de obras reales. Backend y frontend corresponden al working tree; servicios externos deshabilitados. La autorización explícita de navegador local otorgada en AG-02 se conserva en esta campaña.

Se comprobó creación de una única tarea independiente, error de fechas sin pérdida de campos, avance manual 25% persistido, importación de una partida vinculada sin fechas conservando la tarea original, bloqueo de Escape durante importación pendiente, tabla/Kanban/Gantt y Field. Desktop 1440×1000 oscuro y claro; teléfono emulado 390×844 claro, sin desborde del documento. Calendario representa solo tareas con fechas; no se atribuye presencia de la tarea sin fechas a esa vista.

Field muestra tarea activa, detalle/cierre, búsqueda/limpieza y Todas incluye la tarea sin fechas. Materiales muestra necesidad/faltante 10 un, detalle y atajo Pedir con WBS/APU/unidad/cantidad correspondientes. Mano de obra y Equipos verifican estado vacío y conteos; sus positivos se cubren en SQL, no en esta fixture de navegador.

VIEWER, con build compilado local fresco y proveedores explícitamente deshabilitados: login → obra asignada «Obra AI Adv A1» → cronograma → detalle. A 1280×720 oscuro se ven fechas/avance como texto, sin crear/importar ni controles de guardado; Exportar conserva permiso de lectura. Captura [consulta en build local](./assets/ag05/schedule-viewer-compiled-dark.png). La sesión se cerró volviendo a `/login`; se restauraron tema oscuro y viewport por defecto, y la instancia temporal se detuvo comprobando proceso/puerto. Una pestaña temporal de error de dev quedó sin marca para el cierre automático del navegador, porque la política de URL impedía cerrarla manualmente. El log visual final diferencia los dos intentos.

Capturas curadas: [Gantt oscuro](./assets/ag05/gantt-desktop-dark.png), [detalle Field claro](./assets/ag05/schedule-field-light.png), [materiales Field](./assets/ag05/materials-field-light.png), [materiales escritorio](./assets/ag05/materials-desktop-light.png) y [detalle de costos con período](./assets/ag05/cost-detail-period-light.png). La [captura previa de barra corta](./assets/ag05/gantt-desktop-dark-before-label.png) permite contrastar el recorte resuelto. Teclado/labels/foco se comprobaron en los diálogos recorridos; no es una auditoría completa con lector de pantalla ni todos los viewports/dispositivos reales. Los dos ítems creados por UI permanecen en la obra sintética para reproducción; no son residuos de fixtures SQL ni datos productivos.

## 7. Revisión independiente

`ag05_frontend` revisó los cambios de services de cronograma y detectó dos residuales: baseline inaccesible sustituida por otra accesible y fallo económico opcional que bloqueaba el tiempo. Se corrigieron y revalidaron con SQL/exportación. Sus 48 casos offline se solapan con la suite general.

`release_verification` detectó el resumen de detalle fuera del período y la falta del guard inverso de materiales. El coordinador corrigió ambos, ejecutó cuatro SQL focales aprobados, y el revisor inspeccionó código/pruebas/logs y confirmó resolución. El revisor ejecutó además diez tests web offline aprobados; no se atribuyó la ejecución SQL del coordinador. Retiró la sospecha horaria por `@db.Date`. Q-069/070/071 quedan fuera del veredicto resuelto.

## 8. Pendientes y continuación

**No cerrar AG-05 ni pasar a AG-06 mientras sus decisiones y correcciones dependientes sigan pendientes.** Hay 26 grupos corregidos y verificados en el alcance indicado; quedan tres definiciones que afectan resultados y una brecha de alcance vinculada. Publicar AG-00–04 no publica AG-05.

Próximo paso: el Owner resuelve [Q-069/Q-070/Q-071](../../00-product/OPEN_QUESTIONS.md); después se implementan las alternativas aprobadas, se repiten sus regresiones y consumidores UI/CSV/AI, y se actualiza este estado con evidencia. La aplicación de RFIs se mantiene como brecha explícita hasta aprobar su límite. El registro conserva los contratos actuales, sin anticipar esa aprobación.

Motivo del pedido de decisión: [AGENTS.md §2](../../../../AGENTS.md) exige «Si una decisión es ambigua, parar y preguntar» y §5 exige preguntar antes de una nueva regla financiera. Esto limita esas decisiones; no impidió completar las correcciones independientes. La skill de auditoría conserva esa misma separación y no permite cerrar una etapa con hallazgos pendientes por inferencia.

Revalidar esta evidencia al modificar permisos/scopes, writers Project/parte/recepción, links WBS/APU/documentos, moneda/valuación/unidades, fórmulas de exposición, DTO/exportaciones, debounce compartido o planificación/ayuda. Consultar las [selecciones mantenidas](../TESTING_STRATEGY.md) para auditar solo el área que cambie.
