# Registro maestro de auditoría de plataforma

Este registro permite retomar la auditoría global de Bloqer o revisar un área después de un cambio. El alcance y las dependencias están en el [plan de auditoría](../PLATFORM_AUDIT_PLAN.md); la ejecución y los criterios de cierre, en el [procedimiento](../PLATFORM_AUDIT_RUNBOOK.md). Cada corrida debe usar la [plantilla de informe](./REPORT_TEMPLATE.md).

## Estado vigente al 05/11/2026

**AG-00 a AG-12 publicadas.** [Publicación AG-12](./2026-11-05-ag-12-publication.md), PR #10 y Production `8c18f331`. [AG-13 cerrada localmente](./2026-11-05-ag-13-cross-cutting.md). La revisión integral de UX/UI se mantiene como etapa posterior.

## Corte inicial: 03/11/2026

**Actualización de publicación, 04/11/2026:** AG-00 a AG-04 y los cambios previos pendientes se integraron en [PR #3](https://github.com/simonbravin/bloqer-v2/pull/3) y Vercel confirmó Production para `3407c023`. [Registro de publicación](./2026-11-04-ag-00-ag-04-publication.md): CI, build y 2.129 pruebas aprobadas; 70 migraciones productivas existentes verificadas solo en lectura, sin pendientes. Smoke público de acceso/recuperación aprobado; workflows autenticados del portal no ejecutados. Los cierres locales siguientes se conservan como evidencia de su momento.

Se realizó una preparación por lectura de documentación, estructura, recursos de auditoría y configuración de pruebas. Se dejó organizado el kit de trabajo reutilizable por etapas.

**Durante la preparación no se ejecutaron suites ni se auditó funcionalmente toda la plataforma.** Esa preparación es un antecedente; la primera corrida real se registra a continuación. La existencia de documentación o pruebas no acredita por sí sola que un módulo esté verificado en el despliegue actual.

## Corrida AG-00: 03/11/2026

**Estado de la corrida AG-00: corregida y verificada localmente.** [Informe de remediación](./2026-11-03-ag-00-remediation.md) y [evidencia de cierre](./2026-11-03-ag-00-remediation.json). Los seis hallazgos GA-AG-00-001 a 006 están resueltos en su alcance; tipos, lint completo y pruebas conjuntos aprobados. Runner: **1.579 casos aprobados, cero fallos**, con **226/226 archivos unitarios descubiertos** y siete suites live omitidas. La decisión documental de aislamiento fue aprobada explícitamente y formalizada en ADR-018. Esa corrida no publicó ni verificó DB efectiva; su continuación autorizada AG-01 se registra más abajo.

### Diagnóstico previo conservado

[Diagnóstico y baseline local](./2026-11-03-ag-00-baseline.md), con [mapa de los 31 módulos](./2026-11-03-ag-00-coverage.md), [arquitectura](./2026-11-03-ag-00-architecture.md) e [inventario de evidencia](./2026-11-03-ag-00-inventory.json).

- Base: `3b5ae7a038465ad6b3d60cde19c278a31019e165`, rama `codex/pruebas`, con trabajo local previo preservado.
- Comprobaciones aprobadas: 13 typechecks, lint web, Prisma validate offline e índice AI.
- Runner unitario: 1.578 casos reportados; 1.576 aprobados y 2 fallidos. Siete suites de integración omitidas y un caso de aislamiento que retorna sin aserción, aunque el contador del runner lo apruebe.
- Lint manual de packages: 48 incidencias en 34 archivos; CI no estaba invocando ese alcance.
- En ese diagnóstico, los seis hallazgos **GA-AG-00-001 a 006 quedaron abiertos** y no se modificaron código ni tests. La remediación posterior enlazada arriba conserva y resuelve esos IDs. Integración DB, E2E, visual y producción no ejecutados.
- El sublote de higiene y la reconciliación P-AG00-01/02 se completaron en AG-00; la ejecución siguiente AG-01 se registra a continuación.

## Corrida AG-01: 03/11/2026

**Estado vigente: AG-01 corregida y verificada en código local y PostgreSQL aislado.** [Informe y 21 grupos de hallazgos resueltos](./2026-11-03-ag-01-identity-access.md), con evidencia en `output/platform-audit/ag-01-2026-11-03/`. Se corrigieron identidad/tokens, contexto, ACL/empresa, último propietario, invitaciones, configuración/policies, administración SaaS, logos y controles visibles. Revisión cruzada por tres especialistas y coordinador.

- Tipos: **13 tareas** aprobadas. Lint completo packages/web sin warnings. Pruebas: **9 tareas, 1.725 casos aprobados**, 249/249 archivos descubiertos; 13 suites live omitidas en ese comando, informadas por separado.
- SQL aislado: **91 casos distintos aprobados** (67 principales + 1 de propietario/cuenta + 23 de regresión D-111/AI), cero fallos/omisiones en esas selecciones. Base nueva vacía de desarrollo con 70 migraciones existentes y datos sintéticos; identidad efectiva verificada antes de escribir.
- Guía, ayuda e índice AI actualizados (510 chunks). No se agregó schema, estados, dependencias ni migraciones de producto.
- Sin navegador/smoke, OAuth/email/R2 reales, build/deploy ni comprobación del portal. `.env` no se cambió. El ciclo funcional de archivado de User no implementado quedó distinguido del enum técnico; no se inventó un flujo para cerrarlo.
- Al cerrar AG-01 se esperó indicación del usuario. La continuación autorizada AG-02 se registra a continuación.

## Corrida AG-02: 03/11/2026

**Estado vigente: corregida y verificada en código local y navegador aislado.** [Informe de 21 grupos resueltos](./2026-11-03-ag-02-navigation-visual-system.md), [registro estructurado](./2026-11-03-ag-02-navigation-visual-system.json) y [referencia visual reutilizable](./AG02_VISUAL_REFERENCE.md).

- Navegación empresa/proyecto/Field/plataforma, gates, breadcrumbs, foco/teclado, preferencias y caché de obra; controles compartidos, confirmación/reintento, formularios, tablas, contraste y recuperación de pantallas.
- Tipos: **13 tareas aprobadas**. Lint completo sin errores/advertencias. Pruebas: **9 tareas, 1.754 casos aprobados**, cero fallos; **13 suites live omitidas**, sin contarlas como casos ejecutados. Guía, ayuda e índice AI vigentes (513 chunks).
- Smoke explícitamente autorizado en localhost, con la DB sintética aislada de AG-01 y externos deshabilitados. OWNER y VIEWER, teléfono/tablet/escritorio, ambos temas; mediciones de 26 pares de contraste con mínimo 4,625:1 en esos pares. La muestra no certifica todas las rutas ni WCAG completo. Límites y logs en el informe.
- Sin despliegue, migraciones, operación financiera real o cambio de producción. Árbol previo preservado; cambios atribuibles fijados por hashes.
- Al cerrar AG-02 se esperó indicación del usuario. La continuación autorizada AG-03 se registra a continuación.

## Corrida AG-03: 03/11/2026

**Estado vigente: corregida y verificada localmente, con SQL y navegador aislados.** [Informe de 20 grupos resueltos](./2026-11-03-ag-03-directory-projects.md) y [registro estructurado](./2026-11-03-ag-03-directory-projects.json).

- Directorio, perfiles, selectores, proyectos, fechas, equipo, transiciones, filtros rápidos, acceso e invalidación; coordinación de lifecycle con los escritores afectados de compras, presupuestos, certificación y finanzas.
- **1.972 pruebas generales**, 13 typechecks y lint completo aprobados. **45 casos SQL distintos** aprobados en cuatro suites; se registra el `40P01` reproducido y el timeout corregido, sin sumar repeticiones. El runner unitario omite 17 suites live; cuatro se ejecutan separadamente en este lote y las otras 13 no se repiten.
- Q-067 aprobada e implementada: creador con acceso exclusivamente a su obra nueva cuando requiere asignación, sin conceder roles ni otras obras. La [simplificación de roles](./2026-11-03-role-simplification-proposal.md) conserva el carácter de propuesta.
- Guía, ayuda, fuentes funcionales y knowledge actualizados (517 chunks). Smoke sintético de formularios, datos, listados y disposiciones de escritorio/móvil. Sin publicación, migración, nuevo schema/dependencias o servicios externos reales.
- La continuación autorizada AG-04 se registra a continuación.

## Corrida AG-04: 03–04/11/2026

**Estado vigente: corregida y verificada en código local, SQL y navegador aislados.** [Informe de 28 grupos resueltos](./2026-11-03-ag-04-budgets-wbs-apu.md) y [registro estructurado](./2026-11-03-ag-04-budgets-wbs-apu.json).

- Presupuestos, adendas operativas, EDT/APU, parámetros, precisión, importación/exportación, metadata, permisos y estado de obra; vínculo transaccional del presupuesto con el cronograma. Sin construir contratos legales diferidos por Q-057.
- **2.129 pruebas generales**, **13 typechecks** y lint completo aprobados; **34 casos SQL distintos** aprobados (17 Budget/policies, 8 WBS/APU/import/export y 9 de cronograma). El runner general omite 20 suites live; las tres AG-04 se ejecutan aparte y las otras 17 no se repiten por rutina.
- La cancelación actual desde Borrador/En revisión/Con observaciones fue aprobada expresamente: Q-068 resuelta en D-121. Roles actuales conservados. Guía, ayuda e índice AI actualizados: 521 chunks.
- Smoke OWNER con datos sintéticos, escritorio oscuro y APU móvil claro/oscuro; costos mostrados y guardados, revisión/devolución/reenvío/aprobación, adenda y teclado. La descarga del navegador quedó limitada por el transporte; CSV/XLSX reales se comprobaron alternativamente mediante su servicio y suite SQL mantenida.
- Sin publicación, migración, nuevos campos/dependencias o efectos externos reales. Límites, evidencia y atribución por hashes en el informe.
- Al terminar AG-04 se esperó indicación del usuario. La continuación autorizada AG-05 se registra a continuación.

## Corrida AG-05: 04/11/2026

**Estado vigente: AG-05 corregida y verificada localmente, en el alcance aprobado.** [Informe de cierre](./2026-11-04-ag-05-closure.md) y [registro estructurado](./2026-11-04-ag-05-closure.json); [corte parcial histórico](./2026-11-04-ag-05-planning-costs.md). Comenzó después de publicar AG-00–04, sobre `3407c023` y árbol limpio. A los 26 grupos iniciales de cronograma/Gantt/Field, materiales/recursos, costos, exportaciones y escritores D-045/D-104 se sumó la resolución de las tres propuestas aprobadas: D-122 comparabilidad monetaria y alcance, D-123 cantidades netas y D-124 consumo sin valuación. Se conserva la numeración 001–030; RFIs se difieren explícitamente, sin construir entidades ni resolver Q-006/Q-057.

- Pruebas generales finales: **2.197 aprobadas**, cero fallos/cancelados; **26 suites live omitidas**, sin contarlas como casos ejecutados. Tipos: **13/13** tareas; lint completo y compilación con DB deshabilitada aprobados. Los **13 PDF**, incluidos tres smoke de cronograma y dos de valuación `.tsx`, forman parte del contador general; se corrige la exclusión descrita en el corte histórico.
- SQL aislado de la continuación: **97 casos distintos aprobados** (55 nuevos, 42 anteriores repetidos), con guard efectivo antes de fixtures y limpieza final comprobada en lectura. La selección inicial canceló 30 por un nombre duplicado del fixture: se corrigió y repitió 30/30; no se cuentan los cancelados como aprobados. El historial anterior tiene 81 casos, incluidos nueve de AG-04; el conjunto deduplicado es 136, sin afirmar que los 136 se repitieron ahora. XLSX público real generado y reabierto.
- Guía, ayuda e índice AI actualizados: **533 chunks**. Muestra visual local autorizada de OWNER y PROJECT_VIEWER, escritorio claro/oscuro y móvil 390 px: cero comprobado frente a costo desconocido, advertencias y detalle. Consumo positivo, notas netas y conflicto de moneda tienen SQL real; no se les atribuye una navegación con esos datos. Límites y observación de memoria del entorno de desarrollo conservados en el cierre.
- **AG-05 — Publicada tras corrección y verificación.** [Cierre](./2026-11-04-ag-05-closure.md) y [publicación PR4](./2026-11-04-ag-05-ag-06-publication.md). D-122/123/124 implementadas; RFIs y contratos formales conservan sus diferimientos.

## Corrida AG-06: 04/11/2026

**Estado vigente: corregida y verificada localmente, en el alcance aprobado.** [Informe de cierre](./2026-11-04-ag-06-procurement.md) y [registro estructurado](./2026-11-04-ag-06-procurement.json). Base `3407c023`, con 149 rutas previas de AG-05 preservadas; atribución por hashes desde el inicio de AG-06.

- SC, cotizaciones, adjudicación por ítem, OC, aprobaciones, recepciones y fronteras con AP/stock, políticas, avisos, hub e invalidación. **35 grupos corregidos y verificados**. D-125: moneda comparable; D-126: historial de ofertas; D-127: correlativo propio de recepción; D-129: nueva aprobación si cambia el FX. D-128 deja el cierre parcial formal como desarrollo separado con diseño previo, registrado en P-AG06-01.
- **2.335 pruebas generales aprobadas**, cero fallos; 29 suites live omitidas por separado. **100 casos SQL distintos aprobados**: SC 24, OC/recepciones 43, plataforma/frontera AP 30 y regresión recepción/cronograma 3. Tipos: **13 tareas**; lint completo y compilación raíz completa aprobados. Los 13 PDF y los subconjuntos del revisor ya están incluidos, sin duplicar contadores. Fallos iniciales corregidos y límites registrados en el informe.
- Guía, ayuda e índice AI actualizados: **542 chunks** y siete pruebas de recuperación sobre el índice distribuido, sin LLM remoto. Revisión independiente cerrada. Muestra Owner sintética de escritorio/móvil y claro/oscuro: SC/cotización multimoneda, OC, aprobación y dos recepciones con códigos distintos; la build raíz final se comprobó confirmando RC-002 y leyendo las dos recepciones y etiquetas fiscales.
- Migración D-127 aplicada únicamente a la DB aislada de auditoría, con históricos sin renumerar. Dev normal y producción no migrados; sin publicación, proveedores reales ni cambios de dependencias o `.env`. La instancia local y sesión temporal se cerraron al terminar.
- **AG-05 y AG-06 permanecen locales. AG-07 no iniciada; esperar indicación del Owner.** Las etapas completas de Inventario/AP/reportes y servicios transversales conservan su alcance pendiente.

## Publicación AG-05/06: 04/11/2026

[Registro de publicación](./2026-11-04-ag-05-ag-06-publication.md): PR4, commit de entrega4a9af281, merge Production74bb2c9d. CI PR/main verdes (2.335pruebas,13tipos,lint); E2E omitido. VercelProduction exitoso y SQLproductivo solo lectura verificó71migraciones, D-127/columna/índice/checksum. Acceso/recuperación públicos200; sin workflows autenticados productivos. No se incluyó AG-07. La aprobación explícita del destino público quedó registrada tras la revisión automática inicial.

## Corrida AG-07: 04–05/11/2026

**Cerrada: corregida y verificada localmente.** [Informe](./2026-11-04-ag-07-inventory.md) y [JSON](./2026-11-04-ag-07-inventory.json). 38 grupos resueltos, incluidos dos defectos transitorios de auditoría reparados. Q-077 resuelta en D-130: unidad protegida y compatibilidad sin conversiones. Selector de partes con alcance y gates corregidos.

- 2.388 pruebas generales, cero fallos; 33 suites live omitidas. Tipos 13 tareas, lint y compilación raíz aprobados.
- 111 SQL distintos: inventario26, reportes9, compras/recepciones51, recepción/cronograma3, unidades/partes/APU15 y selector7; replays/carreras/rollback/históricos verificados.
- UI Owner aislada, escritorio/celular; unidad fija y edición de otros campos, aviso móvil legible. Guía/ayuda/549 chunks actualizados; revisión independiente sin hallazgos residuales.
- AG-07 local, sin publicar ni migrar. Logout/viewport/servidor comprobados; pestaña temporal con autocierre al terminar. D-083/D-124 y D-128 conservados. AG-08 espera indicación.

## Etapas y seguimiento

Los identificadores, las etapas y sus estados son convenciones de seguimiento documental. No agregan entidades, estados de negocio ni configuración persistida al producto.

- **AG-00 — Corregida y verificada localmente.** Inventario, baseline histórico y cierre de seis hallazgos en la remediación enlazada. Esa corrida no acreditó DB efectiva ni despliegue.
- **AG-01 — Corregida y verificada local/SQL aislado.** [Cierre](./2026-11-03-ag-01-identity-access.md): autenticación, contexto tenant/empresa/proyecto, membresías, roles, gates y administración SaaS; 21 grupos resueltos, 91 comprobaciones SQL aprobadas. Despliegue y verificación visual separados.
- **AG-02 — Corregida y verificada local/navegador aislado.** [Cierre](./2026-11-03-ag-02-navigation-visual-system.md): 21 grupos, 1.754 pruebas aprobadas y [criterios visuales de referencia](./AG02_VISUAL_REFERENCE.md). Publicación y cobertura completa de módulos separadas.
- **AG-03 — Corregida y verificada local/SQL/navegador aislado.** [Cierre](./2026-11-03-ag-03-directory-projects.md): 20 grupos resueltos, 1.972 pruebas generales y 45 casos SQL aprobados; contactos, perfiles, proyectos, equipo, fechas, acceso del creador aprobado (Q-067), filtros, disposición móvil y coordinación de lifecycle con consumidores. Simplificación general de roles propuesta por separado; publicación y auditoría completa de módulos vecinos no incluidas.
- **AG-04 — Corregida y verificada local/SQL/navegador aislado.** [Cierre](./2026-11-03-ag-04-budgets-wbs-apu.md): 28 grupos resueltos; presupuestos, EDT, APU, versiones, adendas operativas y vínculo con cronograma. Contratos/adendas legales requieren resolver Q-057, que sigue diferida.
- **AG-05 — Corregida y verificada local/SQL/navegador aislado.** [Cierre](./2026-11-04-ag-05-closure.md): propuestas aprobadas implementadas en D-122/123/124; 2.197 pruebas generales, 97 casos SQL de la continuación y compilación aprobados. RFIs y contratos formales diferidos por alcance explícito. AG-05 continúa sin publicar; la continuación autorizada AG-06 tiene su propio cierre.
- **AG-06 — Publicada tras corrección y verificación.** [Cierre](./2026-11-04-ag-06-procurement.md) y [publicación PR4](./2026-11-04-ag-05-ag-06-publication.md). D-125/126/127/129 implementadas; cierre parcial formal separado D-128. D-127 productiva comprobada.
- **AG-07 — Publicada.** [Cierre](./2026-11-04-ag-07-inventory.md), [publicación](./2026-11-05-ag-07-publication.md): PR #5, Production d897aa7f, CI y acceso público comprobados.
- **AG-08 — Corregida y verificada localmente, sin publicar.** [Cierre](./2026-11-05-ag-08-certifications-subcontracts.md), [JSON](./2026-11-05-ag-08-certifications-subcontracts.json): 30 grupos, D-131/D-132, 2.528 pruebas/90 SQL, tipos/lint/compilación/visual e independencia. AG-09 espera indicación.
- **AG-09 — Ventas y obligaciones. Corregida y verificada localmente.** [Cierre](./2026-11-05-ag-09-ar-ap-payments.md), [JSON](./2026-11-05-ag-09-ar-ap-payments.json).
- **AG-10 — Tesorería y contabilidad. Publicada.** [Cierre](./2026-11-05-ag-10-treasury-accounting.md) y [publicación](./2026-11-05-ag-10-publication.md).
- **AG-11 — Operación de campo. Publicada.** [Informe](./2026-11-05-ag-11-field-jobsite.md), [registro estructurado](./2026-11-05-ag-11-field-jobsite.json) y [publicación](./2026-11-05-ag-11-publication.md).
- **AG-12 — Información y exportaciones. Publicada.** [Informe](./2026-11-05-ag-12-reporting.md), [registro estructurado](./2026-11-05-ag-12-reporting.json) y [publicación](./2026-11-05-ag-12-publication.md).
- **AG-13 — Servicios transversales e interfaces de ayuda. Cerrada localmente.** Documentos, Registro, avisos, email, crons, Centro de Ayuda y Bloqer AI. [Informe](./2026-11-05-ag-13-cross-cutting.md) y [registro estructurado](./2026-11-05-ag-13-cross-cutting.json).
- **AG-14 — Regresión y preparación de release. Pendiente.** Workflows cruzados, performance, seguridad, observabilidad y verificación del despliegue correspondiente.

El orden operativo y los casos que deben reabrirse al cambiar una dependencia se resuelven con el plan y el procedimiento. Una etapa puede requerir varias corridas acotadas; un informe parcial no cierra toda la etapa.

## Evidencias de descubrimiento para AG-00

La preparación del kit incluyó validación de metadata YAML y enlaces locales de la skill/documentos, parseo de los cuatro perfiles TOML y comprobación de tipos de la vista interactiva del plan. Una simulación independiente comprobó pedidos de Compras acotado, cambio en control decimal compartido y planificación sin ejecución. Estas comprobaciones validan el kit, no reemplazan las pruebas de producto de AG-00.

Estas observaciones provienen de lectura de archivos al corte inicial. Son entradas para preparar verificaciones, no resultados de suites ejecutadas:

- El comando `test` del `package.json` raíz selecciona varios paquetes, pero no incluye `@bloqer/report-pdf`, que tiene pruebas propias. Una ejecución del comando raíz no demuestra por sí sola la cobertura de PDF.
- El comando `test` de `apps/web/package.json` enumera un subconjunto de archivos de pruebas presentes en features y componentes. AG-00 debe contrastar el inventario con lo que realmente se ejecuta y registrar exclusiones.
- Hay suites live omitidas por flags y E2E condicionado por credenciales, fixtures y configuración de CI. Separar pruebas aprobadas, fallidas, omitidas y no ejecutadas; una omisión no cuenta como validación del comportamiento.
- El build raíz y el build de database pueden alcanzar el migrador de Vercel. El helper aplica `migrate deploy` cuando `VERCEL=1`; antes de usar estos comandos como verificación, inspeccionar el entorno y los efectos que tendrían.
- Queda por verificar la distribución real de lecturas entre UI, services y repositorios contra los límites de arquitectura documentados. La ubicación de un archivo, una búsqueda textual o una diferencia de organización no prueban por sí solas un defecto ni justifican imponer un refactor.

## Antecedentes y trabajos relacionados

Las auditorías previas conservan evidencia y decisiones de su momento. Al reutilizar un hallazgo, comprobar su estado en las decisiones vigentes, el código, las pruebas y el entorno actual; no importar un resumen histórico como diagnóstico presente.

- [Auditoría técnica de código](../../AUDITORIA_TECNICA_CODIGO_BLOQER_V2.md): categorías de revisión, hallazgos históricos, estabilización y límites de las verificaciones de ese release.
- [Auditoría final de calidad](../../AUDITORIA_FINAL_CALIDAD_BLOQER_V2.md): pasadas por categoría, triage y correcciones posteriores. Los resúmenes iniciales y el cierre corresponden a distintos momentos.
- [Auditoría mobile](../../AUDITORIA_MOBILE_BLOQER_V2.md): cobertura responsive, capturas y resultados Field por lote; distinguir evaluación inicial de implementaciones posteriores.
- [Auditoría Prisma/ERD](../PRISMA_ERD_AUDIT.md): modelos, relaciones y criterios históricos de integridad. Contrastar cada conclusión con decisiones y schema vigentes.
- [Plan INDARI / Casa Hogar](../INDARI_CASA_HOGAR_IMPROVEMENT_PLAN.md): trabajo específico ajeno a este registro y en curso. Este kit no modifica ese plan ni diagnostica los cambios locales o archivos sin seguimiento de ese trabajo. Si una futura corrida comparte alcance, debe coordinarse y enlazar su evidencia para evitar duplicar o pisar cambios.

## Cómo registrar una corrida

Crear el informe dentro de esta carpeta con nombre `AAAA-MM-DD-ag-XX-descripcion.md`, por ejemplo `2026-11-03-ag-06-compras.md`. El nombre es una convención para futuros informes; no acredita una corrida existente. Si hay más de una corrida del mismo tema y fecha, agregar un sufijo descriptivo que las distinga.

Asignar a cada hallazgo nuevo una ID estable con formato `GA-AG-XX-NNN`, por ejemplo `GA-AG-06-001`. Antes de crearla, buscar hallazgos del mismo defecto o causa en el registro y sus informes. Si reaparece, mantener la misma ID y enlazar tanto el informe original como la nueva evidencia. Si ya existía con una ID histórica como `BUG-014`, conservar también ese vínculo y evitar contabilizarlo como dos defectos.

Al incorporar cada informe:

1. Enlazarlo desde la etapa correspondiente y anotar su alcance exacto, fecha y responsable de la corrida.
2. Registrar la referencia de código, los cambios locales relevantes y el entorno verificado que delimitan la evidencia, sin publicar credenciales ni datos sensibles.
3. Resumir hallazgos, decisiones pendientes, correcciones verificadas y limitaciones. Mantener diferenciadas la corrección en código, la validación con pruebas y la verificación del despliegue.
4. Actualizar el seguimiento de la etapa únicamente por el alcance demostrado. Un requisito sin ambiente, datos o decisión disponible permanece pendiente con motivo y próximo paso.
5. Dejar explícitos los consumidores o flujos que deben revalidarse por la corrección y enlazar las corridas de regresión correspondientes.

## Vigencia de la evidencia

Una conclusión vale para la base y el entorno registrados en su informe. Al cambiar código, schema, permisos, componentes compartidos o contratos que sostienen esa conclusión, marcar como pendiente de revalidación el alcance afectado y sus consumidores según el procedimiento. Conservar el informe anterior como historial; no sobrescribir su resultado como si correspondiera a la nueva base.

La auditoría global se cierra con cobertura y evidencia de las etapas aplicables y sus regresiones. Este registro inicial organiza ese trabajo; no declara a la plataforma libre de errores.

## Corrida AG-08: 05/11/2026

Base limpia b05fa722, posterior a la entrega AG-07. [Informe](./2026-11-05-ag-08-certifications-subcontracts.md) y [registro estructurado](./2026-11-05-ag-08-certifications-subcontracts.json).

- 30 grupos corregidos, cero hallazgos confirmados pendientes en el alcance; D-131 conserva Emitido y AP borrador antes de CxP, D-132 mantiene no negativos.
- 2.528 pruebas generales aprobadas y 90 SQL distintos aislados; 36 suites live omitidas en el runner general se distinguen de esa selección. Tipos/lint/compilación final correctos, índice/5 recuperaciones sin LLM.
- Revisión independiente y adendas, estados/fuentes/saldos/numeración, dos temas y viewports 1280×720/390×844. Capturas y fixtures sintéticos identificados; logout/tema/viewport/pestaña/servidor comprobados.
- AG-08 permanece sin publicar. AG-09 no iniciada; esperar indicación del Owner. La rectificación eventual conserva diseño previo separado.

## Corrida AG-09: 05/11/2026

- [Informe](./2026-11-05-ag-09-ar-ap-payments.md) y [registro estructurado](./2026-11-05-ag-09-ar-ap-payments.json). 30 grupos corregidos en ventas, CxC, cobranzas, CxP y pagos.
- 2.650 pruebas generales y 75 casos SQL distintos aprobados: 49 propios y 26 regresiones AG-08. Tipos, lint, compilación, muestra visual aislada y revisión independiente aprobadas.
- Cierre local, sin publicación ni migraciones. AG-10 espera indicación del Owner.

## Corrida AG-10 del 05/11/2026

- [Informe](./2026-11-05-ag-10-treasury-accounting.md) y [registro estructurado](./2026-11-05-ag-10-treasury-accounting.json). 31 grupos en Tesorería, conciliación, períodos y Contabilidad.
- D-134 a D-139 aprobadas. Dos migraciones aditivas probadas en base aislada. 2.678 pruebas generales y 21 casos SQL distintos aprobados, tipos, lint, compilación y revisión independiente.
- Muestra de escritorio, tablet y teléfono. Cierre local. AG-11 espera indicación del Owner.
- [Publicación AG-10](./2026-11-05-ag-10-publication.md) posterior al cierre local. PR #8, Production `77c9596c`, 73 migraciones terminadas, cuatro columnas nuevas comprobadas y acceso público aprobado.

## Corrida AG-11 del 05/11/2026

- [Informe](./2026-11-05-ag-11-field-jobsite.md) y [registro estructurado](./2026-11-05-ag-11-field-jobsite.json). 20 grupos corregidos en Libro de obra, Field, inventario, cronograma, evidencia, R-002 y reporte diario D-100.
- 2.706 pruebas generales, 49 casos SQL distintos, tipos en 13 tareas, lint, compilación y revisión independiente. Guía, Ayuda e índice AI actualizados con 587 fragmentos.
- Muestra aislada de OWNER y PROJECT_VIEWER en escritorio, tablet y teléfono. [AG-11 publicada](./2026-11-05-ag-11-publication.md) después del cierre local.

## Corrida AG-12 del 05/11/2026

- [Informe](./2026-11-05-ag-12-reporting.md) y [registro estructurado](./2026-11-05-ag-12-reporting.json). Once grupos corregidos en tableros, reportes de obra y empresa, exportaciones y entrega.
- D-140 a D-142 aprobadas. Pasaron 2.733 pruebas generales, 32 casos SQL distintos, chequeo de tipos, lint, compilación y revisión independiente. Muestra aislada de escritorio, tablet y teléfono con PDF y CSV descargados.
- [Publicación AG-12](./2026-11-05-ag-12-publication.md) posterior al cierre local. PR #10, Production `8c18f331` y acceso público verificado.

## Corrida AG-13 del 05/11/2026

- [Informe](./2026-11-05-ag-13-cross-cutting.md) y [registro estructurado](./2026-11-05-ag-13-cross-cutting.json). Correcciones en Documentos, Registro, alcance de Equipo, alertas, notificaciones, correo programado, Centro de Ayuda y Bloqer AI.
- D-143 aprobada para entregas sin confirmar. D-144 aprobada para históricos del Registro.
- Pasaron 2.756 pruebas generales, 10 casos SQL aislados, 202 casos estructurales de Bloqer AI, tipos, lint y compilación. Cierre local. AG-14 espera indicación del Owner.
