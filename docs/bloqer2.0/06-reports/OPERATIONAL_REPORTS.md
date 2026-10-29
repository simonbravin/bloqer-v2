# Reportes operativos

## Objetivo
Soportar decisiones de **obra y compras**: productividad, consumo, proveedores, certificaciones.

## Reportes clave
- Presupuesto vs real ([`R-001`](./REPORT_CATALOG.md)) — hub `/proyectos/[id]/reportes/presupuesto-vs-real`.
- Avances del proyecto ([`R-002`](./REPORT_CATALOG.md), D-120) — reporte propio `/proyectos/[id]/reportes/avances`: físico por libro, plan comparable, certificado, consumo de presupuesto, cobranza y pendientes.
- Compras por proveedor / multi-proyecto ([`R-009`](./REPORT_CATALOG.md), [`R-010`](./REPORT_CATALOG.md)); **Proveedores de la obra** ([`R-AP-03`](./REPORT_CATALOG.md)) en `/proyectos/[id]/reportes/proveedores`; desvíos OC vs APU y sin imputación ([`R-AP-01`](./REPORT_CATALOG.md)…) en *Análisis de compras*.
- Subcontratos: varianza SUB y evolución certificado/pagado ([`R-SCC-*`](./REPORT_CATALOG.md), [`R-SUB-*`](./REPORT_CATALOG.md)).
- Materiales más caros / por proyecto ([`R-011`](./REPORT_CATALOG.md), [`R-013`](./REPORT_CATALOG.md)).
- Evolución certificaciones ([`R-012`](./REPORT_CATALOG.md)) + estado cartera ([`R-CERT-*`](./REPORT_CATALOG.md)).

**Baseline vs ejecución:** ver [`../08-architecture/REPORTING_ERD_GUARDRAILS.md`](../08-architecture/REPORTING_ERD_GUARDRAILS.md).

## Reglas
- Toggle **comprometido/pagado** en columnas de costo real ([D-021]).
- Siempre permitir filtro por obra.

## Exportación
XLSX preferido para análisis; PDF para reunión de obra.

## R-002 — Avance del proyecto (D-120)

**Fecha:** 2026-10-28. **Estado:** disponible en código, con foco en dirección, según [D-120](../00-product/DECISION_LOG.md); **sin publicación**. Q-066 y el tratamiento de Q-005b para este reporte quedan resueltos; no cambia D-003/D-045/D-116/D-119 ni autoriza normalizar datos históricos. Fórmulas canónicas: [PROGRESS_FORMULAS](../04-formulas/PROGRESS_FORMULAS.md).

### Objetivo y ubicación

Dar al PM y a dirección una lectura conjunta de cuánto se ejecutó, cuánto se reconoció al cliente, cuánto presupuesto se consumió y qué acción está pendiente. Acceso **Avances del proyecto** en Reportes de la obra (`/proyectos/[id]/reportes/avances`), con **Reporte de avances** desde Resumen y Cronograma. Reutiliza R-002 en lugar de crear otro reporte con la misma identidad.

### Lecturas e indicadores

- **Cronograma:** avance y situación **actual del proyecto completo**, aun al recortar presupuesto o corte en las métricas del reporte. Etiquetas **Real · cronograma completo actual** y **Tareas actuales · proyecto completo**; sus pendientes explican ese alcance actual. Distinguir Real (libro o excepción manual) de Plan(t), referencia calendario lineal. El plan comparable del gráfico sí usa el alcance y corte seleccionados. Los hitos completados por recepción no acreditan terminación física de una partida.
- **Físico por libro:** mediciones de partes APPROVED por partida; porcentaje incremental y fallback a cantidad según D-045. Mostrar origen, última fecha de ejecución registrada y unidad. Partes SUBMITTED aparecen como pendientes de aprobación, no como avance reconocido. Ponderación global por costo directo presupuestado de partidas hoja según D-120; no sumar cantidades de distintas unidades ni promediar porcentajes sin pesos. Mostrar avance observado, cobertura y global validado cuando la evidencia sea completa. Una partida sin medición conserva el peso en la base; costo cero no aporta peso pero debe advertirse.
- **Certificado sobre venta:** importe acumulado ISSUED/APPROVED sobre venta presupuestada del mismo alcance; separar físico declarado en certificados y cantidad económica, independientes según D-003/D-119. No sustituir la medición del libro por el porcentaje de una certificación.
- **Consumo del presupuesto de costo:** mostrar devengado y exposición contra el presupuesto de costo, y pagado como capa separada. Reutilizar [COST_FORMULAS](../04-formulas/COST_FORMULAS.md); no apilar comprometido total, devengado y pagado como componentes sumables. Presupuesto menos exposición es disponibilidad presupuestaria, no costo necesario para terminar.
- **Cobrado sobre facturado:** cobranzas reales aplicadas a CxC sobre facturación emitida del alcance; saldo y vencido provenientes de Receivable/Collection. El denominador difiere de certificado/venta; mostrarlo siempre. No inferir cobros del estado documental de la certificación.

El **Real del cronograma y el libro no se suman**: normalmente el segundo alimenta al primero. Una divergencia se presenta con su causa verificable (vínculo EDT, excepción manual, hito, alcance o fecha), no como un nuevo tipo de ejecución.

### Composición visual

1. **Encabezado:** proyecto, fecha de corte, período de movimientos, alcance/presupuestos incluidos, moneda y método de ponderación. Mostrar actualización/cobertura de cada fuente. Separar movimiento del período de acumulado desde el inicio hasta el corte.
   Los indicadores muestran **Última medición**, **Último certificado**, **Último costo** y **Última cobranza** a partir de evidencia válida disponible al corte y con permisos. Fecha ausente se explica como **Sin evidencia al corte**, sin inventar umbrales de antigüedad o severidad. Los archivos conservan estas fechas fuente.
2. **Lectura principal:** físico reconocido y cantidades pendientes, junto a la referencia de cronograma con su método. La ausencia de medición o de base se muestra explícitamente; no convertirla en 0% confirmado ni en 100%.
3. **Gráfico de ejecución acumulada:** curva por libro y referencia del plan actual únicamente con igual alcance y ponderación aprobada. Si se recalcula usando el plan vigente, identificarlo; no presentarlo como línea base histórica congelada. No inferir una serie histórica del Real a partir de su valor actual.
4. **Gráfico comercial:** certificado, facturado y cobrado, en panel propio y misma moneda; identificar que las bases fiscales pueden diferir. No tratar una diferencia de totales como saldo automáticamente facturable.
5. **Gráfico de costos:** barras comparables de presupuesto, devengado y exposición; pagado como lectura separada. Mostrar excesos reales sin cortar la escala al 100%.
6. **Detalle EDT:** rubro/partida, unidad, alcance, físico, cantidad ejecutada, por ejecutar, cantidad certificada y pendientes. Costos y documentos se expanden según permisos. Conservar adendas y vínculos a evidencia; evitar duplicar padres e hijos en los totales.
7. **Pendientes accionables:** descripción, evidencia, fecha, importe/cantidad cuando aplique y acceso a la operación existente. No crear estados ni responsables por defecto; usar los datos que ya existen.

**Contrato de filtros:** Presupuesto (`budgetId`, opcional), Moneda (`currency`, original coherente), Movimientos desde (`dateFrom`) y Fecha de corte (`dateTo`, por defecto hoy Buenos Aires). Desde ≤ corte ≤ hoy. La ventana de evolución visible admite hasta **120 meses calendario**, contando inicio y fin, como límite técnico de generación de series; el acumulado desde el inicio y el saldo anterior se conservan. El corte limita ejecución/documentos y no representa un forecast. La selección de moneda no convierte automáticamente presupuestos extranjeros a ARS; fuentes discrepantes se advierten y no se suman. Ventas directas sin vínculo al presupuesto quedan fuera de los ratios contractuales, con aviso y enlace a su operación. Si falta una base de costo comparable de alguna partida, físico/plan ponderados, observado y cobertura ponderada quedan no calculables: no se usa el subtotal conocido como base; se conservan conteos y detalle.

### Qué queda pendiente, según la fuente

- **Ejecutar:** saldo físico/cantidad por partida y tareas atrasadas o BLOCKED con causa. Conservar la unidad de cada ítem.
- **Aprobar:** partes SUBMITTED y certificados ISSUED pendientes de aprobación. No reconocerlos dos veces como ejecución/documentos aprobados.
- **Certificar:** distinguir saldo contractual total de ejecución aprobada aún no certificada. Reutilizar la sugerencia revisable de D-119 con tope contractual, descontando todos los certificados vigentes emitidos/aprobados, incluso posteriores al corte, para no proponer una acción ya realizada. Los indicadores de certificado acumulado sí respetan el corte. No afirmar que toda esa diferencia es un derecho de cobro automático.
- **Facturar:** identificar certificados aprobados sin factura emitida vinculada, con acceso a su detalle. No calcularlo restando montos agregados de distinto alcance o tratamiento fiscal.
- **Cobrar:** saldos abiertos y vencidos de CxC; mostrar vencimiento y aplicaciones reales. Una brecha temporal puede responder a condiciones comerciales, anticipos o acopios; no etiquetarla automáticamente como error.
- **Revisar costos/datos:** exposición superior al presupuesto, líneas sin imputación EDT, partidas sin base/medición y fuentes desactualizadas. Mostrar fecha de última medición sin inventar un umbral de antigüedad o severidad.

### Exportaciones y distribución

Paridad con el resto del producto: descarga **Excel, CSV y PDF**; envío manual por email y reportes programados en **CSV/PDF**, mediante el registro existente. El PDF ejecutivo incluye indicadores, gráficos y principales pendientes; Excel/CSV permiten analizar las partidas. R-002 cuenta con sus propios builders; no confundirlos con la tabla mensual exportada por Certificaciones.

Vista, archivos y adjuntos deben compartir servicio, filtros, alcance, corte, moneda y permisos. Encabezado/pie con branding de la empresa y fecha de generación según [EXPORT_FORMATS](./EXPORT_FORMATS.md). Aplicar permisos por sección antes de generar el DTO/export; no exponer costos o datos financieros restringidos por incorporar el reporte en un menú operativo.

### Referencias de mercado revisadas

- **Procore:** [Field Production Report](https://support.procore.com/faq/which-data-columns-are-in-a-field-production-report) compara cantidades presupuestadas/instaladas, pendientes y rendimientos por código/unidad. [Exporta CSV/PDF](https://support.procore.com/products/online/user-guide/project-level/timesheets/tutorials/export-the-field-production-report). [Sus fuentes](https://support.procore.com/faq/which-procore-project-tools-update-data-in-the-field-production-report) no integran indistintamente todas las entradas del Daily Log. Adoptar medición por cantidades y trazabilidad; no atribuirle una integración automática de cualquier libro.
- **Odoo 20:** [tablero de proyecto](https://www.odoo.com/documentation/20.0/es/applications/services/project/project_management/project_dashboard.html) reúne tareas, hitos y actualizaciones; el porcentaje de actualización es manual. [Rentabilidad](https://www.odoo.com/documentation/20.0/es/applications/services/project/project_management/project_profitability.html) separa etapas y permite abrir documentos. Adoptar la navegación y los pendientes por etapa; no trasladar su porcentaje manual a una medición física de construcción.

### Plan de implementación y validación

- [x] Resolver Q-066/Q-005b mediante D-120 y documentar ponderación, base nula y alcance histórico en fórmulas canónicas. Q-059 sigue diferida: sin EAC ni fecha estimada de fin nuevos.
- [x] Construir lectura integrada en service layer con fuentes actuales y contratos explícitos de fecha, moneda y permisos; reutilizar repositorios existentes sin nuevas tablas paralelas.
- [x] Incorporar reporte, gráficos, detalle EDT y pendientes con evidencia y vínculos a las operaciones existentes.
- [x] Integrar Excel/CSV/PDF, envío manual por email y registro de envíos programados con el mismo resultado del servidor. Integración de código y pruebas automáticas; no se envió correo real durante esta validación.
- [x] Verificar automáticamente alcance principal + adendas y recorte por presupuesto; acumulados no reiniciados por Desde; estado actual identificado y referencia del plan vigente.
- [x] Verificar automáticamente cero explícito frente a ausencia de medición, cobertura parcial, base cero, partidas sin costo, base desconocida, legacy y anomalías sin clamp visual. Sin base presupuestaria completa, venta/costo presupuestados y sus ratios son no calculables; los importes reales conocidos y autorizados se conservan.
- [x] Verificar automáticamente monedas comparables, documento/partida y aplicaciones de cobro, permisos por sección y aislamiento tenant/empresa/obra, también en salidas; NC proveedor sigue el compromiso inequívoco del padre o invalida exposición con aviso.
- [x] Verificar paridad de contratos/filtros y contenido de exports con pruebas; inspeccionar visualmente el PDF ejecutivo de **3 páginas**. Escritorio/celular: inspección del código y sus variantes responsive, sin navegación autenticada.
- [x] Actualizar catálogo, guía operativa, centro de ayuda y conocimiento/evaluaciones de Bloqer AI en el mismo cambio (D-090); regenerar y comprobar el índice de knowledge. Ayuda: 16 pruebas de catálogo/integridad aprobadas; 3 casos AI fake/structural aprobados (sin afirmar calidad live del modelo).
- [ ] Ejecutar smoke autenticado de escritorio y celular con una obra operativa, incluyendo descargas y recorrido de pendientes; no cubierto por las pruebas con fixtures.
- [ ] Verificar envío manual/programado real solo dentro de una operación autorizada; no realizado en esta entrega de código.

**Evidencia automática al cierre (2026-10-28):** servicios **39 pruebas** (24 de backend, 4 de exports y regresiones), PDF **6**, web **35** más **3 RSC**, y **3 evals AI fake/structural** aprobadas; tipos web correctos. La última compilación completa de Next finalizó con código 0 (compilación, chequeos de tipos/lint y generación de 111 páginas), sin ejecutar migraciones. El smoke local anónimo comprobó que la pantalla y el endpoint PDF devuelven **307 hacia login**; se ejecutó sin consultar datos de obra ni enviar correos. La sesión autenticada sigue pendiente. Las pruebas focalizadas de servicios usan fixtures y sustituciones controladas de fuentes: verifican cálculo/contrato, no equivalen a contrastar saldos de una base productiva. La revisión independiente contrastó consultas y fórmulas con los flujos reales de emisión/anulación de facturas, NC/ND, aplicaciones y cobranzas. No se desplegó ni se migró una base.

**Smoke operativo:** abrir Reportes → Avances del proyecto; elegir Presupuesto/Moneda/Movimientos desde/Fecha de corte; comprobar un parte aprobado, un enviado y una partida sin medición; abrir la evidencia desde Pendientes para avanzar; exportar CSV/Excel/PDF y comparar corte/alcance/cobertura con pantalla. Revisar una adenda, un usuario sin permiso financiero, un proyecto sin base y un registro legacy. Enviar el reporte desde los flujos existentes solo a destinatarios autorizados por la operación.

## Hallazgo — Curvas anteriores integradas en certificaciones

**2026-10-28 — escala resuelta:** el helper `certificationWeightedPhysicalPct` corrige la escala de la referencia física derivada de certificaciones; su regresión comprueba 50% en lugar de 5000%. Esa referencia continúa ponderada por importes de certificados y conserva la semántica de período del reporte de certificaciones: no es el físico acumulado del libro. La pantalla de Certificaciones deja de mostrarla como triple curva de R-002 y ofrece acceso al reporte **Avances del proyecto**. R-002 usa su propia serie de D-120, apertura anterior al período y acumulados desde el inicio; no reutiliza la serie física de certificaciones.

## Referencias
- [`../04-formulas/COST_FORMULAS.md`](../04-formulas/COST_FORMULAS.md)

## Auditoría de código del R-002 — 2026-10-28 / cierre 2026-10-29

**Alcance:** implementación del reporte y sus integraciones de lectura, UI, exportación y distribución del commit `f0855713`. Revisión local de código, regresiones y aislamiento de consultas; no equivale a una auditoría de todo el ERP ni a validación con datos productivos. Las correcciones de esta auditoría quedan para revisión antes de un nuevo commit/push, según indicación del Owner.

### Críticas

No se confirmó un fallo crítico reproducible en el alcance revisado. Se conservaron los guards de tenant/empresa/proyecto, permisos por fuente y exclusión de fuentes no autorizadas. No se modificaron datos, máquinas de estado ni esquema.

### Medias — corregidas

1. **M-01 — Exposición duplicada con nota de débito de proveedor.** La ND no seguía la factura de origen para consumir el compromiso abierto. OC 100 + factura ligada 80 + ND 20 se mostraba como exposición 120. Ahora sigue el vínculo inequívoco del padre, al igual que la NC, conservando el signo de la ND: devengado 100 + abierto 0 = exposición 100. Un vínculo ambiguo no recibe un prorrateo inventado.
2. **M-02 — Pérdida de historia comparable.** La disponibilidad financiera se decidía una sola vez usando todos los documentos hasta el corte final; una incidencia de agosto anulaba también los valores válidos de julio y la apertura. Ahora moneda y trazabilidad se evalúan en cada corte y solo para las partidas del alcance seleccionado: una línea ambigua de otra adenda no invalida el presupuesto consultado. Excel/CSV y las curvas de PDF también conservan puntos anteriores cuando el indicador final queda no calculable. Las fuentes sin permiso siguen completamente excluidas.
3. **M-03 — Barras negativas de PDF con dirección incorrecta.** El uso de valor absoluto dibujaba importes negativos como positivos. Ahora las barras parten de un origen cero común: negativas hacia la izquierda y positivas hacia la derecha, con signo conservado en las etiquetas.

### Leves — corregidas

1. **L-01 — Cantidad contractual desconocida mostrada como cero.** Una partida sin `CostItem` publicaba `budgetQty = 0`. El DTO conserva ahora null y las vistas/archivos muestran ausencia de dato.
2. **L-02 — Pérdida de centavos en tooltip de importes grandes.** El texto se reconstruía desde la coordenada numérica del gráfico. Ahora usa el string monetario exacto del servicio; hay regresión con `90071992547409.91`.
3. **L-03 — Fechas editadas desincronizadas al volver a elegir el rango activo.** Si la URL no cambiaba, los borradores de los inputs conservaban las fechas anteriores. El control canónico notifica la selección de rango y sincroniza ambos campos, aunque el rango ya estuviera activo.
4. **L-04 — Fuentes de costo deshabilitadas sin aviso específico.** Se agregan exclusiones y advertencias explícitas para Compras/Subcontratos; la guía y ayuda aclaran ese alcance y alinean la etiqueta **Último registro de costo**.

### Limpieza y verificación

- Se indexan una sola vez los acumulados de certificación por partida, evitando recorrer todas las líneas por cada fila. Se preserva la separación entre cantidades al corte y cantidades actuales para sugerencias D-119.
- Se extraen las prioridades de pendientes fuera del comparador y los datos/coordenadas de gráficos PDF a helpers puros; no se cambian fórmulas ni se agrega infraestructura.
- Regresiones reproducidas antes de corregir: ND 120 en lugar de 100, cortes históricos null por incidencia posterior y cantidad desconocida convertida a cero. Nuevas pruebas cubren además preservación en archivos, dirección de barras y precisión de tooltips.
- Validación focal: **45 pruebas de servicios/exportación, 37 web y 9 de PDF aprobadas (91 en total)**; tipos y lint focal correctos. Compilación Next completa con salida 0 y 111 páginas generadas; mantiene avisos preexistentes fuera del alcance del R-002. Revisión visual del PDF con costos negativos y último corte incompleto correcta. La selección de rango se revisa en código y con tipos; no se afirma un recorrido autenticado de navegador ni validación contra una DB real. Sin nuevo commit ni push en esta auditoría.
