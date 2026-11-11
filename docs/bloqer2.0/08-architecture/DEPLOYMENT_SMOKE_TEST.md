# Post-deploy smoke test — Bloqer 2.0 (Phase 10D)

Run after first production (or staging) deploy, **before** announcing availability. Adapt steps if a feature is intentionally disabled in that environment.

**Prereqs:** migrations applied (`prisma migrate deploy`), env vars set per [`ENVIRONMENT_VARIABLES.md`](./ENVIRONMENT_VARIABLES.md), at least one user can sign in.

**Related:** for role-based training / UAT after UI freeze, use [`OPERATIONAL_SMOKE_CHECKLIST_BY_ROLE.md`](./OPERATIONAL_SMOKE_CHECKLIST_BY_ROLE.md) (J-02). This file stays focused on post-deploy technical checks.

## Regresión INDARI — fase 1 (pendiente de ejecutar)

No anunciar B02 como disponible hasta resolver P-IND-04 y acreditar el alias del portal (P-IND-03). Preparar los casos mutantes con fixtures sintéticos en un entorno de prueba autorizado; no usar los registros de Casa Hogar. Antes del deploy, verificar integración de adjudicación, concurrencia y anulación. Después del deploy autorizado, comprobar la versión publicada y el recorrido con datos de prueba acordados.

1. Escritorio y celular: SC enviada con dos líneas completas y cotizaciones vigentes. Seleccionar una; contador 1 de 2; **Generar órdenes seleccionadas** incluye solo esa línea y la otra queda libre. **Dejar pendiente** desmarca; con ninguna selección el botón queda deshabilitado. En celular comprobar selector y textos sin desborde a 360 px; en escritorio, matriz y teclado.
2. Seleccionar dos proveedores para dos líneas; verificar una OC por grupo. Doble envío no duplica adjudicación. Anular una OC deja libre solo su línea; la otra sigue vinculada. La cobertura de SC respeta BR-PUR-024. Con D-118, el atajo **Adjudicar cotizados → OC** toma solo ítems libres cotizados con importe positivo; los bonificados requieren selección expresa en la matriz.
3. Cotización: cantidad 2, unitario final 121 con IVA 21 %, descuento 10 % e IIBB 3 %. Neto 180,00; IVA 37,80; IIBB 5,40; total 223,20. Guardar y reabrir en modo neto conserva el resultado; no marcar de nuevo IVA incluido sin reingresar valores finales. La línea muestra 217,80 sin IIBB y la cotización 223,20 con IIBB. Verificar también IVA 0 legítimo con una cotización de prueba.
4. OC borrador: probar referencia ausente, unidad distinta, partida global y precio sobre referencia. Verificar mensajes por causa y acceso a **Editar → Justificación desvío**, conservando umbrales y permisos. Partida global no se compara como precio unitario. Revisar código/proveedor y **Ver solicitud de origen**; una OC directa no muestra un origen ficticio.
5. Consultar ayuda por «adjudicar algunos ítems», «precio con IVA» y «sin referencia presupuestaria»; verificar que guía, ayuda y respuestas documentales AI describan el mismo flujo. No usar estos checks para declarar resueltos OC-051 ni los datos históricos.

## Regresión de planificación y costos — AG-05

Aplicar después de publicar una revisión que incluya AG-05; la publicación de AG-00–04 no contiene esas correcciones posteriores. Antes, ejecutar las [suites aisladas mantenidas](./TESTING_STRATEGY.md#regresión-reutilizable-de-planificación-y-costos--ag-05). Los casos mutantes usan datos sintéticos autorizados; no alterar obras reales para demostrar el smoke.

1. Una obra sin presupuesto aprobado permite planificar tareas independientes, consultar las vistas y exportar fechas sin moneda/costo ficticios. Con presupuesto, importar una partida sin fechas conserva las tareas independientes. Una falla económica funcional no debe eliminar el cronograma temporal.
2. En escritorio comprobar Gantt, calendario, Kanban y tabla; en Field, filtros, búsqueda/limpieza y detalle a 390 px. Una barra corta mantiene el avance en el tooltip sin cortar sus dígitos. Errores de guardado conservan los campos; el envío pendiente no admite doble acción/cierre prematuro.
3. Materiales y recursos muestran unidades por fila y moneda ISO del presupuesto. Los KPI de cantidades heterogéneas son conteos de filas; la adjudicación parcial conserva las líneas libres de SC. No confundir cobertura con compromiso financiero.
4. EDT y costos: obra/presupuesto accesibles, fuentes permitidas, importes netos y período coherente en detalle y tabla; el detalle del período no presenta saldos globales. Una relación inconsistente devuelve un error funcional sin datos ajenos. CSV con moneda y cantidades no comparables vacías, nunca una conversión supuesta.
5. Con fixtures acordadas, verificar aprobación de parte y confirmación de recepción, refresh del cronograma y consumidores; repetir sus suites SQL de concurrencia antes de publicar, sin usar una prueba de UI como sustituto del rollback/lock.

Q-069/Q-070/Q-071 aprobadas en D-122/D-123/D-124: comprobar error funcional por moneda contribuyente distinta, cantidades de factura + ND − NC por recurso/unidad compatibles y costo/varianza de consumo **Sin valuación** cuando falta trazabilidad. UI/CSV/PDF conservan desconocido y advertencia; una ausencia comprobada admite cero. Exposición documental y cantidades siguen independientes. El cronograma temporal permanece disponible ante incompatibilidad económica y su exportación avisa sin importes ficticios. RFIs mantiene desarrollo posterior separado según D-122.

## Comprobaciones generales

| # | Check | Pass criteria |
|---|--------|----------------|
| 1 | App boots | Home/login loads without 500; no crash loop. |
| 2 | Login | Google (or configured provider) completes; session persists. |
| 3 | Tenant context | `/dashboard` loads with tenant; navigation shows expected modules for role. |
| 4 | Platform link | `/platform` link visible **only** for platform superadmin; other users never see it. |
| 5 | Directory | Create a **contact** (or open list + create) without error. |
| 6 | Projects | Create **project** or open existing; detail loads. |
| 7 | Budget / WBS | Open project **budget** or WBS route; page loads (create if product allows). |
| 8 | Documents | Upload flow: either R2 path works or **placeholder / disabled** behavior is clear and non-fatal. |
| 9 | Invitations | Create invitation (equipo); accept flow on `/invitaciones/aceptar` with matching email; membership appears. |
| 10 | Notifications | `/notificaciones` inbox loads; badge if applicable. |
| 11 | CSV export | Trigger a **CSV** report export from UI or `GET /api/reports/...` as documented; file downloads. |
| 12 | PDF export | Al menos **un reporte corporativo** (`GET /api/reports/finanzas/ar-aging.csv?format=pdf`) y **uno de proyecto** (`GET /api/reports/proyectos/{id}/ingresos-gastos.csv?format=pdf`) descargan PDF válido (`%PDF`); encabezado muestra tenant/empresa y pie paginación. |
| 13 | Email disabled | With Resend **off**, app still boots; invitation copy-link or transactional email skips gracefully. |
| 14 | Email enabled | With Resend **on** + public base URL, a test email sends (optional in staging). |
| 15 | Cron secret | `GET` or `POST` `/api/cron/operational-alerts` **without** `CRON_SECRET` (or too short) → **503** `cron_unconfigured`. |
| 16 | Cron wrong secret | Same route with wrong Bearer / `x-cron-secret` → **401** `unauthorized`. |
| 17 | Cron success | Same route with correct secret → **200** JSON with `ok`, `tenantsProcessed`, `totals` (`checkedCount`, `createdCount`, `skippedCount`, `errorCount`). |
| 17b | Cron schedule in Vercel | Project cron `0 12 * * *` (12:00 UTC) targets `/api/cron/operational-alerts`. Confirm deploy **root** is `apps/web` (or the effective `vercel.json` that Vercel resolves includes this `crons` entry). `CRON_SECRET` in Vercel env matches what the scheduled job sends (`Authorization: Bearer`). |
| 17c | Cron effect (optional staging) | With a test AR past due (OPEN/PARTIAL, balance &gt; 0): after a successful run, receivable `status` is `OVERDUE` and an in-app `RECEIVABLE_OVERDUE` exists for a VIEW AR / OWNER-ADMIN user — **or** `totals.skippedCount` increases if within the 7-day dedupe window. |
| 18 | Scheduled reports cron | `GET` or `POST` `/api/cron/scheduled-reports` without secret → **503**; wrong secret → **401**. |
| 19 | Scheduled reports run | With `CRON_SECRET`, route returns **200** JSON (`tenantsProcessed`, `totals.sent`, …). |
| 20 | Scheduled reports UI | OWNER/ADMIN: crear envío en `/configuracion/reportes`, **Ejecutar ahora**, ver fila en historial (`REPORT_SCHEDULED`). |
| 21 | Notifications inbox UX | `/notificaciones` paginates (20/page); `?page=` beyond range still shows last page (no empty false-negative). Severity badges in Spanish (Info / Éxito / Aviso / Error). |

Record who ran the checklist, date, and environment.

## Notas de crédito y débito de empresa — D-115

Ejecutar después de publicar el cambio, con comprobantes sintéticos en un entorno de prueba autorizado. No acredita una ejecución en el portal.

1. En Oficina, abrir **Finanzas → Comprobantes de venta** y **Facturas y gastos**, en escritorio y celular. **Nueva nota de crédito / Nueva nota de débito** permite buscar y seleccionar una **Factura de referencia** emitida sin proyecto. No ofrecer facturas de otra empresa/tenant, borradores, notas ni comprobantes de obra. Sin facturas elegibles, mostrar el estado vacío y el siguiente paso. **Ver comprobantes** desde CxC abre el listado de venta.
2. Sobre una factura con saldo 100, crear NC parcial de 30, revisar el borrador y emitir. El saldo queda en 70, sin cobranza/pago ni movimiento de caja. La NC figura en el listado por tipo y en **Notas vinculadas**, aunque no tenga CxC/CxP propia. Anular con motivo restaura el saldo a 100 y actualiza el detalle de la factura.
3. Crear ND desde la misma factura, editar el borrador a 20 y emitir. Crea una deuda propia de 20 y conserva la original. No permite anular el padre mientras exista una nota emitida; la ND con caja aplicada conserva los bloqueos de anulación de facturas.
4. Probar monto NC mayor al saldo, saldo consumido después de abrir el diálogo, acceso directo a IDs ajenos y llamada de empresa con un ID de obra: rechazar sin mutaciones ni filtración. Permiso de consulta no debe ofrecer creación; AR/AP desactivado rechaza su operación. Los recorridos de proyecto conservan su ámbito.

## Exportaciones de listados — regresión Excel/PDF

Ejecutar tras publicar este cambio, con datos sintéticos en un entorno de prueba autorizado. Estos pasos son criterios pendientes de smoke; no acreditan una ejecución en el portal.

1. En escritorio y celular, abrir los listados de obra **Facturas proveedor**, **Facturas emitidas**, **Órdenes de compra**, **Solicitudes de compra**, **Recepciones**, **Pagos** y **Cobranzas**. **Exportar → Excel / PDF** descarga un XLSX o PDF válido; **Generando…** evita repetir la descarga. El PDF identifica empresa, obra, usuario y filtros aplicables. En **Facturas y gastos** de empresa comprobar además que CSV sigue disponible junto con Excel/PDF.
2. Buscar y filtrar facturas por clase/tipo y, en proveedor, estado. En SC/OC combinar búsqueda con estado, incluyendo Activas y Anulada; comprobar coincidencia entre resultados y archivo. Pagos, Cobranzas y Recepciones conservan todos sus estados autorizados. Con resultados vacíos, el archivo conserva encabezados sin registros ficticios.
3. Con más de 100 facturas filtradas, descargar desde la segunda página: Excel incluye todos los resultados sin duplicados ni recorte a 20/100. Repetir con Facturas y gastos corporativos para CSV y Excel. Con más de 90 filas, comprobar aviso y cantidad omitida en PDF, y remisión a Excel para el detalle completo. Con más de 10.000 resultados se informa el límite y no se entrega un archivo parcial.
4. Verificar fechas, estado en español y moneda de cada importe. Probar texto con acentos y un contacto cuyo nombre comience con `=` para comprobar que Excel lo conserva como texto, sin fórmula. No sumar monedas distintas ni alterar importes de documentos históricos.
5. Sin sesión, sin acceso a la obra, con otra empresa activa, sin permiso del área o con su módulo deshabilitado: la ruta de exportación rechaza la consulta sin datos ajenos. Una descarga fallida informa el error y permite reintentar; no guarda como archivo una página de login ni una respuesta de error.

## Detalle de pago confirmado (regresión 26/10/2026)

1. Con un usuario habilitado para pagos, abrir un pago **ya confirmado** desde la CxP de una obra o desde Transacciones. Verificar monto, fecha, cuenta y enlaces a factura/CxP, sin excepción del servidor.
2. Abrir **Cancelar pago** y cerrar el diálogo sin confirmar. El pago y el egreso deben seguir confirmados y el saldo no debe cambiar. No cancelar pagos reales para esta prueba.
3. Con un usuario de solo lectura, comprobar que el detalle abre sin ofrecer cancelación. Un pago cancelado tampoco ofrece volver a cancelarlo.
4. En un entorno de pruebas autorizado, registrar un pago y comprobar que la navegación posterior abre el detalle y que existe un solo egreso. Si el detalle falla, revisar CxP/Transacciones antes de reintentar el registro.

Cobertura automática sin DB: `apps/web/features/ap/lib/payment-detail-rsc.test.mjs`, ejecutada por `pnpm --filter @bloqer/web test`. Renderiza la página real con React Flight y datos simulados; detecta funciones no serializables, verifica que abrir el detalle no ejecuta mutaciones y que la acción de cancelación conserva pago y proyecto.

## Botón de Bloqer AI — regresión 26/10/2026

Con Bloqer AI habilitado, verificar en escritorio y celular:

1. En reposo, el botón de destellos es circular (44 × 44 px). En escritorio, al pasar el mouse muestra «Preguntale a Bloqer» y al retirarlo se contrae.
2. Con Tab, el botón muestra el texto y el indicador de foco; Enter abre el chat. En celular, un toque abre el chat sin necesitar hover. Cerrar y volver a abrir conserva el comportamiento existente.
3. Desplazar un listado hasta el final y comprobar que la última fila y sus acciones pueden quedar por encima del botón. Revisar también la navegación inferior del celular.
4. Con preferencia de movimiento reducido, la etiqueta aparece sin animación. Con Bloqer AI deshabilitado, no aparece el botón ni se reserva espacio adicional.

## Run log

| Date | Env | Operator | Notes |
|---|---|---|---|
| 2026-08-08 | local + portal.bloqer.app | Cursor agent | Technical pass recorded in [`PHASE_5_ASVS_LITE.md`](./PHASE_5_ASVS_LITE.md). Cron auth OK locally after excluding `/api/cron/*` from session middleware; production deploy of that fix still required for Vercel cron. |


## Regresión INDARI — decimales y concurrencia (smoke UI pendiente)

**Ejecución 22/10/2026:** publicación Production confirmada (`1d07699a`, Vercel `9SKYgHtUNWHcZs6z7trTLGXaWwqU`, alias portal). Migración D-118 y conservación completa de 191 líneas verificadas. Login Google, sesión, dashboard y consola operativos. La cuenta de plataforma no tiene tenant operativo y no permite abrir OC-051: formularios, matriz y AP siguen pendientes de smoke con una cuenta habilitada. No se modificaron permisos ni documentos para completar el ensayo. Preview pospuesto por Owner; los escenarios mutables siguientes continúan reservados a datos de prueba autorizados. Ver §17 del plan INDARI.

Tras verificar el deployment y alias, en datos de prueba autorizados: abrir y guardar sin tocar un unitario de 4 dp; entrar/salir del campo sin cambios; editarlo a 4 dp; confirmar dinero a 2 dp y FX a 6. Cargar 1 × $10,00 con IVA incluido al 21% y sin descuento: total de línea $10,00 (IIBB se informa aparte). Reabrir con precio neto y cambiar solo notas: mantener total; cambiar cantidad o precio: recalcular. Probar en escritorio y celular.

Para concurrencia y datos sintéticos, usar `procurement-regression.live.test.ts` exclusivamente con el opt-in y las dos URLs a la DB aislada documentada en fase 0. Incluye panel OC/recepción simultáneos, cobertura parcial y resguardo de importes al editar. No ejecutar fixtures contra `neondb` ni `production`; el guard los rechaza.


## Regresión INDARI — fase 2 (smoke UI pendiente)

En entorno y datos de prueba autorizados, después del deploy:

1. Crear factura desde una OC parcialmente recibida, editar descripción y emitir. Conservar OC e ítems de origen, total y una única CxP. Repetir emitir no crea otra deuda.
2. Verificar una factura manual enlazada a cabecera sin ítems OC: panel y detalle explican que los importes están incluidos pero sus cantidades no se concilian por línea. No tratar el aviso como prueba de duplicación. La carga manual sigue permitida.
3. Borrador automático histórico de prueba con vínculo de línea ausente: emitir debe pedir revisión, sin crear CxP. No restaurar por descripción/importe ni usar datos reales como caso de prueba.
4. Usuario sin acceso a obra y contexto de otra empresa: no acceder al resumen, preview, listado ni avisos. Edición/anulación respetan el alcance existente.
5. NC parcial de factura pagada parcialmente: crédito reduce saldo sin nuevo pago ni movimiento. ND crea su CxP; no cambia cantidades recibidas. Reporte de devengado toma signos D-115.

Integración reproducible: `packages/services/src/ap/supplier-invoice-integrity.live.test.ts`, con el mismo opt-in y guard de DB aislada de fase 0. Tests de costos, saldos y cancelación forman parte de `pnpm test`. Sin fixtures mutables contra producción.

## Regresión INDARI — fase 3 / ofertas por ítem (D-118)

Pendiente de smoke UI en versión publicada. Pruebas automatizadas: `packages/services/src/procurement/quote-line-offer.live.test.ts` en DB aislada, con el guard de fixtures existente. No ejecutar sobre la DB normal de dev ni producción.

1. Antes de desplegar, confirmar entorno/URLs de Vercel y punto de recuperación Neon. El build aplica migraciones automáticamente; un push con esta migración no debe usarse para averiguar a qué DB apunta el preview. Aplicar `20261021180000_quote_line_offer_kind` en el destino correcto antes del código nuevo; para portal es Neon `production`.
2. Verificar columna `offerKind` nullable, sin default, y enum `QuoteLineOfferKind`. La migración no contiene UPDATE/backfill ni toca importes/FK. Comparar totales, cantidades y relaciones de una muestra histórica antes/después. No inferir bonificaciones de precios cero.
3. En datos de ensayo, cargar una oferta con Cotizado y No cotizado: este último aparece identificado, no permite selección escritorio/celular y no aporta al mínimo del ítem. Una petición directa debe fallar igual. Una cotización completamente gratuita o sin oferta se rechaza por total no positivo.
4. Cambiar un ítem a Bonificado con comprobante de respaldo y mantener otro cotizado positivo. El bonificado puede seleccionarse en la matriz; el atajo Adjudicar cotizados → OC lo deja pendiente. Precio, descuento, IVA e IIBB deben conciliar con lo guardado.
5. Histórico positivo sin clasificación: se puede adjudicar sin reescribir la cotización. Cero histórico pendiente: muestra Cero sin clasificar · revisar; clasificar solo mediante edición permitida. Histórico con OC activa: no cambia importes/vínculos ni habilita edición excepcional; la OC existente conserva su flujo. Anular y readjudicar sí aplica D-118.
6. Mínimo dos: dos ofertas para A y solo una para B. A se puede adjudicar, B no; lote A+B inválido revierte ambas operaciones. Reintentar edición/adjudicación simultáneas debe producir una respuesta funcional y no una OC sobre una línea no cotizada.
7. Ayuda y guía §9.1 deben coincidir con las etiquetas; verificar búsqueda «no cotizado», «bonificado» y «cero sin clasificar». No informar disponibilidad a INDARI hasta verificar versión del portal y este recorrido.
8. Enviar simultáneamente dos cotizaciones del mismo proveedor para una SC: solo una se guarda. Con un único cupo restante, enviar ofertas de dos proveedores distintos: solo una se guarda y la otra informa el máximo permitido. Verificar que el mínimo de ofertas no se infle por cargas duplicadas. Los dos casos están cubiertos por la suite aislada.

**Recuperación:** no eliminar columna/enum ni migraciones aplicadas. El código anterior puede leer el esquema ampliado, pero desconoce la clasificación y permitiría adjudicar ceros. Si ya se cargaron ofertas nuevas, no reabrir adjudicaciones con esa versión: priorizar corrección hacia adelante o mantener ese flujo detenido hasta restaurar D-118. Revertir código no revierte documentos ni caja.
# Compras — regresión AG-06 (2026-11-04)

Corrida local aislada y publicación tienen evidencias separadas. La migración aditiva `20261104183000_purchase_receipt_company_number` debe aplicarse antes del cliente que usa el correlativo D-127. Mantener números históricos NULL, sin backfill. No interpretar las pruebas locales como aplicación en `portal.bloqer.app`; producción solo se migra/publica con autorización específica y destino verificado.

1. Crear SC de ensayo con referencia ARS y cotizar USD con FX explícito: la ficha conserva ambas monedas, no copia/compara precios como si fueran iguales y la OC pide la justificación vigente sin inventar porcentaje. Comparar también saldo con un compromiso de otra moneda.
2. Devolver una SC sin ofertas con motivo y reenviar. Con cualquier oferta, incluida Rechazada/Reemplazada, impedir devolución. Los borradores históricos conservan IDs/cantidades/referencias y admiten solo cabecera no destructiva.
3. Abrir una OC de obra compartida como miembro global: política, opciones y documentos corresponden a su empresa. Una petición que agrega a una OC directa un ítem de otra SC se rechaza sin reservarlo.
4. Recibir con producto exige Depósito destino; un servicio sin producto no genera stock. Sumar filas repetidas antes de comprobar tolerancia. Anular stock requiere el total del mismo producto/depósito, sin existencias negativas. Conservar el efecto D-104 de hitos y TASK sin cambios.
5. Comprobar códigos RC distintos para dos altas de una misma empresa y OC, empresa separada con su propia secuencia, históricos UUID y reintento sin número nuevo. Anular conserva el correlativo.
6. Verificar OC→AP: empresa/obra/proveedor/moneda y padres WBS/APU coherentes en preview y alta/edición/emisión. Resumen no calculable ante monedas incompatibles, documentos originales consultables. Dos ediciones parciales concurrentes no combinan el proveedor viejo con una OC nueva.
7. Repetir lista/detalle/formulario en escritorio/teléfono, tema claro/oscuro, permisos restringidos y AP/Inventario no disponibles. Comprobar campos conservados tras error, un solo envío y acciones según el aprobador real.
8. Cambiar FX al confirmar una OC aprobada con un actor sin aprobación suficiente: rechazo sin cambios. Con aprobador habilitado: nueva aprobación auditada y confirmación atómicas. Repetir segregación y FX sin cambios según D-129.
9. Ayuda/guía y knowledge deben identificar D-125/126/127/128/129. El cierre parcial formal D-128 **no está disponible**; no simularlo editando cantidades confirmadas.

# Certificaciones — regresión 2026-10-22 (D-119)

Sin cambios de schema/ERD estructural ni migraciones. No hay backfill ni corrección automática de históricos. Los índices existentes evitan duplicar número de certificado, partida por certificado, factura activa por certificado, CxC por factura y cobranza por idempotency key.

- En un entorno aislado con migraciones aplicadas, ejecutar `packages/services/src/certification/certification-flow.live.test.ts` con `BLOQER_CERTIFICATION_LIVE_DB=1` y `BLOQER_PROCUREMENT_TEST_DATABASE` igual al nombre de esa base. El guard rechaza production, bases no aisladas y coincidencias incompletas. La suite crea su propio tenant y datos sintéticos; al terminar informa una certificación borrador para verificar UI. No ejecutar sobre datos del cliente.
- La suite cubre: previo 12% + avance físico 37% → sugerencia 25%; fecha de corte; compras netas con descuento y recepciones confirmadas; rechazo de padres EDT; aislamiento tenant; guardar sólo una fila; conflicto por revisión vieja; precio snapshot; límites de cantidad y físico al guardar; dos emisiones concurrentes; factura/CxC únicas; bloqueo de anulación con factura activa; sobrecobro; banco de otra empresa; cobro parcial/total idempotente; moneda y FX explícitos con proyecto conservado.
- En el navegador local: tabla de una fila, búsqueda sin acentos, búsqueda dentro de un rubro contraído, expandir/contraer, cero coincidencias; totales antes de tabla también en orden de lectura. En Medir: sugerencia editable, cancelar sin guardar, compras/recepciones no cambian físico, acumulado >100 bloquea Guardar. Verificar lectura de emitido sin editar históricos.
- Revisar stepper compartido con el primer paso activo: círculo y anillo completos, desplazamiento horizontal accesible en pantalla angosta. Revisar diálogo en escritorio y teléfono, y teclado/foco.
- Factura en moneda extranjera debe pedir FX manual; la cobranza vuelve a pedir el suyo, exige cuenta compatible y conserva projectId/companyId. No mezclar ingreso de obra con ingreso corporativo en reportes.
- Auditoría: la suite rechaza vínculos a certificados inyectados en ventas manuales (encabezado y líneas), intercala edición/emisión para comprobar inmutabilidad y conciliación con CxC, y verifica acceso por membresía a las consultas auxiliares. Con AR deshabilitado la planilla sigue disponible y las consultas financieras no devuelven datos.
- En lectura de emitidos, **Físico período** debe conservar el porcentaje guardado aunque difiera del **Avance real**; con cobro total el recorrido indica **sin saldo pendiente de cobro**.

## Auditoría de pagos y cobranzas — regresión 2026-10-26

Sin migraciones ni corrección de saldos históricos. Pruebas automatizadas sin DB: `packages/services/src/finance/payment-collection-access.test.ts` y `packages/services/src/accounting/accounting-auto-draft-failure.test.ts`. Cubren acceso D-111 antes de cualquier control financiero o sincronización contable, separación empresa/obra y rechazos asíncronos durante el auto-DRAFT posterior al commit (D-061).

Smoke pendiente de publicación, solo con datos de ensayo autorizados:

1. En modo **Solo proyectos asignados**, un usuario de Finanzas sin asignación no puede cancelar pagos ni cobranzas de otra obra, incluso mediante una petición directa o un reintento de un documento ya cancelado. Verificar que no cambien el documento, saldo, movimiento ni asiento.
2. Con asignación válida, conservar los controles de período cerrado, movimiento conciliado y asiento contabilizado. OWNER/ADMIN mantienen su acceso global; los documentos corporativos no requieren asignación a obra.
3. El listado de pagos de una CxP y el detalle respetan tenant, empresa activa, proyecto de la ruta y rol corporativo. PROJECT_FINANCE no accede a pagos corporativos; sí a pagos de su obra asignada.
4. Simular indisponibilidad de la generación contable con los tests de regresión. El resultado del auto-DRAFT debe ser omitido, sin propagar el error a una operación ya confirmada. Incluye pagos, cobranzas, movimientos, transferencias y facturas de venta/proveedor, aun si también falla la consulta de recuperación.
5. En la UI, confirmar un pago de ensayo y abrir su detalle sin error de servidor; verificar una única operación y un único movimiento. La prueba React Flight `apps/web/features/ap/lib/payment-detail-rsc.test.mjs` cubre la preparación de acciones al renderizar el detalle.
