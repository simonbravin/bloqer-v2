# AG-11 — Operación de obra y Field

**Estado.** AG-11 cerrada localmente el 05/11/2026 con 20 grupos de hallazgos corregidos y verificados.

## 1. Encargo y base

- [AG-11](../PLATFORM_AUDIT_PLAN.md#ag-11--operación-de-obra-y-field) abarca Libro de obra, Field, incidencias, evidencia, cronograma, inventario y su lectura en Avances. Incluye corrección y verificación. La revisión integral de UX/UI se conserva como trabajo posterior pedido por el Owner.
- Base `9a2a32215dc3aed3690038fed0742c4c446a716c` en `codex/pruebas`. El árbol de AG-10 se fijó en el PR #8 antes de editar AG-11. El merge de AG-10 conserva ese mismo árbol. El diff de esta etapa se mide contra la base.
- Responsables. `ag11_jobsite` en ciclo, validaciones, alcance y avisos. `ag11_field` en interfaz, Field, rutas e invalidación. `ag11_progress` en R-002, cronograma y exportaciones. `ag11_verify` en revisión independiente. Coordinación en adjuntos, pruebas SQL, Guía/Ayuda, publicación previa y verificación de conjunto.

## 2. Fuentes y recorridos

- **Registro del parte.** Field y Libro de obra → acciones → schema → `JobsiteLog` y líneas hijas → detalle, actividad y Pendientes. Se contrastaron [Libro de obra](../../02-modules/JOBSITE_LOG.md), [workflow](../../05-workflows/REGISTER_JOBSITE_ENTRY.md), [máquina §17](../../01-domain/STATE_MACHINES.md#17-jobsitelogentry-parte-diario), BR-JL-001/002, D-091 y D-101.
- **Aprobación y efectos.** Servicio de partes → mutación bajo bloqueo de obra → stock y sincronización de Real → cronograma, EDT, costos, R-002 y auditoría. Se contrastaron BR-JL-003, D-045, D-055, D-103, D-130 y el [procedimiento de avance](../../05-workflows/PROGRESS_AND_SCHEDULE_PROCEDURE.md).
- **Evidencia y entrega.** Selector de fotos → adjunto con padre operativo → biblioteca, visor, PDF y notificaciones. El parte del día de D-100 pasa por configuración, runner y entrega. Se contrastaron [Documentos](../../02-modules/DOCUMENTS.md), D-100, D-111, D-113 y [Reportes programados](../SCHEDULED_REPORTS_ARCHITECTURE.md).
- **R-002.** Pantalla, servicios de lectura, repositorio, CSV/XLSX y PDF. Se contrastaron D-120, [fórmulas de avance](../../04-formulas/PROGRESS_FORMULAS.md) y fuentes de datos de AG-04/05/07.
- **Acceso.** [Alcance por empresa](../TENANT_COMPANY_SCOPING.md), D-111, gates y relación de hijos con su parte. Se incluyeron obras compartidas, empresas hermanas, roles de edición/supervisión/lectura y bloqueos por estado.

## 3. Hallazgos corregidos

### GA-AG-11-001 — Empresa propietaria del parte

**P1.** Listados y lecturas por ID de obras compartidas podían devolver partes de la empresa hermana. Altas y transiciones aplican ahora la empresa efectiva y la asignación de obra. El parte conserva una empresa obligatoria.

### GA-AG-11-002 — Anulación y selector EDT por URL directa

**P1.** La anulación de borrador y el selector de partidas aceptaban IDs de obras sin asignación. Aplican el mismo acceso que la ficha. Anular también comprueba el estado de la obra y la versión del parte.

### GA-AG-11-003 — Relaciones históricas en partes

**P1.** Una fila de un parte antiguo podía exponer nombres o vínculos de depósitos, partidas, productos o subcontratos ajenos. La lectura valida los anclajes y conserva el contenido compatible, la cantidad y la descripción cuando corresponde.

### GA-AG-11-004 — Fotos, biblioteca y avisos

**P1.** Listar o confirmar una subida por ID podía eludir el acceso de obra. Los adjuntos heredan el alcance de su parte en biblioteca, detalle, lectura, descarga, confirmación y avisos. Un adjunto histórico sin empresa propia se sigue leyendo desde el padre autorizado.

### GA-AG-11-005 — Auditoría, bloqueos y reintentos de transición

**P1.** El retorno y la anulación podían separar la escritura del registro de auditoría o operar sobre una versión que ya había cambiado. El ciclo revalida estado y versión bajo bloqueo y registra sus efectos de manera atómica. Los avisos se emiten después de confirmar.

### GA-AG-11-006 — Fecha, contenido y límites del parte

**P2.** Fechas de calendario inválidas, texto vacío y valores que excedían la capacidad persistida podían pasar una entrada directa. Los controles se aplican en alta, edición, filtros y transiciones según corresponda. La devolución exige observaciones reales. El formulario confirma la fecha con el mes escrito aunque el selector nativo use el orden del navegador.

### GA-AG-11-007 — Reenvío del mismo borrador

**P1.** Un reintento podía fallar por otra representación del mismo decimal o aceptar cambios en notas y relaciones. El comparador conserva la igualdad física del valor y verifica el contenido persistido, incluso la imputación derivada.

### GA-AG-11-008 — Tope de avance de una partida

**P1.** El tope reutilizaba un valor de pantalla redondeado y podía variar según la empresa que aprobara un parte de una EDT compartida. Se valida el acumulado de obra y partida con decimales persistidos. El Real del cronograma conserva su precisión de dos decimales y los históricos conservan sus valores.

### GA-AG-11-009 — Materiales vinculados y consumo

**P1.** Se podían usar referencias de otro depósito o aprobar con Inventario deshabilitado. Se verifica empresa, obra, producto, depósito, cantidad, unidad y gate antes del efecto. El descuento definitivo se verifica bajo bloqueo al aprobar. El formulario informa el saldo orientativo y la unidad maestra.

### GA-AG-11-010 — Avisos del ciclo de vida

**P1.** Un supervisor de una empresa hermana podía recibir el texto de un parte compartido por obra que no podía consultar. El fan-out conserva D-091 y aplica la pertenencia del parte, los permisos y las asignaciones vigentes.

### GA-AG-11-011 — Registrar desde Field

**P2.** Una obra recordada podía estar pausada, y el acceso al formulario dependía del gate de Proyectos aunque hubiera otra acción habilitada. Registrar comprueba obra activa y acceso. El atajo de Consumos abre el formulario correspondiente.

### GA-AG-11-012 — Inicio de Field y pendientes

**P2.** El cliente podía preferir una obra obsoleta o mostrar un acceso de Cronograma indisponible. Inicio usa la obra validada por servidor y muestra pendientes de facturación de OC junto con sus operaciones autorizadas.

### GA-AG-11-013 — Altas y edición del Libro

**P2.** Las rutas directas mostraban formularios a roles de lectura. Editar podía regresar al lugar equivocado o quedarse en el formulario después de guardar, y una carga parcial podía borrar filas. Los accesos, edición, cancelación y valores por fila conservan el contexto de la ficha. La acción invalida las lecturas y la interfaz navega una sola vez al destino.

### GA-AG-11-014 — Carga de evidencia y detalle adaptable

**P2.** Una selección mixta de fotos podía ocultar los rechazos y la cola podía variar durante el guardado. El selector anuncia rechazos y conserva archivos válidos. Las tarjetas del parte muestran notas, estado de incidencias y unidad como la lectura de escritorio.

### GA-AG-11-015 — Refresco de consumidores

**P2.** Enviar, devolver o aprobar podía dejar datos anteriores en Pendientes, Avances o inventario. Se invalidan las superficies afectadas y la UI de la ficha refleja las acciones habilitadas en la obra.

### GA-AG-11-016 — Integridad de presupuesto y cobertura

**P1.** Un costo enlazado a una EDT de otro presupuesto podía contaminar la ponderación R-002. El reporte detecta la relación incoherente. Una fuente deshabilitada se distingue de una fuente consultada que aún no tiene mediciones.

### GA-AG-11-017 — Plan, Real y exportaciones

**P2.** Una fila que había sido contenedora podía contar como tarea retrasada si se ocultaban sus hijos anulados antes de clasificarla. Cronograma y R-002 consideran la estructura completa. CSV/XLSX/PDF conservan el Real y el conteo de tareas dentro del mismo alcance autorizado.

### GA-AG-11-018 — Origen de pendientes y ventas directas

**P2.** Un pendiente físico podía enlazar un Cronograma deshabilitado y las ventas directas excluidas carecían de acceso a facturación. El pendiente dirige a una fuente disponible. El informe explica la base de **Por ejecutar según %** y enlaza **Ver facturas de la obra** si corresponde.

### GA-AG-11-019 — Configuración y disparo de reportes diarios

**P1.** El selector, acceso por ID, historial y ejecución manual de configuraciones podían ignorar empresa u obras seleccionadas en D-100. Se aplica el alcance en lectura, edición, ejecución e historial. La configuración corporativa visible exige alcance corporativo para cambiar el cron. Al entregar se comprueba la membresía activa. En el parte diario, cada PDF respeta la empresa, la obra y los permisos del destinatario. Si la configuración cambia entre su lectura y el bloqueo, se descarta esa lectura antes de generar adjuntos.

### GA-AG-11-020 — Estado terminal en el workflow

**P2.** El workflow prometía una anulación posterior a la aprobación que contradice la máquina §17. La documentación, la Guía y la Ayuda describen el ciclo vigente, la anulación del borrador y el cierre al aprobar.

## 4. Verificación

- **Pruebas generales.** 2.706 casos aprobados en nueve tareas. El runner omite 41 suites live con guard opt-in. Esas omisiones se separan de la evidencia SQL de esta fase.
- **SQL aislado.** 49 casos distintos aprobados. Diez del circuito propio de partes, adjuntos, avance R-002 y stock, siete de selectores de inventario y 32 del conjunto de Cronograma y D-100. Las repeticiones de los casos de precisión, historial, gate, concurrencia y efectos no suman casos nuevos. Cada suite comprueba el host y la base efectiva antes de escribir. Los datos de la muestra visual son sintéticos y permanecen únicamente en la base aislada.
- **Pruebas de regresión directas.** El envío simulado incluye siete casos de runner, entrega, reintento, destinatario y cambio de configuración. La revisión independiente repitió 163 casos focales sin base ni proveedores. Ambos subconjuntos se solapan con la ejecución general y sus cifras no se suman.
- **Ajustes de verificación.** La primera ejecución SQL reprodujo un timeout en auditoría de devolución. Se corrigió el presupuesto de tiempo de la transacción, se ajustaron datos y limpieza de la suite y se repitió. El primer stock concurrente requería completar la partida de la fixture. La comprobación final con imputación explícita confirmó un solo movimiento, una aprobación y un parte aún enviado. En una primera compilación visual se detectó el retorno de edición que quedaba en el formulario. Se reconstruyó la aplicación con la corrección.
- **Documentación.** Guía operativa, ayuda en pantalla, contratos del módulo e índice de Bloqer AI actualizados. El índice se comprobó con 587 fragmentos y sin llamar al proveedor de IA.
- **Compilación y calidad.** Tipos en 13 tareas, lint completo y compilación final aprobados. El build local deja la base y los proveedores deshabilitados. Sus 70 fuentes de código y pruebas modificadas coinciden con los hashes del lote final.
- **Muestra en navegador.** En escritorio 1440×1000 se creó el borrador en la primera compilación. En la final se editó y se comprobó el retorno al mismo parte con material e imputación EDT preservados. Tablet 768×1024 con 25 % físico del Libro, cobertura 100 % y 25 % de Real del Cronograma. Teléfono 390×844 con selector que omite la obra pausada, nuevo parte en la obra elegida, fecha con mes escrito y parte aprobado con evidencia de metadatos. Con rol de solo lectura, la URL directa de edición vuelve al detalle y no muestra **Editar**. Los tamaños medidos no presentaron desborde horizontal de página en esta muestra.
- **Evidencia.** `output/platform-audit/ag-11-2026-11-05/` conserva `workspace-test-summary.json`, `sql-distinct-summary.json`, `build-source-match-final.json`, `final-source-manifest.json`, `visual-checks.json` y siete capturas de la compilación final. Las sesiones sintéticas se cerraron y se restableció el tamaño del navegador. Se detuvo el servidor de prueba.

## 5. Entrega y límites

- Se conserva el diseño de estados, permisos y campos persistidos. La fase no requiere migración.
- Los [alcances por destinatario](../PENDING_ARCHITECTURE_ITEMS.md#p-ag12-01--alcance-de-los-archivos-que-recibe-cada-destinatario) de las entregas de reportes se revisarán en AG-12. La fase actual cubre membresía activa y el alcance de la configuración.
- R2 real, entrega externa de emails y UX/UI integral quedan fuera de la muestra aislada. La comprobación de evidencia distingue metadatos, acceso y validación local de un upload real.
- Los cambios de AG-11 quedan en el espacio de trabajo. La campaña continúa por indicación del Owner.
