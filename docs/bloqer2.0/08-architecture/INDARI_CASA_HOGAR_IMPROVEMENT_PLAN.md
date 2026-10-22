# Plan de mejoras — INDARI / Casa Hogar

Fecha: 21/10/2026. Estado: **fase 0 documentada; fases 1 y 2 implementadas y probadas en entorno aislado, pendientes de publicación en producción**. P-IND-02/P-IND-04 corregidos y verificados en DB aislada; P-IND-03 y regularizaciones históricas siguen pendientes. Ver [resultados de fase 0](./INDARI_CASA_HOGAR_PHASE_0.md), §11 como historial y §12/13 para el estado vigente.

Este plan convierte la auditoría del relevamiento de INDARI del 15/10/2026 en entregas revisables. Los identificadores B01–B08 mantienen la correspondencia con el alcance interno entregado. Las fases de este documento son propias de esta intervención; no renumeran el roadmap general del producto.

La aprobación del plan de software no implica autorizar anulaciones, modificaciones de importes ni reversión de pagos de producción. Los comprobantes fiscales y bancarios deben respaldar cualquier regularización. Los datos privados detallados de la auditoría permanecen fuera del repositorio.

## 1. Orden recomendado

1. **Fase 0 — Base técnica y conciliación:** verificar versión desplegada, aclarar historial de migraciones y preparar reproducciones. Abrir B01 con prioridad urgente.
2. **Fase 1 — Correcciones acotadas:** B02 y partes confirmadas de B03/B04. Entregas pequeñas sin nuevas columnas, estados ni reglas financieras.
3. **Fase 2 — Integridad de facturación:** reproducir y corregir defectos de B01; distinguir mejoras preventivas de regularización de datos históricos.
4. **Fase 3 — Ampliaciones de producto:** B05–B08, cada una condicionada a una definición funcional y técnica concreta.
5. **Fase 4 — Liberación y cierre:** controles de entrega aplicados a cada PR de las fases anteriores, no una publicación gigante al final.

La conciliación de B01 y la búsqueda de comprobantes pueden continuar mientras se desarrollan las mejoras acotadas. La falta de documentación de INDARI no bloquea etiquetas ni adjudicación parcial. Sí bloquea decidir qué operación real conservar o revertir.

## 2. Base verificada y límites de la auditoría técnica

### Código y documentación

- Base local inspeccionada: rama `main`, commit `527c824c` del 30/09/2026. Coincide con el último deployment Production exitoso registrado en GitHub; falta acreditar la asignación actual del alias `portal.bloqer.app` en Vercel.
- Se revisaron arquitectura, capas, ERD funcional/técnico, roadmap, Prisma, migraciones y servicios de compras/AP. El ERD técnico es una propuesta de alto nivel; no se deben implementar sus entidades propuestas como si faltaran por error en Prisma.
- Adjudicación parcial ya está especificada en BR-PUR-024 y aceptada por `createPurchaseOrdersFromAwards`. La matriz exige actualmente seleccionar todos los ítems libres. Esta discrepancia del código local es reproducible por lectura del flujo.
- El cálculo actual distingue neto, IVA, descuentos e IIBB. Los casos del cliente no prueban por sí solos un error de fórmula.
- El servicio de anticipos a proveedor sin factura es un stub que devuelve `CONFLICT`. ADR-013 ya contempla cuenta puente diferida: reutilizar esa decisión, completar su alcance y no crear un circuito alternativo.

### Prisma y producción: consulta de solo lectura del 21/10/2026, 14:00 ART

- `prisma validate` finalizó correctamente con el schema actual. Esto valida la definición, no certifica ausencia de drift ni integridad de todos los datos.
- Producción: Neon branch `production`, compute `ep-cold-mouse-appkpn84`. Se utilizó una transacción explícita `READ ONLY`.
- Hay **69 migraciones locales y 69 aplicadas**, sin nombres pendientes, adicionales ni ejecuciones inconclusas activas.
- Tres checksums difieren: `20260807220000_d074_treasury_settlement_method`, `20260807230000_d075_bank_reconciliation`, `20260808140000_d078_period_close`. La fase 0 confirmó que contienen etiquetas literales, no hashes, también presentes en dev. No se recuperó su procedencia exacta. El historial se reprodujo en una DB vacía y coincidieron todos los objetos estructurales comparados con producción. Ver P-IND-01 y el informe de fase 0; no se justifica corregir checksums en producción.
- Una cuarta diferencia, `20260914120000_d115_fiscal_credit_debit_notes`, se explica por CRLF local: producción coincide con Git/LF. No requiere reparar la base.
- Se comprobaron columnas críticas de adjudicación, vínculo factura–OC/línea, IIBB, notas fiscales, saldo acreditado e idempotencia. Los importes consultados son `numeric(18,4)` y FX `numeric(18,6)`; se conserva la normalización operativa de dinero a 2 decimales de D-053, sin migrar todos los importes a escala 2.
- Existen los índices únicos de adjudicación activa por línea SC, idempotencia de facturas/pagos/movimientos y una CxP por factura. Las FKs consultadas de los vínculos de compras/AP están validadas.
- Ampliación de fase 0 a las 16:02 ART: coincidencia de 1.206 columnas, 346 restricciones, 355 índices y 387 valores de enum con una reconstrucción aislada. No se certifican funciones, triggers, roles ni integridad de todos los datos; no se probaron mutaciones ni concurrencia en producción.

### Pruebas existentes ejecutadas

**61 pruebas pasaron, 0 fallaron, 0 omitidas**, en siete archivos de `packages/services/src/`:

- `procurement/purchase-variance.test.ts`
- `procurement/procurement-budget-baseline.test.ts`
- `ap/supplier-invoice-from-po-pure.test.ts`
- `finance/invoice-line-money.test.ts`
- `ap/supplier-invoice-cancel-guards.test.ts`
- `finance/obligation-balance.test.ts`
- `ap/register-supplier-advance.test.ts`

Son una base de regresión existente. La fase 0 agregó seis pruebas de protección del destino: **67 unitarias aprobadas**. La nueva integración aislada tiene **3 aprobadas y 1 fallida por timeout de adjudicación**, reproducido dos veces (P-IND-04). No se validaron todavía el caso UI de adjudicación parcial, la concurrencia real de creación de facturas ni el recorrido completo del portal. No se corrieron pruebas mutantes contra producción.

## 3. Arquitectura y modelo que se preservan

- UI y acciones delgadas → `packages/services` para reglas, permisos y transacciones → `packages/database` para persistencia/repositorios. No introducir Prisma en `apps/web`, cálculos financieros nuevos en React ni otra fuente de verdad.
- `PurchaseRequest` tiene varias OC; cada línea completa admite una adjudicación activa. `PurchaseOrderLine.purchaseRequestLineId`, `procurementQuoteLineId` e `isActiveAward` conservan procedencia; `PurchaseRequestLine.awardedPurchaseOrderId` refleja cobertura. Mantener el índice único parcial y la actualización de cobertura dentro de la transacción.
- Hoy `SupplierInvoice.purchaseOrderId` admite una OC opcional y cada línea puede referenciar una línea de esa OC. El servicio valida la correspondencia. Una factura multi-OC **no** se consigue dejando nula la cabecera o quitando esa validación.
- Factura emitida → CxP única → múltiples pagos parciales. NC y sus aplicaciones reducen deuda por el mecanismo D-115, sin simular un pago de caja.
- Los índices de idempotencia evitan repetir una intención con la misma clave. No detectan automáticamente dos cargas distintas del mismo comprobante real; no equivalen a unicidad fiscal.
- Mantener `tenantId`, permisos, acceso de proyecto D-111 y company scoping. Las líneas heredan el alcance de su cabecera: no inferir que hay que agregarles `tenantId` en esta intervención. Los registros compartidos con `companyId = null` conservan su visibilidad; Tesorería sigue siendo tenant-wide.
- DTOs serializados, sin `Prisma.Decimal` hacia componentes cliente. No importar el barrel de services desde `use client` ni alterar estados documentados para representar cobertura parcial.

## 4. Fase 0 — Preparación y prioridades urgentes

**Responsables:** desarrollo para evidencia técnica; responsable administrativo de INDARI para hechos comerciales y bancarios.

### P0-A: línea base de despliegue y migraciones

1. Registrar commit/despliegue activo de portal y compararlo con la base local. Si difieren, revisar los cambios de los servicios/pantallas afectados antes de atribuir el defecto actual.
2. Resolver P-IND-01: investigar procedencia del historial, comparar definición efectiva de los objetos involucrados y ensayarlo en un destino aislado. No editar `_prisma_migrations`, ejecutar `resolve`, resetear DB ni modificar migraciones antiguas para hacer desaparecer la diferencia de producción. El ensayo se hizo en otra DB del compute dev; la recuperación de su intento interrumpido está documentada en el informe de fase 0.
3. Si hay diferencias estructurales reales, diseñar una migración nueva después de revisar impacto. Si es solo trazabilidad del historial, documentar la reconciliación y el procedimiento permitido.
4. Preparar fixtures sintéticos mínimos en entorno no productivo: dos tenants, permisos diferenciados, cotizaciones vigentes, recepción parcial, facturas y pagos parciales. No copiar adjuntos privados ni usar Casa Hogar como banco de pruebas.

**Salida:** versión identificada; historial explicado o riesgo documentado que permita liberar un PR sin schema; entorno de prueba explícitamente separado. La fase 0 completó la comparación estructural de P-IND-01 y dejó abierta la comprobación final del alias (P-IND-03). Una corrección de UI puede avanzar en desarrollo; PR-01 también debe resolver P-IND-04 antes de liberarse. Las migraciones nuevas requieren su ensayo específico.

### P0-B: conciliación B01

Priorizar OC-040 y los pares de HVAC, Guillen y ploteos. Hay registros y movimientos distintos con coincidencias que requieren revisión; **no se confirma doble desembolso bancario** solo con la base.

Por cada caso, reunir factura completa, comprobantes bancarios/echeqs y remitos; reconstruir SC → OC → recepción → factura → CxP → pago → movimiento → asiento/aplicación de NC cuando corresponda. Distinguir documentos anulados, pagos parciales legítimos, diferencias de unidad y documentos generados desde OC cuyo vínculo se perdió.

**Salida:** ficha de conciliación con operación real, documentos relacionados, explicación de la diferencia, propuesta de regularización e impacto en costos, deuda y caja. La ejecución de datos históricos queda separada del PR preventivo.

## 5. Fase 1 — Mejoras sin modificación del modelo

### PR-01 · Adjudicación parcial de ítems completos — B02 / SC-076

**Cambio:** generar OC solo con las líneas seleccionadas; dejar las otras pendientes. Permitir desmarcar una selección antes de generar y mostrar cuántos ítems se adjudicarán. Mantener validación de al menos una selección válida, pertenencia de líneas y proveedor, vigencia y mínimo de cotizaciones.

**Hallazgo de fase 0:** la integración del servicio agotó el límite de transacción en dos intentos. Investigar P-IND-04 y exigir la prueba aprobada antes de considerar suficiente el cambio de UI. Mantener transacción, locks y atomicidad; no cambiar el timeout global sin diagnóstico.

**Puntos de intervención:** `apps/web/features/procurement/components/purchase-request-award-matrix.tsx`, integración en `procurement-quotes-section.tsx` y acción que llama a `packages/services/src/procurement/purchase-request-to-po.service.ts`. Reutilizar el servicio de adjudicación por grupos y `syncPurchaseRequestStatusAfterCoverage`; no crear otro endpoint ni un estado de SC adicional.

La matriz actual está oculta en pantallas pequeñas (`hidden md:block`). Revisar la operación equivalente en móvil y definir la presentación adaptable del mismo selector, manteniendo el atajo de cotización completa donde corresponda. No entregar un arreglo que se declare general sin comprobar ambos tamaños.

**Aceptación:**

- SC con dos líneas: seleccionar solo una genera una OC con esa línea; la otra sigue libre y la SC mantiene `SUBMITTED` hasta cobertura completa.
- Dos proveedores para dos líneas generan dos OC correctas en una transacción; nunca se fracciona cantidad de una línea.
- Selección vacía o una línea ajena no crea documentos. Doble envío concurrente no duplica adjudicaciones.
- Anular una OC libera solo su cobertura; otra OC activa permanece vinculada y el ítem libre puede adjudicarse según BR-PUR-024.

**Pruebas:** integración del servicio con DB aislada para cobertura, concurrencia y anulación; comprobación UI escritorio/móvil con fixtures. Ampliar la infraestructura Playwright existente solo para este recorrido si el entorno está disponible. No afirmar que el smoke de Tesorería ya cubre compras.

**Schema/rollback:** sin migración; revertir UI restaura comportamiento anterior sin deshacer OC legítimamente creadas.

### PR-02 · Importes y alcance de los totales — B03 / SC-080, 084, 090, 091

**Cambio:** hacer inequívoco si el unitario ingresado incluye IVA; mostrar cantidad × unitario, descuentos, neto, IVA, percepción y total donde el usuario confirma. En la matriz distinguir total de renglón y percepciones de cabecera. Al reabrir una cotización persistida en neto, indicar ese modo sin fingir que se conserva el modo original de carga.

**Puntos de intervención:** `procurement-quote-form.tsx`, `purchase-request-award-matrix.tsx`, `procurement-quotes-section.tsx`; reutilizar `packages/services/src/finance/invoice-line-money.ts`, cálculos de OC, serializadores y helpers existentes. Si surge un error de fórmula reproducible, aislarlo en otro cambio con su regla y regresión.

**Aceptación:** guardar/reabrir/editar conserva neto, IVA, descuento e IIBB sin segundo cálculo de impuestos; con IVA 21%, unitario final 121 representa neto 100. El resumen explica por qué el total del renglón de SC-084 no incluía la percepción. Aclarar unidad vs total de cantidad 2 en el caso de SC-091. Los importes históricos no se corrigen para coincidir con una cifra del Word sin comprobante.

**Pruebas:** reutilizar `invoice-line-money.test.ts`, `calc-line-money.test.ts`, `purchase-order-calc.service.test.ts`; agregar regresión de ida y vuelta solo si cambia el mapeo del formulario. Incluir descuento y percepciones, IVA cero legítimo y redondeo D-053. No duplicar fórmulas en tests de etiquetas.

**Schema/rollback:** sin migración ni cambio de fórmula aprobado; rollback de presentación. El IVA de OC-052 se trata como regularización separada con la factura real.

### PR-03 · Mensajes de aprobación y procedencia — B04

**Cambio:** diferenciar ausencia de referencia presupuestaria, unidades no comparables, desvío real y permiso insuficiente. Mostrar el ítem/campo que requiere acción y referencias SC–OC correctas. Conservar justificativos y umbrales.

**Puntos de intervención:** `packages/services/src/procurement/purchase-variance.service.ts`, `purchase-variance-pure.ts`, `procurement-budget-baseline.ts`; `apps/web/features/procurement/components/purchase-order-variance-readout.tsx`, `lib/variance-tier-labels.ts` y pantallas que consumen el resultado. Reutilizar los motivos ya derivados; no persistir una nueva clasificación para mensajes.

**Reproducciones separadas:**

- SC-073/OC-049: material del cerco asociado a referencia de mano de obra; validar con INDARI la clasificación y revisar la sugerencia de APU. No recategorizar automáticamente todo el histórico.
- SC-085/OC-051: la captura original no acredita el bloqueo de esta OC. Obtener mensaje/contexto correctos o reproducir con fixture equivalente antes de definir un fix de lógica.
- OC-021 y referencias cruzadas: mostrar número, proveedor y origen claros; distinguir una referencia errónea del informe de un enlace erróneo del producto.

**Aceptación:** una partida global no se trata como precio unitario de material físico; una falta de referencia explica el justificativo requerido; una orden válida recorre las aprobaciones que correspondan. Probar también rol sin permiso y otro proyecto/tenant.

**Pruebas:** extender `purchase-variance.test.ts` y `procurement-budget-baseline.test.ts` solo para causas nuevas confirmadas; reutilizar `procurement-access.test.ts`, `procurement-policy.test.ts` y cobertura D-111 al tocar acceso.

**Schema/rollback:** sin migración. Un cambio de política o imputación se eleva como decisión separada, no se incluye como ajuste de mensaje.

## 6. Fase 2 — Facturación y trazabilidad — B01

### PR-04 · Reproducir y cerrar defectos de cobertura e idempotencia

**Riesgo a reproducir:** `getPurchaseOrderBillingSummary` y `loadCoveredQtyByPoLine` usan el vínculo de cabecera a OC y, para cantidades, las líneas vinculadas. Un registro histórico sin esos vínculos no tiene la misma cobertura que una factura correctamente enlazada. El marcador `bloqer:auto-from-po` es evidencia de procedencia, no autorización suficiente para modificar datos.

**Otra prueba necesaria:** creación de borrador desde panel de OC y desde recepción simultáneas. La búsqueda de borrador existente y el cálculo previo a crear no deben confundirse con una garantía de exclusión concurrente. No se atribuye a esta carrera la causa histórica sin reproducción.

**Intervención prevista:** `packages/services/src/ap/supplier-invoice-from-po.service.ts`, `supplier-invoice.service.ts` y persistencia necesaria en `packages/database`. Reutilizar guards de vínculo automático, validación de líneas, helpers de cantidades pendientes, transacciones e idempotencia existentes. Si se reproduce una carrera, hacer atómica la comprobación y creación/actualización sobre el recurso correspondiente, con el patrón de bloqueo existente y sin paralelizar lecturas fuera de la transacción crítica.

No establecer unicidad «una factura por OC»: las recepciones y facturas parciales son válidas. No vincular documentos por texto o importe como reparación silenciosa. Un aviso de coincidencia basado en datos existentes puede estudiarse; un bloqueo fiscal nuevo requiere definición de identidad y excepciones.

**Aceptación y pruebas de integración obligatorias:**

- Reintento de la misma operación y dos disparadores simultáneos no reservan dos veces la misma cantidad recibida; respuesta coherente para el segundo intento.
- Segunda recepción legítima admite facturación pendiente; borradores abiertos, emitidas y anuladas se computan conforme a su estado.
- Edición o emisión de una factura generada desde OC conserva vínculos de cabecera/línea y no altera otro tenant, empresa o proyecto.
- Factura manual legítima y pago parcial siguen disponibles. NC/ND y sus aplicaciones conservan D-115; una NC no se trata como nueva salida de caja ni como devolución física implícita.
- Factura, cobertura, exposición de costo y deuda cuentan la operación según su capa; tests existentes de `cost-exposure`, `project-accrued-aggregation`, `obligation-balance` y cancelación permanecen verdes.

**Schema:** procurar solución con modelo existente; no prometer «sin migración» antes de reproducir. Cualquier índice/columna nueva exige revisar cardinalidad, datos existentes, Prisma, ERD y P-IND-01. No reutilizar un índice fiscal ficticio.

### Regularización de los datos: entrega independiente

Después de conciliar con INDARI: proponer documentos exactos a conservar/anular, efectos y secuencia soportada por los servicios. Verificar períodos cerrados, conciliaciones bancarias, pagos confirmados, NC aplicadas y asientos antes de ejecutar. Si el producto no ofrece la operación válida, diseñar herramienta/servicio documentado y aprobado; no un script SQL aislado.

Registrar evidencia y saldos antes/después. La publicación de PR-04 no declara resueltas las discrepancias históricas. Tampoco se presenta un pago cancelado internamente como dinero recuperado del banco.

## 7. Fase 3 — Decisiones de producto antes de ampliar el modelo

Cada bloque tiene su propio diseño, PR y estimación después de resolver la pregunta. Ninguno se incluye como funcionalidad ya disponible en la guía o en Bloqer AI.

### B05 · Compras históricas, vigencias y unidades — Q-061

Casos SC-079/082/083/084/099 y SC-047/048. Documentar primero qué puede resolverse con el circuito vigente y qué falta: compra futura, documento ya pagado o solicitud con unidad errónea. BR-PUR-025 no permite volver a borrador si ya hay cotizaciones; BR-PUR-024 impide adjudicar oferta vencida.

Definir con producto procedimiento excepcional, permisos, fechas/evidencias y efectos sobre OC/recepción/costo; no renovar vigencias ficticias ni convertir barras a kg por supuesto. Si exige nuevos estados/eventos/campos, actualizar decisiones, máquinas de estado, módulos y ERD antes de Prisma. Aceptación: regularización única, fechas reales, trazabilidad y ausencia de nueva deuda/caja ficticia.

### B06 · Una factura para varias OC — Q-062

Casos SC-080/090/091 y otros documentos consolidados que INDARI acredite. Mantener una factura fiscal, una CxP y sus pagos parciales. Antes de elegir modelo, definir si se permite mezclar proyectos, cómo asignar renglones y percepciones, moneda/proveedor/empresa, correcciones y relación con recepción.

La opción recomendada para evaluar es asignación por líneas con alcance acotado, sin crear dos facturas ficticias. No está aprobada como arquitectura. Diseñar compatibilidad con facturas de una OC, reportes por OC/proveedor/proyecto, three-way match, comprometido abierto, costos, notas fiscales y auditoría. Migración expand/contract y backfill solo de relaciones demostrables. Aceptación: suma de asignaciones concilia con documento único y no duplica costo/deuda/caja.

### B07 · Anticipos de proveedores — Q-063 / ADR-013

Casos SC-095/099. Separar anticipo con factura real (factura y pago parcial por circuito existente, verificando restricciones concretas de la OC) de anticipo sin factura (cuenta puente aún no implementada). No reducir el total de la oferta al anticipo ni simular recepción física.

Reutilizar ADR-013, validador y stub. Definir aplicación manual/automática, moneda, remanente, devolución, cancelación y cierre contable antes de modelar. No reutilizar `Payment` sin `Payable`. Incluir tesorería, AP, contabilidad, reportes y RBAC en el diseño. Aceptación: anticipo y saldo reconocibles y aplicados una sola vez, con reversión trazable y recepción independiente.

### B08 · Ofertas incompletas y bonificaciones — Q-064

**Actualización:** Q-064 resuelta por el Owner en D-118; implementación y evidencia en §15. Los párrafos siguientes registran el diagnóstico previo.

Caso SC-097 y alcance de SC-076. Hoy una cotización puede contener un renglón cero si otro tiene precio; no es prueba suficiente de un ítem ofrecido gratis. Definir representación de «no cotizado» vs bonificación y su comportamiento al comparar, adjudicar y contar cotizaciones válidas.

Hasta esa decisión, no convertir ceros históricos automáticamente ni prohibir toda bonificación. Evaluar cambio en validadores, servicios, matriz y formulario; actualizar ERD/Prisma solo si la representación elegida lo requiere. Aceptación: una omisión no se adjudica por error y una bonificación legítima es inequívoca.

## 8. Fase 4 — Entrega segura por PR

**Antes de merge:**

1. Revisar diff acotado, regla respaldatoria, alcance de DB, permisos/tenant y efectos financieros. Sin dependencias nuevas previstas.
2. Ejecutar lint y typecheck de los paquetes afectados y checks obligatorios de CI. Pruebas de regresión proporcionales: cálculos/servicios y DB real aislada para concurrencia, no solo mocks. No ejecutar suites live sin verificar destino y comportamiento.
3. Para cambios visibles, actualizar en el mismo PR `GUIA_OPERATIVA_BLOQER_V2.md` y `apps/web/features/help/lib/articles/planning-procurement.ts` o `finance.ts`, según corresponda. Revisar catálogo/búsqueda e impacto AI según `CHANGE_IMPACT_POLICY.md`: knowledge, tools y evals solo donde aplique. Las instrucciones deben describir la entrega real.
4. Documentar escenarios manuales en `DEPLOYMENT_SMOKE_TEST.md`, reutilizando infraestructura existente. La regla del repo excluye navegación local no solicitada; usar pruebas automatizadas aisladas y, cuando corresponda, smoke de portal después del deploy con alcance explícito.

**Publicación:**

- Confirmar commit, entorno y configuración de destino. No cambiar políticas de INDARI para hacer pasar el caso.
- PR sin schema: confirmar que el pipeline no incorporará migraciones ajenas no revisadas. El hook `vercel-migrate-if-needed.mjs` ejecuta migraciones solo con `VERCEL=1`; `ci:prisma`/build lo invocan. No usar un build de despliegue como prueba inocua contra producción.
- PR con schema: resolver P-IND-01, ensayar migración en rama aislada, evaluar locks/backfill, preparar recuperación Neon y compatibilidad con versión anterior; aplicar en **production** para portal y verificar `_prisma_migrations`. No basta migrar `dev`.
- No borrar columnas ni migraciones aplicadas para rollback. Priorizar volver al código anterior compatible y, si corresponde, corrección hacia adelante. Una reversión de código no revierte documentos emitidos ni movimientos financieros.

**Cierre:** comprobar criterio de aceptación en la versión publicada, seguir errores con las herramientas existentes y revisar incidencias de compras/AP. Comunicar a INDARI qué cambió, dónde está disponible y qué acciones aún requieren sus comprobantes. El informe al cliente se actualiza por entrega sin prometer una fecha no estimada.

## 9. Reutilización y costo de trabajo

- Skill disponible y aplicada a la planificación: `.agents/skills/operational-help-docs/SKILL.md` (también existe versión en `.cursor/skills/`). Reutilizar su checklist, sin duplicar un sistema de documentación.
- En las carpetas locales `.agents` y `.cursor` inspeccionadas no se identificaron agentes especializados configurados para esta auditoría. No se crearon agentes ni dependencias nuevas.
- Reutilizar la evidencia de los 26 casos, servicios de compras/AP, helpers monetarios, idempotencia, guards, fixtures y runner `node:test` existentes. Evitar otra auditoría integral en cada PR: leer el módulo y ejecutar las pruebas que cubren el cambio.
- Playwright ya existe; el E2E actual de Tesorería es mínimo y el job depende de secrets. No tomar una suite omitida como comprobación de compras. La prueba de concurrencia con DB real es un requisito particular de PR-04.
- Revisión funcional y de seguridad enfocada en PR-04 y eventuales cambios multi-OC/anticipos; no distribuir cada ajuste de etiqueta entre varios agentes.

## 10. Estado y próximos entregables

Este apartado conserva el corte inicial del plan. Estado actualizado de entrega y controles: §16.

- **Completado:** arquitectura/modelo, Prisma, 69 migraciones ensayadas en DB aislada, comparación estructural sin diferencias, fixtures, 67 pruebas unitarias aprobadas y fichas privadas de conciliación actualizadas. Ver informe de fase 0.
- **Fase 1 y pendientes técnicos en código:** selección parcial, importes/mensajes, precisión decimal, conservación de importes y concurrencia de borradores automáticos; ver §12. Integración de adjudicación/AP verificada en DB aislada. Publicación pendiente: alias Vercel (P-IND-03) y smoke UI.
- **Diagnóstico actualizado:** P-IND-04 corregido; OC-051 requiere justificación por falta de referencia, según mensaje aportado y verificación de solo lectura (§12). B01 mantiene conciliación histórica pendiente: no hay resolución de datos ni diagnóstico único de las duplicaciones. P-IND-01 queda verificado estructuralmente con salvedad de procedencia.
- **Pendiente de decisión:** Q-061, Q-062 y Q-063. Q-064 aprobada como D-118; seguimiento en §15.
- **No ejecutado:** migraciones de producción, deploy ni modificaciones de registros de INDARI. Solo se migró la DB de ensayo en fase 0. Los cambios de aplicación de fase 1 están preparados localmente.

## 11. Implementación acotada de fase 1 — 21/10/2026

El usuario indicó conservar los pendientes para resolver después y continuar fase 1. Se implementó el alcance confirmado sin modificar esquema, reglas financieras, permisos, umbrales ni el timeout del servicio. Los identificadores PR-01/02/03 son bloques del plan; no se creó ni publicó un PR en esta intervención.

### B02 — Selección parcial

- La matriz permite elegir solo algunas líneas y **Dejar pendiente** una selección. **Generar órdenes seleccionadas** exige al menos una y muestra el contador de ítems seleccionados.
- En celular se ofrece un selector por ítem con proveedor/importe. Comparte selección y construcción del payload con escritorio; no usa otro servicio ni otra regla de adjudicación.
- `purchase-request-award-selection.ts` agrupa las líneas seleccionadas por cotización. Ignora selecciones antiguas de líneas ya adjudicadas o ajenas al conjunto actual; rechaza cotizaciones no disponibles o sin el renglón. El servicio conserva sus controles de permisos, vigencia, mínimo de ofertas, locking y atomicidad.
- El atajo **Adjudicar libres → OC** conserva su comportamiento: todos los ítems libres de esa cotización.
- **Pendiente de validación integral:** P-IND-04 no se corrigió por indicación del usuario. La prueba live fallida de fase 0 permanece sin ocultarse; faltan adjudicación exitosa, concurrencia/anulación y recorrido UI. Las pruebas del payload no reemplazan esas comprobaciones.

### B03 — Lectura de precios e impuestos

- El formulario diferencia **Precio unitario neto (sin IVA)** y **Precio unitario con IVA**, explica cómo se interpreta el número y muestra cantidad × unitario, descuento, neto con descuento, IVA y total de línea.
- Se conserva el modo neto al reabrir valores persistidos y su advertencia existente: no activar IVA incluido sin reingresar valores finales. No se modificaron normalización, payload monetario ni fórmulas.
- Matriz y listados diferencian total de línea con IVA **sin IIBB** del total de cotización **con impuestos**. En escritorio y celular se informa el importe IIBB ya persistido; no se recalcula en la vista.

### B04 — Causas y procedencia

- **Justificación pendiente en** reemplaza el aviso que llamaba «desvío» a todos los casos. La falta de referencia dice que no permite calcular el desvío; unidad distinta y partida global tienen mensajes propios. Se conserva el campo **Justificación desvío** y las condiciones que lo exigen.
- La cabecera de OC identifica el proveedor y ofrece **Ver solicitud de origen** usando la relación existente, sin inferirla de notas ni agregar consultas Prisma en web.
- Los controles y mensajes de falta de permiso del servicio siguen vigentes. No se modificó la sugerencia/clasificación histórica de SC-073 ni se declaró resuelto OC-051: requieren validación comercial/reproducción, respectivamente.

### Verificación y documentación

- **76 pruebas aprobadas:** 7 nuevas de selección parcial y limpieza de selección, 15 de integridad/búsqueda de ayuda y 54 existentes de dinero, descuento, impuestos, baseline, permisos y políticas. Incluyen guardar un precio con IVA y volver a procesar su neto persistido sin duplicar IVA.
- Typecheck de `@bloqer/web` y `@bloqer/services`: correcto. ESLint dirigido a los archivos modificados: correcto. `git diff --check`: correcto.
- Guía operativa §9.1/9.2, artículos de ayuda y keywords actualizados. Índice documental AI regenerado y verificado: 483 chunks. Sin cambios de tools, permisos ni system policy de AI; su significado no cambió. No se ejecutaron evals con proveedor externo.
- El primer intento de pruebas web no encontró `tsx` en ese paquete; se ejecutaron correctamente con el runner ya instalado en `packages/services`, sin instalar dependencias.
- [Smoke de fase 1](./DEPLOYMENT_SMOKE_TEST.md#regresión-indari--fase-1-pendiente-de-ejecutar) documentado, aún no ejecutado. No se abrió navegador local ni se desplegó para probar; no se presenta el layout móvil como verificado visualmente.

Para repetir las pruebas de selección/ayuda desde `apps/web`: `node --import ../../packages/services/node_modules/tsx/dist/loader.mjs --test features/procurement/lib/purchase-request-award-selection.test.ts features/help/lib/catalog.test.ts features/help/lib/catalog-integrity.test.ts`. Usar la configuración de lint de web para sus componentes. Para el índice: `pnpm ai:index-docs` y `pnpm ai:check-docs-index`.

**Próximo paso:** retomar los controles diferidos antes de publicar B02. B03 y los textos de B04 pueden revisarse por separado según los bloques del plan. B01 y las decisiones Q-061 a Q-064 permanecen fuera de esta entrega.

## 12. Cierre de pendientes y decimales — 21/10/2026

El usuario reabrió los pendientes antes de seguir fase 2. Esta sección actualiza el estado de §11 y conserva el registro anterior como historial.

- **Adjudicación:** optimizadas escrituras y lecturas dentro de la transacción, con timeout acotado de 30 s por operación. Pasaron parcialidad, permisos, otro tenant, rollback de lote inválido, carrera por una misma línea, anulación/readjudicación y lote de dos proveedores.
- **Decimales:** D-117 aprobado expresamente por el Owner. Se separa precisión editable de display; SC, cotizaciones, OC y líneas de facturas permiten 4 dp donde corresponde. Enviar/desenfocar sin editar no reescribe el valor mostrado a 2 dp. Dinero sigue 2 dp half-up, FX 6.
- **IVA incluido:** corregido caso sin descuento ($10,00 ya no pasa a $9,99; 333 × $10,00 conserva $3.330,00). Con descuento sigue D-093. Ediciones sin cambios monetarios conservan los componentes originales, tomados de la DB del propio documento. Se rechazan IDs de línea ajenos/duplicados; los totales enviados por el navegador no son fuente de persistencia.
- **P-IND-02:** se anticipó la reproducción prevista para B01; carrera panel OC/recepción confirmada como error de numeración, sin atribuirle la causa histórica. Se integró bloqueo de OC y cálculo/creación/refresco en una transacción para los dos disparadores automáticos. No se impone una factura por OC ni se asocian documentos legacy por notas.
- **OC-051 / SC-085:** el usuario aportó el mensaje exacto de falta de referencia. La lectura de producción confirmó OC en borrador, referencia y justificación vacías, sin porcentaje de desvío calculado. El presupuesto adjunto coincide con el total registrado y ya incluye el descuento comercial. Su vigencia de 48 horas está vencida al revisar el caso; INDARI debe reconfirmar condiciones con el proveedor si la compra sigue pendiente. Preparar justificación factual de compra global respaldada por la cotización, sin declarar precio aprobado ni «resuelto por el sistema». La mejora de texto explica la causa y conserva el control. No se editó ni envió la OC. Evidencia y texto propuesto permanecen en el expediente privado.
- **Prisma/ERD:** no se agregaron modelos, columnas ni migraciones. Solo se transmite el ID de línea ya existente para reconocer ediciones; no es un nuevo dato persistido.
- **Validación final:** 13 casos distintos de integración aprobados en DB aislada (12 en la suite completa y el escenario nuevo de segunda recepción/anulación en una ejecución dirigida de 2). Suite general: 1.208 pruebas en 6 paquetes aprobadas; typecheck: 13 paquetes aprobados. Lint general aprobado con advertencias preexistentes; lint dirigido de cambios sin errores. El ensayo previo P-IND-02 falló por P2002; la regresión corregida devuelve el mismo borrador en ambos disparadores.
- **Entrega:** rama de revisión con pruebas, guía/ayuda e índice AI. Falta verificar alias Vercel y smoke UI antes de producción; no hubo mutaciones sobre Casa Hogar. Regularización fiscal/bancaria y decisiones Q-061 a Q-064 conservan sus requisitos de evidencia/definición.
- **Informe INDARI:** se prepara al final de la implementación y verificación de publicación, diferenciando corregido/disponible de pendiente. No se anuncia como disponible una corrección solo local.

## 13. Fase 2 — Integridad AP y trazabilidad (21/10/2026)

Alcance B01 / PR-04. La exclusión concurrente de panel OC/recepción ya se entregó en `399128cf`; esta continuación cubre edición/emisión, aislamiento y documentos manuales/fiscales. La evidencia de reproducción usa exclusivamente fixtures y servicios sobre la DB aislada.

- **D-066:** reproducción confirmó que una petición de edición podía quitar el vínculo de línea de un borrador automático. Se exige conservar vínculos explícitos al crear/editar/emitir documentos identificados como automáticos. Un borrador histórico sin vínculo requiere revisión antes de emitir. No se infiere ninguna relación por descripción, importe o notas.
- **Empresa y obra:** reproducción confirmó lectura de billing desde una empresa activa distinta y edición AP sin control de empresa. Se reutilizan `isCrossCompany` y `requireProjectAccess`; resumen, preview, listados, avisos y enlace OC respetan la empresa y la membresía de obra. La anulación también comprueba acceso a la obra, sin imponer estado ACTIVE para cancelar.
- **Carga manual:** conserva sus líneas sin vínculo obligatorio a ítem OC, según D-066. El panel y detalle avisan de cobertura por cantidad incompleta cuando falta el vínculo; importes siguen incluidos. Es información para revisar, no un detector fiscal de duplicados ni un bloqueo nuevo.
- **Creación manual AP:** en integración se reprodujo cierre de transacción antes de completar la auditoría con el límite por defecto de 5 s. Se acota creación a 30 s/espera 10 s, igual que el flujo automático; auditoría, líneas y cabecera siguen atómicas. No se cambian tiempos globales ni se eliminan controles.
- **Modelo:** no cambia Prisma, ERD, cardinalidad, estados ni fórmulas. `unlinkedInvoiceCount` es un dato derivado del resumen, no una columna. NC/ND mantienen D-115 y no representan devolución física ni caja.
- **Pruebas:** los 6 escenarios de `ap/supplier-invoice-integrity.live.test.ts` pasaron en DB aislada. Incluyen rechazo de pérdida de vínculo en edición y emisión (sin crear CxP), rechazo por tenant/empresa/proyecto, emisión única, carga manual, NC/ND sin caja ni devolución física y variación exacta del devengado (-48,40 por NC 60,50 + ND 12,10; +12,10 neto tras anular la NC). Suite general 1.208 pruebas, typecheck de 13 paquetes y lint aprobados (warnings preexistentes). Índice AI: 484 chunks verificados. Regresión final dirigida: 3 casos aprobados (membresía/anulación y los 2 escenarios de concurrencia/segunda recepción de la suite anterior). Son 8 escenarios distintos validados en esta fase; no una única ejecución de 8.
- **Documentación/AI:** guía §9.2 y ayuda «Factura desde OC» explican el aviso y el control. Regenerar/verificar knowledge; no cambia contrato de tools AI ni permisos nuevos.
- **Límites:** continúa pendiente la publicación y smoke UI de P-IND-03. No se editan documentos históricos de INDARI; regularización exige comprobantes y decisión exacta de qué conservar/anular. Q-061 a Q-064 corresponden a fase 3, no quedan aprobadas por esta implementación.

## 14. Preparación de fase 3 — propuesta pendiente de decisión (21/10/2026)

El usuario solicitó continuar la fase 3. Se revisaron los puntos de entrada de compras/AP, los vínculos Prisma y ADR-013, y se solicitaron las definiciones de Q-061 a Q-064. Esta sección registra la **propuesta inicial**. Después el Owner aprobó Q-064 y el campo opcional, con preservación de procesados (D-118, §15). Q-061/062/063 siguen sin decisión; no son funcionalidad disponible.

### Secuencia propuesta

1. Resolver Q-064 y entregar B08 como cambio independiente: representación explícita de oferta por ítem, comparación y adjudicación.
2. Resolver el alcance de Q-062 y aprobar el ADR de B06 antes de implementar la factura multi-OC.
3. Para Q-061, separar los casos históricos que tienen procedimiento vigente de los que requieren una excepción nueva. La conciliación documental puede avanzar independientemente de B08/B06.
4. Definir si B07 entra en esta entrega. Si entra, completar ADR-013 con aplicación, devolución, cancelación y contabilidad antes de crear entidades o migraciones.

Cada bloque requiere sus propias pruebas y cierre; aprobar uno no aprueba los demás. Fases 1 y 2 están publicadas en la rama de revisión (`399128cf` y `b3d178cb`), sin confirmar disponibilidad en el portal de producción.

### B08 — Propuesta y puntos comprobados

Propuesta consultada: distinguir «Cotizado», «No cotizado» y «Bonificado». Una línea no cotizada no se adjudica ni aporta al mínimo exigido para ese ítem; una bonificación exige selección explícita. No reinterpretar automáticamente los ceros históricos. La forma persistida y su compatibilidad con registros anteriores se definirán después de acordar la regla.

Hallazgos que el diseño debe resolver:

- `procurement-quote.service.ts` exige actualmente una línea por cada ítem de la SC y al menos un **precio unitario** positivo. Esto no equivale a exigir **total final positivo**: un descuento del 100 % puede producir cero. La propuesta de total positivo es una restricción a aprobar, no una regla ya verificada del sistema.
- `purchase-request-to-po.service.ts` cuenta cotizaciones `RECEIVED`/`SELECTED` por SC, tanto en adjudicación individual como en lote. El conteo actual no distingue cobertura del ítem ni filtra vigencia; la oferta seleccionada sí se valida por vencimiento. El diseño debe explicitar ambos criterios y aplicar la misma regla en ambos caminos.
- Deben conservarse congelamiento de ofertas usadas por OC activas, exclusión concurrente por SC, atomicidad del lote y conservación de importes D-117.

Pruebas previstas: ítem omitido no seleccionable ni adjudicable por petición directa; bonificación explícita; mínimo distinto entre ítems de una misma SC; entradas histórica/nueva; cotización vencida; lote mixto con rollback; reintento concurrente; edición sin alteración monetaria. Actualizar formulario, matriz de escritorio/celular, guía, ayuda y conocimiento AI en la misma entrega.

### B06 — Propuesta y límites del diseño

Primera versión consultada: una factura para OC del mismo tenant, empresa, obra, proveedor y moneda; cada renglón vinculado a un único ítem OC; una sola CxP y sus pagos. No contempla mezclar obras ni dividir un renglón entre varios ítems en esta propuesta.

Prisma ya contiene `SupplierInvoiceLine.purchaseOrderLineId`, pero cabecera, validaciones y consumidores asumen una única `SupplierInvoice.purchaseOrderId`. Por eso no alcanza con permitir más IDs en el formulario ni con quitar un guard. El ADR debe decidir la representación de la relación y su convivencia con facturas de una OC, manuales, automáticas y NC/ND.

Antes de implementar: inventariar lecturas por cabecera, definir imputación de impuestos/percepciones y pagos en resúmenes por OC, cobertura por recepción, tratamiento de borradores y notas fiscales, así como bloqueos de las OC involucradas en orden estable. No elegir una «OC principal» arbitraria ni sumar el total completo de la factura en cada OC. Toda distribución monetaria nueva requiere regla aprobada y conciliación exacta, incluyendo centavos residuales.

Pruebas previstas: dos OC con recepciones parciales, factura única y CxP única; rechazo de alcance incompatible; concurrencia con generación automática; conservación de importes; NC/ND y anulaciones; resumen por OC, deuda y devengado sin duplicaciones. Ensayar cualquier migración en la DB aislada antes de producción, con compatibilidad y recuperación documentadas.

### B05 — Revisión operativa posible con el circuito vigente

- **Compra pendiente y oferta vencida:** solicitar reconfirmación real de precio y condiciones al proveedor. Registrar la documentación mediante el circuito permitido por el estado actual; no adjudicar una oferta vencida ni cambiar su vigencia solo para superar el control.
- **Compra ya realizada o pagada:** conciliar factura, comprobantes de pago, recepción real y registros existentes antes de cargar nada. La factura manual y el pago parcial existentes pueden servir cuando hay documentos reales y no están ya registrados; no constituyen autorización para duplicar deuda, caja o costo.
- **Unidad errónea con documentos posteriores:** identificar la cadena SC/cotización/OC/recepción/factura/pago y acreditar la unidad correcta. No asumir equivalencias barras/kg ni reabrir la SC sorteando BR-PUR-025. Definir la secuencia admitida por los estados concretos; si no existe, mantener el caso pendiente de diseño excepcional.

Resultado por caso: evidencia, documento a conservar, operación soportada, efecto esperado y condición que falta. Ningún cambio histórico se ejecuta por esta propuesta; continúa pendiente la conciliación fiscal/bancaria de los pares identificados en la auditoría privada.

### B07 — Definiciones requeridas para completar ADR-013

El validador y el servicio stub no implementan la cuenta puente. Además de la prioridad, hacen falta decisiones sobre aplicación manual o automática, alcance proveedor/empresa/obra/moneda, saldo sin aplicar, devolución parcial, anulación de aplicación y de anticipo, cierre de períodos y asientos. El diseño debe incluir idempotencia del desembolso y de la aplicación, permisos y trazabilidad; el validador de proveedor actual no tiene la clave de idempotencia que sí tiene el anticipo de cliente.

Con factura real, revisar el circuito existente de factura/pago parcial sin reducir ficticiamente la cotización ni registrar recepción inexistente. Sin factura, no reutilizar `Payment` sin `Payable`. Las decisiones financieras y el modelo del puente siguen pendientes: la referencia histórica a «Fase 2» en ADR/stub no significa que estén implementados en la fase 2 del plan INDARI.

## 15. Fase 3 — B08 aprobado e implementación de D-118 (21/10/2026)

El Owner aprobó Cotizado/No cotizado/Bonificado y luego el campo opcional, preservando documentos procesados y exigiendo revisión de ceros pendientes. Los otros bloques de fase 3 no quedan aprobados por estas respuestas.

- **Datos históricos:** consulta de producción exclusivamente de lectura: 88 cotizaciones, 191 renglones, ningún total de cotización cero; 33 renglones de oferta con total cero. De ellos, 32 corresponden a ítems SC ya adjudicados (incluye ofertas descartadas, no significa 32 líneas de OC a cero). Solo un cero está pendiente: SC-097, cotización recibida sin OC activa, editable por el flujo vigente. No se modificó ningún registro del cliente.
- **Modelo:** enum `QuoteLineOfferKind`, campo nullable `ProcurementQuoteLine.offerKind`, sin default/backfill. Los históricos quedan null. Migración `20261021180000_quote_line_offer_kind` aplicada únicamente en `bloqer_indari_phase0_20261021`; la DB aislada tiene ahora 70 migraciones. Producción todavía no migrada.
- **Carga/edición:** validación financiera en services, con el cálculo decimal y conservación D-117. Cotizado requiere total de línea positivo; No cotizado exige precio/descuento/importes cero; Bonificado requiere importe cero explícito. Total de cotización positivo. No se permite borrar una clasificación explícita. Auditoría existente registra clasificación anterior/nueva por ítem, sin crear eventos nuevos. Se corrigió el formulario de edición para conservar la moneda original en vez de enviar siempre ARS.
- **Adjudicación:** se cuenta oferta por ítem en ambas entradas, individual/lote. No cotizado y cero histórico sin clasificar no aportan al mínimo ni se adjudican. Se conservan estados y vigencia existentes. El atajo toma solo cotizados positivos y vuelve a exigir esa condición dentro de la transacción; bonificados requieren selección en matriz. Escritorio y celular muestran la clasificación y deshabilitan opciones no adjudicables.
- **Concurrencia:** carga/edición/eliminación de cotizaciones comparten el bloqueo SC con adjudicación; edición y eliminación revalidan el congelamiento dentro de la transacción. La prueba reprodujo expiración a 5 s mientras la edición esperaba una adjudicación; se adoptó el límite local 30 s/espera 10 s del flujo de adjudicación. El test exige rechazo funcional, no acepta un timeout como victoria.
- **Históricos procesados:** no se agrega el control nuevo al validar una OC existente; importes/FK/adjudicación quedan intactos. Una anulación seguida de nueva adjudicación sí debe cumplir D-118. Una oferta aún usada por otra OC permanece congelada; no se desbloquea para clasificar un cero pendiente.
- **Documentación:** decisiones, preguntas, reglas, módulo, estados, ERD, guía §9.1, ayuda y smoke actualizados. Índice AI regenerado; sin nuevos tools AI ni dependencia npm.
- **Validación B08:** los 6 escenarios de integración pasaron juntos en DB aislada (180,8 s), incluyendo preservación de OC histórica, bloqueo de readjudicación de cero sin clasificar, mínimo por ítem, rollback, atajo y edición concurrente. La primera ejecución reprodujo timeout de edición; además se corrigieron firma/aserción del test de anulación, sin relajar el control del producto. Regresión anterior: 7 casos de adjudicación/permisos/decimales aprobados en ejecución separada (112,0 s). Suite general final: 1.209 pruebas aprobadas en 6 paquetes. Tipos de 13 paquetes y lint correctos (warnings generales preexistentes); UI/ayuda: 23 pruebas y nueva comprobación de las 8 de selección tras ajustar la etiqueta histórica. Índice AI: 487 chunks verificados. Smoke visual y despliegue no ejecutados.
- **Publicación:** este bloque agrega la primera migración de la intervención. Antes de push/deploy, verificar el destino Vercel/Neon y recuperación: el build migra automáticamente su DB, incluso en preview. P-IND-03 sigue pendiente; no anunciar la funcionalidad en portal ni emitir el informe final de correcciones disponibles todavía. El procedimiento de recuperación contempla que el código viejo desconoce No cotizado/Bonificado.

## 16. Fase 4 — Revisión final y preparación de entrega (21/10/2026)

Alcance: cambios INDARI de fases 1/2 y B08 de fase 3, junto con la migración aditiva D-118. No constituye auditoría exhaustiva de todos los módulos. Q-061/062/063 siguen pendientes; la solicitud de fase 4 no aprueba esas reglas ni autoriza regularizar datos históricos sin comprobantes.

### Hallazgos y correcciones

- **Crítico — Preview compartía conexiones con Production:** Vercel tenía `DATABASE_URL` y `DIRECT_URL` asignadas conjuntamente a ambos entornos. Como el build aplica migraciones, un push de revisión podía afectar la misma DB del portal. El Owner autorizó configurar ambas variables como secretos exclusivos de Preview para `codex/indari-pendientes-decimales`, apuntando a `bloqer_indari_phase0_20261021` en el compute dev. Vercel confirmó el guardado; Production no se editó. El aislamiento rige para el próximo despliegue de esa rama, no retroactivamente para previews anteriores. **Pendiente global:** otras ramas todavía heredan las variables compartidas; no extender a ellas esta verificación.
- **Configuración de acceso pendiente:** el smoke del preview publicado redirigió a `portal.bloqer.app/login` antes de ingresar credenciales. `AUTH_URL`, `APP_URL` y `NEXT_PUBLIC_APP_URL` heredan el alcance general; se propuso su override exclusivo para la rama, usando la URL estable del preview. También se verificó `AUTH_SECRET` compartido; se solicitó al Owner cargar una clave distinta exclusivamente para esa rama. No rotar la clave general ni declarar aisladas las sesiones mientras falte este control.
- **Medio — proveedor duplicado por concurrencia:** dos cargas simultáneas de cotización del mismo proveedor podían superar el control previo y persistir ambas. Además de duplicar la oferta, podía inflarse el conteo del mínimo para adjudicar. La prueba en DB aislada reprodujo dos altas exitosas donde debía aceptarse una. El conteo de proveedor se realiza ahora dentro de la transacción, después del bloqueo SC compartido con adjudicación. No agrega una regla nueva ni un índice/migración; cumple la unicidad operativa ya documentada.
- **Medio — máximo de cotizaciones por concurrencia:** dos proveedores podían ocupar simultáneamente el último cupo. Se reprodujo máximo 1 con dos altas exitosas. El máximo y los settings se consultan dentro de la misma transacción/bloqueo, de modo que la segunda operación observa el cupo consumido y devuelve el conflicto funcional existente. No se cambian los límites configurados del cliente.
- **Leve — instrucciones de smoke desactualizadas:** el checklist de fase 1 todavía describía el atajo anterior que incluía todos los ítems libres. Se actualizó al alcance vigente D-118: solo cotizados positivos; bonificados por selección expresa. Se agregaron los dos escenarios concurrentes al checklist.

### Verificación y situación de publicación

- Consulta de producción estrictamente de lectura: INDARI no tiene grupos de cotizaciones activas duplicadas por SC/proveedor. La migración `20261021180000_quote_line_offer_kind` todavía no figura aplicada. No se escribieron datos de Casa Hogar.
- Reproducción previa: los dos tests nuevos fallaron por aceptar dos altas, no por timeout. Evidencia privada `phase4-quote-race-before.txt`. Suite ampliada: **8/8 casos aprobados** juntos en DB aislada (255,4 s), evidencia `phase4-offers-verified.txt`. Se completó el descuento explícito cero exigido por el tipo de los fixtures; la semántica ejecutada sigue siendo descuento cero.
- Suite general: 1.209 pruebas aprobadas en seis paquetes; tipos aprobados en 13 paquetes. Lint general aprobado con warnings preexistentes; lint dirigido de los dos archivos modificados sin errores. Índice AI vigente: 487 chunks, hash `40a375f5eb08…`; no cambia el flujo visible ni el contrato AI en esta corrección.
- Vercel confirmó estado `success` para `b3d178cb` (fase 2). Es el resultado de ese despliegue, no evidencia de que `portal.bloqer.app` sirva esa versión.
- **P-IND-03 parcialmente resuelto:** tras iniciar sesión, Vercel confirmó `portal.bloqer.app` en Production, deployment `G2wxsALbkwt2mWCeriW6SB9HjmGS`, SHA `527c824c9ad9009b0d9cf2d729a184dc5f2e31f9`. El próximo preview de esta rama tiene conexiones aisladas autorizadas y verificadas. Las variables Production son secretos no revelables; no se rotaron ni sustituyeron.
- **Commit y push realizados:** `08b13fdf74ebaf633a7a0656e2226e0a69305cdd`, [PR #1](https://github.com/simonbravin/bloqer-v2/pull/1) en borrador. CI del PR `39678103739`: calidad aprobada; E2E omitido por falta de secretos, no cuenta como prueba aprobada. Vercel `2hgZMKfecuV7KNeLwk1zWEbAHvsV` exitoso; su build confirma `VERCEL_ENV=preview`, DB `bloqer_indari_phase0_20261021`, 70 migraciones sin pendientes. URL inmutable: `https://bloqer-v2-8tluds7i4-simons-projects-6be5b5cc.vercel.app`.
- **Smoke UI no aprobado:** el primer acceso redirige a producción por la configuración anterior. Se detuvo antes de introducir credenciales. La base de pruebas tiene usuario sintético preparado con el seed existente; no usar cuentas/documentos de INDARI para completar este recorrido.
- Pendientes de entrega: separar URL y clave de sesión del preview y repetir smoke; acreditar recuperación Neon (consola pendiente de inicio de sesión), migración/publicación de producción y smoke posterior. El informe final a INDARI se emite después de confirmar qué correcciones están disponibles; no confundir código/preview aprobados con publicación en portal.

## 17. Publicación en producción y cierre de entrega (22/10/2026)

El Owner indicó continuar directamente en producción y posponer la configuración de acceso de Preview. Esta decisión sustituye los bloqueos de entrega de §16; las secciones anteriores conservan el historial de cada etapa. No autoriza regularizar documentos del cliente ni usar producción como destino de fixtures.

- **Publicación confirmada:** PR #1 integrado en `main`, SHA `1d07699af55256478fc73009a36a15b4cbe4e00e`. Vercel `9SKYgHtUNWHcZs6z7trTLGXaWwqU`, Production, Ready el 22/10 a las 00:01 ART, con alias `portal.bloqer.app`. El despliegue se construyó desde main con configuración Production; no se promovió el preview aislado.
- **Migración aplicada:** `20261021180000_quote_line_offer_kind` mediante Prisma migrate deploy en Neon production (`ep-cold-mouse-appkpn84`, `neondb`). 70 migraciones y ninguna fallida. Enum QUOTED/NOT_QUOTED/BONIFIED; columna nullable, sin default.
- **Preservación comprobada:** comparación completa antes/después de los 191 renglones de cotización: todos los campos previos idénticos y las 191 clasificaciones nuevas null. No hubo backfill, cambio de importes ni de vínculos. No se corrigieron compras, facturas, pagos ni justificativos históricos.
- **Recuperación:** consola Neon autenticada confirmó ventana de recuperación de 6 horas. Punto previo registrado: 22/10/2026 02:53:27.694 UTC (21/10 23:53 ART). Evidencia privada de esquema, filas antes/después y salida de migración; no contiene credenciales.
- **Smoke publicado parcial:** login Google con la cuenta existente correcto; sesión, dashboard y consola de organizaciones funcionan. La cuenta de plataforma no tiene contexto operativo de tenant: el acceso a OC-051 redirige al dashboard. No se agregaron membresías ni se suplantaron usuarios. Queda pendiente recorrer formularios/matriz/AP en escritorio y celular con una cuenta operativa autorizada. No se declara E2E completo; CI omite E2E por secretos ausentes. Las pruebas automatizadas e integración aislada de §12–16 permanecen aprobadas.
- **Informe al cliente:** preparado y revisado visualmente en dos páginas; separa mejoras publicadas, acciones de INDARI y alcance aún no implementado. No enviado por correo. Incluye conciliación prioritaria de posibles duplicados y validación de comprobantes, sin afirmar doble pago bancario.
- **Pendientes explícitos:** Q-061/062/063, regularización histórica con evidencia, smoke operativo y separación completa de Preview. Los overrides de DB aprobados para esta rama se conservan; no se cambiaron las URLs ni AUTH_SECRET. No usar otras ramas Preview para ensayar migraciones mientras hereden la DB general.

## Referencias canónicas

- [Solicitudes y cotizaciones](../02-modules/PURCHASE_REQUESTS.md), [OC y recepciones](../02-modules/PURCHASE_ORDERS_AND_RECEIPTS.md), [Gastos y pagos](../02-modules/EXPENSES_AND_PAYMENTS.md).
- [ERD funcional](../01-domain/ENTITY_RELATIONSHIPS.md), [ERD técnico](./TECHNICAL_ERD.md), [service layer](./SERVICE_LAYER.md), [alcance tenant/empresa](./TENANT_COMPANY_SCOPING.md).
- [Dinero](../03-finance/MONEY_MODEL.md), [decisiones](../00-product/DECISION_LOG.md), [ADR-013](./ARCHITECTURE_DECISION_RECORDS.md#adr-013--anticipos-a-proveedor-cuenta-puente-fase-2).
- [Migraciones](./MIGRATION_STRATEGY.md), [pruebas](./TESTING_STRATEGY.md), [pendientes técnicos](./PENDING_ARCHITECTURE_ITEMS.md), [preguntas de producto](../00-product/OPEN_QUESTIONS.md).
