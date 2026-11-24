# Plan de automatización — primer paquete

> **Fecha de apertura:** 19/11/2026.  
> **Estado:** primer paquete implementado; validación local en §§8–9 y cierre de compilación/verificación mediante CI. Piloto real sin activar. El resultado remoto corresponde al commit y a los checks de su entrega.  
> **Origen:** relevamiento «Bloqer: competencia, IA y automatización operativa», 19/11/2026: 40 oportunidades en 10 categorías.  
> **Relación con otros planes:** complementa el [roadmap técnico](./08-architecture/IMPLEMENTATION_ROADMAP.md) y el [roadmap de Bloqer AI](./BLOQER_AI_ROADMAP.md). Sus etapas P0/P1a son lotes de esta iniciativa; no reemplazan las fases generales 0–5 ni las versiones V1–V4 de AI.

**Seguimiento vigente:** [diez bloques y próximo corte (§12)](#12-seguimiento-de-los-diez-bloques--20112026). Por pedido del Owner, cada cierre de trabajo debe indicar qué se implementó, qué se comprobó, qué falta y los próximos pasos vinculados con los bloques A–J. Conservar estos diez bloques; no reemplazarlos por otra numeración ni confundirlos con las etapas P0/P1a/P1b/P1c.

Diseño técnico autorizado: [ADR-019 — lectura asistida efímera de comprobantes y documento individual de OC](./08-architecture/ARCHITECTURE_DECISION_RECORDS.md#adr-019--lectura-asistida-efímera-de-comprobantes-y-documento-individual-de-oc). Su alcance no autoriza deploy, nuevos proveedores, dependencias, persistencia ni reglas financieras.

## 1. Objetivo y alcance autorizado

El primer paquete busca reducir carga y seguimiento manual sobre circuitos existentes: preparar una factura de proveedor para revisión y disponer de una OC individual compartible. Antes de incorporar canales se revisan horarios, entrega de avisos, controles de IA, consultas y coherencia documental. La autorización permite trabajar en ese primer paquete y en sus condiciones previas; el resto de las 40 oportunidades queda visible como backlog para decidir por etapas.

El resultado debe conservar un único control de permisos, cantidades, estados y dinero en `packages/services`. Una extracción, un archivo o un mensaje no autorizan por sí mismos emisión, aprobación, recepción física ni pago.

| Incluido en el primer paquete | Límite de este alcance |
|---|---|
| P0: verificar y corregir las bases antes de canales | Cada hallazgo se contrasta con código/configuración y se verifica con evidencia; producción se distingue del árbol local |
| P1a: factura de proveedor a carga revisable | Solo alta manual de factura normal en ARS; extracción efímera desde PDF/JPEG/PNG/WebP de hasta 3 MiB con el proveedor IA actual y flags de habilitación |
| P1a: OC individual compartible | PDF, revisión, descarga y compartir archivo mediante función nativa si el dispositivo la soporta; sin envío backend ni trazabilidad de entrega |
| Plan, ayuda y seguimiento de validación | Guía, Help y conocimiento AI se actualizan según el comportamiento efectivamente implementado |
| Continuidad manual y recuperación | El usuario conserva el circuito actual si falla la asistencia; no se habilitan escrituras autónomas |

El corte autorizado reutiliza el proveedor IA y las dependencias actuales; no agrega campos persistidos, schema ni migraciones. Una futura selección de otro proveedor OCR, persistencia nueva, dependencias, estados, eventos o cambios financieros se registra en las decisiones/ADR correspondientes antes de incorporarla. Este plan no crea por sí solo esos contratos. Credenciales, corpus real, destinatarios y condiciones de un piloto se documentan cuando estén disponibles, sin sustituirlos por supuestos.

La preparación documental se activa por acción explícita y un flag propio inicialmente apagado, además de los flags/latch de IA existentes. El resultado es efímero y revisable, con campos desconocidos nulos. No registra tools de escritura. El formulario guarda `DRAFT` por la acción vigente y conserva el original con reintento del adjunto sobre el ID creado. Si la respuesta de creación es incierta, se revisa el listado antes de repetir: no hay una garantía nueva de idempotencia persistente. El número fiscal leído puede mostrarse para revisión, pero no existe un campo operativo para guardarlo en este corte: no se promete deduplicación fiscal. Moneda desconocida/distinta de ARS, NC/ND e impuestos no representables se derivan a carga manual.

### Fuera del primer paquete

- WhatsApp oficial y canales entrantes, aprobaciones dentro del chat, audio operativo, MCP y API pública.
- Portales externos, offline completo, RFI/cambio contractual formal, banca/pagos e inmobiliario.
- Resolver mediante OCR las decisiones abiertas de históricos, factura multi-OC, anticipos sin factura o cierre de saldo sin recibir.
- Completar o editar borradores AP originados en OC, moneda extranjera, NC/ND y deduplicación fiscal en el piloto de extracción inicial.
- Un límite distribuido nuevo, outbox durable o cambio de semántica del digest D-114 sin resolver sus dependencias de infraestructura/persistencia/decisión. D-143 regula la aceptación de entregas programadas de reportes; no se extiende automáticamente al digest.
- Cambios de base de datos y despliegue en esta entrega.
- Declarar disponible en producción una capacidad solo porque exista en el árbol local o hayan pasado pruebas unitarias.

## 2. Línea de base y evidencia inicial

El relevamiento partió de `HEAD 71db5fd914775794e72cf2c191174645d6bb95cd` y del árbol de trabajo local, que ya tenía modificaciones en finanzas, compras, exportaciones y documentación. Al abrir este plan se conservan esos cambios. El inventario inicial fue estático: no demostró flags, cron externos, sesión autenticada ni comportamiento de producción. Las verificaciones posteriores se agregan en §8 con su entorno y resultado.

| Área | Base observada antes del paquete | Referencia para revalidar |
|---|---|---|
| Compras | SC, cotizaciones, adjudicación parcial, varias OC, aprobación, confirmación y recepción | [Compras](./02-modules/PROCUREMENT.md), [OC y recepciones](./02-modules/PURCHASE_ORDERS_AND_RECEIPTS.md), `packages/services/src/procurement/` |
| OC–recepción–factura | Vínculos y matching de cantidades; borrador automático sujeto a política | D-067, D-108 y D-145 en [decisiones](./00-product/DECISION_LOG.md); `supplier-invoice-from-po.service.ts` y `purchase-receipt.service.ts` |
| Facturas/NC/ND | Ciclo documental separado de CxP y caja; cambios locales recientes a preservar | [Gastos, facturas y pagos](./02-modules/EXPENSES_AND_PAYMENTS.md) |
| Documentos | R2, uploader, originales, carpetas y controles por entidad | [Documentos](./02-modules/DOCUMENTS.md), `packages/services/src/documents/`, `apps/web/features/documents/` |
| Notificaciones | Campana, preferencias por categoría, digest, SLA y escalamiento | [Notificaciones](./02-modules/NOTIFICATIONS.md), D-054/D-114 y `packages/services/src/notifications/` |
| Reportes programados | Runner con locks, idempotencia y reintentos | [Jobs](./08-architecture/BACKGROUND_JOBS_ARCHITECTURE.md), `packages/services/src/scheduled-reports/` |
| Bloqer AI | Registry READ, aproximadamente 17 tools auditadas, ayuda y streaming; rate limit en memoria | [Roadmap AI](./BLOQER_AI_ROADMAP.md), [auditoría de tools](./BLOQER_AI_TOOL_AUDIT.md), `apps/web/lib/ai-rate-limit.ts` |
| Nuevas entradas | OCR, transcripción y WhatsApp no encontrados como circuitos operativos implementados en el relevamiento | Confirmar inventario y despliegue antes de declarar ausencia o disponibilidad |

La ayuda AI indexa documentación del producto. No constituye búsqueda del contenido privado de contratos, planos o facturas de cada obra. Del mismo modo, adjuntar una foto no constituye extracción OCR. El matching actual de cantidades no debe describirse como conciliación automática integral de precios e impuestos.

### Hallazgos a comprobar en P0

| ID de seguimiento | Hallazgo de origen | Comprobación / resultado esperado | Estado inicial |
|---|---|---|---|
| P0-01 | Digest con horario elegible y cron diario 10:05 UTC | Mantener cadencia diaria compatible con D-114/Hobby; documentar y advertir horarios incompatibles, sin prometer frecuencia horaria | Aviso local implementado; resolución general pendiente Q-095 |
| P0-02 | Reportes: cron diario 05:05 UTC y documentación horaria | Documentación alineada a cadencia diaria; runner informa fallos sin impedir procesar otros tenants | Implementado y probado localmente; cron desplegado no verificado |
| P0-03 | Confirmar OC no demuestra comunicación externa | Mantener el significado financiero de confirmar; separar documento compartible y resultado del canal | B1 local probado; comunicación externa sigue manual |
| P0-04 | `SENT` indica aceptación del proveedor de email | Historial/ayuda aclaran aceptación frente a entrega/lectura; `PENDING` programado conserva significado Sin confirmar | Aclaración local implementada; sin webhooks de entrega |
| P0-05 | Rate limit AI en memoria por instancia | Control distribuido pendiente de infraestructura/persistencia; no presentarlo resuelto por este paquete | Pendiente P-AI-QUOTA-01 |
| P0-06 | Email best-effort sin recuperación durable general | Visibilidad de errores en el corte; outbox y aplicar al digest un mecanismo como el de reportes D-143 requieren decisión | Recuperación durable pendiente P-EMAIL-06/P-EMAIL-04 |
| P0-07 | Resumen funcional de OC contradice D-106 | Módulo/Guía/Help alineados con D-105/D-106/D-107 y revisión de `purchase-order-workflow.service.ts`; no cambia autorización financiera | Reconciliación documental e índice comprobados (§8) |
| P0-08 | Tools AI recortan resultados después de listar | Filtros/límite de filas y count del mismo alcance en repositorio; conservar guards y orden | Implementado y probado con fixtures; SQL real pendiente (§8) |

Los IDs P0-xx organizan este plan: no son estados, eventos ni entidades del producto. Si la comprobación descarta un hallazgo, se registra como descartado con evidencia; no se fuerza una corrección.

## 3. Secuencia de ejecución y criterios de avance

### P0 — bases antes de canales

1. Confirmar baseline local, dependencias, configuración y estado del despliegue accesible. Separar evidencia estática, pruebas aisladas y smoke autenticado.
2. Cerrar coherencia de horarios y documentación; verificar reejecución sin avisos/reportes duplicados.
3. Acotar consultas READ con filtros/límites en repositorio y revalidar alcance. El límite distribuido de IA permanece pendiente; no agregar infraestructura/persistencia en este corte.
4. Confirmar qué significa cada resultado de comunicación y qué recuperación existe. Cualquier mecanismo durable nuevo requiere su diseño explícito.
5. Actualizar Guía/Help/AI donde cambie el comportamiento visible y registrar pruebas en §8.

**Salida de P0:** los riesgos que afectan el primer piloto están resueltos o quedan identificados con una limitación operativa concreta. No presentar P0 completo si siguen sin verificar el scheduler efectivo, los límites distribuidos necesarios o la recuperación requerida por una capacidad que se vaya a activar.

### P1a — factura revisable y OC compartible

Los dos frentes pueden avanzar en paralelo después de sus dependencias P0. El documento OC puede cerrarse sin esperar la selección del parser.

| Frente | Resultado del lote | Verificación necesaria |
|---|---|---|
| A2: factura a propuesta | Solo alta manual `INVOICE` en ARS; original local de hasta 3 MiB, interpretación efímera y campos editables | Reautorizar AP/tenant/empresa/obra; rechazar NC/ND/moneda extranjera; desconocidos nulos; sin emisión/pago ni llamada a tools |
| A2: guardar y adjuntar | Crear `DRAFT` por la acción existente y adjuntar el original; reintentar adjunto sin recrear factura | Error de adjunto visible y recuperable; el piloto no edita ni completa borradores desde OC (D-108/D-145 se preservan) |
| A1/A4: alcance mínimo de ingreso | Un PDF/JPEG/PNG/WebP, revisión y continuidad manual; no bandeja de lote durable | Permisos, tamaño/tipo y errores; número fiscal leído solo informativo, sin deduplicación fiscal ni cruce de canales |
| B1: OC individual | Emisor/proveedor e identificación fiscal/domicilio, obra, fechas, moneda, líneas, descuentos/IVA/IIBB/totales | `getPurchaseOrderById` y repositorio de identidades scoped; excluir notas, EDT/APU, baseline, variancias/justificaciones, FX y aprobadores |
| B1: significado de compartir | Preparación/revisión, descarga y share nativo de archivo si está disponible; ruta autenticada, sin URL pública | Descargar no confirma la OC; compartir no prueba envío/entrega; avisos visibles en borrador, enviada, aprobada sin confirmar y anulada |
| J3/J4: piloto | Tarea completa con revisión humana y alternativa manual | Tiempo total, calidad, errores, permisos y recuperación; no medir solo velocidad del OCR |

El prototipo autorizado usa el proveedor IA actual; la validación de esta entrega no ha ejecutado llamadas reales al proveedor ni prueba con corpus. La comparación de una ruta gestionada y una local permanece como recomendación del relevamiento para elegir con evidencia antes de ampliar la operación. Docling y otros parsers no se incorporan en este corte. Cuando se ejecute el benchmark, seleccionar **un único candidato** para operación y registrar tiempo total de revisión, calidad/costo y condiciones de datos. Sin corpus o credenciales autorizadas se registra qué parte pudo comprobarse y qué queda pendiente.

**Salida de P1a:** flujo acotado comprobado, efectos y limitaciones explicados, documentación coherente, pruebas pertinentes aprobadas y validación humana del piloto registrada. Construir una pantalla o probar un parser no completa por sí solo factura a borrador.

### P1b/P1c y posteriores

- **P1b:** WhatsApp oficial para OC/excepciones cuando estén definidos titularidad del número, alta por tenant, consentimiento, plantillas, costos y recuperación.
- **P1c:** audio a SC o parte, eligiendo un único flujo con identidad autenticada, revisión y confirmación. Voz por WhatsApp después del circuito dentro de Bloqer.
- **P2/P3:** oportunidades restantes según evidencia del piloto y decisiones de dominio. No se activan por el solo hecho de estar en este plan.

## 4. Matriz completa de 40 oportunidades

Los identificadores conservan la correspondencia con el relevamiento. **Etapa** expresa secuencia propuesta, no aprobación automática ni un cambio de prioridad del roadmap AI. **Por validar** significa alcance inicial en revisión/ejecución, sin afirmar implementación; **Backlog** significa que requiere un lote posterior. Cada cierre debe enlazar evidencia en §8.

| ID | Categoría | Oportunidad | Etapa / encaje en este paquete | Estado |
|---|---|---|---|---|
| A1 | Captura y revisión documental | Bandeja de ingreso por lote, progreso y recuperación | P1a: ingreso mínimo reutilizando uploader; bandeja durable común posterior | Por validar (mínimo) |
| A2 | Captura y revisión documental | Factura, NC o ND a propuesta de carga | P1a alta manual `INVOICE` ARS; OC/NC/ND/FX posteriores | Implementado local; pruebas fake aprobadas; piloto real pendiente |
| A3 | Captura y revisión documental | Remito a recepción propuesta | P2; controles de cantidad, unidad, depósito y stock | Backlog |
| A4 | Captura y revisión documental | Escaneo y deduplicación entre canales | P1a solo archivo/foto legible; escáner, dedupe fiscal y cruce de canales posteriores | Backlog (capacidad completa) |
| B1 | WhatsApp y comunicaciones operativas | OC individual compartible | P1a; documento y significado de compartir | Implementado y probado localmente; smoke navegador pendiente |
| B2 | WhatsApp y comunicaciones operativas | Envío oficial trazable | P1b; identidad, consentimiento, canal y resultado | Backlog |
| B3 | WhatsApp y comunicaciones operativas | Aprobación notificada con enlace autenticado | P1b; aprobar dentro del chat queda para diseño posterior | Backlog |
| B4 | WhatsApp y comunicaciones operativas | Respuesta vinculada a la operación | P1b/P2; separar propuesta externa de cambio interno | Backlog |
| C1 | Avisos relevantes y pendientes | Relevancia por responsabilidad y consecuencia | P0: preservar audiencias; priorización nueva posterior | Por validar (base) |
| C2 | Avisos relevantes y pendientes | Resumen por rol | P0: horario ejecutable y digest actual; ampliar contenidos después | Por validar (base) |
| C3 | Avisos relevantes y pendientes | Escalamiento y supresión | P0: verificar política/dedupe vigentes; agrupación nueva posterior | Por validar (base) |
| C4 | Avisos relevantes y pendientes | Salud de comunicaciones | P0: significado real y errores; outbox/entrega durable pendientes | Por validar (parcial) |
| D1 | Audio y asistente que prepara acciones | Audio a solicitud de compra | P1c; borrador primero, sin adjudicar ni aprobar | Backlog |
| D2 | Audio y asistente que prepara acciones | Audio/fotos a parte diario | P1c/P2; revisar efectos de avance y consumo | Backlog |
| D3 | Audio y asistente que prepara acciones | Asistente contextual | P0: consultas READ acotadas; asistencia contextual nueva posterior | Base de consultas probada con fixtures; capacidad completa en backlog |
| D4 | Audio y asistente que prepara acciones | Confirmación vinculada al contenido | P1a: revisión en flujo autorizado; tools WRITE requieren diseño V3 | Por validar (límite del flujo) |
| E1 | Compras y proveedores | Cotizaciones a la matriz existente | P2; unidades, vigencia, impuestos y clasificación D-118 | Backlog |
| E2 | Compras y proveedores | Respuesta por enlace acotado | P2/P3; acceso externo revocable | Backlog |
| E3 | Compras y proveedores | Desempeño real del proveedor | P2; datos comparables y cobertura visible | Backlog |
| E4 | Compras y proveedores | Excepciones OC–recepción–factura | Preservar reglas vigentes; el OCR inicial no edita borradores OC | Backlog (nuevas excepciones) |
| F1 | Dirección, finanzas y análisis | Brief de dirección con fuentes | P2; cifras, alcance, moneda y registros verificables | Backlog |
| F2 | Dirección, finanzas y análisis | Conciliación asistida | P2; candidatos sobre importación existente y confirmación | Backlog |
| F3 | Dirección, finanzas y análisis | Anomalías para revisar | P2; evidencia sin acusaciones ni corrección automática | Backlog |
| F4 | Dirección, finanzas y análisis | Escenarios de caja | P2/P3; supuestos separados del saldo real | Backlog |
| G1 | Obra, planificación y conectividad | Abastecimiento de próximas semanas | P2; extender vínculos de tareas y recepciones existentes | Backlog |
| G2 | Obra, planificación y conectividad | Borradores offline acotados | P2; conflicto, dispositivo y revalidación | Backlog |
| G3 | Obra, planificación y conectividad | Búsqueda documental con citas | P2/P3; permisos, versiones, página e índice propios | Backlog |
| G4 | Obra, planificación y conectividad | Inspecciones y observaciones | P2/P3; dominio y evidencia de cierre por definir | Backlog |
| H1 | Contratos, cliente y cierre de obra | RFI formal | P2/P3; Q-057/D-122 y módulo propio | Backlog |
| H2 | Contratos, cliente y cierre de obra | Cambio de alcance respaldado | P2/P3; contrato, costo/plazo y aprobación separados | Backlog |
| H3 | Contratos, cliente y cierre de obra | Portal de cliente/subcontratista | P2/P3; un público y permisos propios primero | Backlog |
| H4 | Contratos, cliente y cierre de obra | Dossier de entrega y garantías | P2/P3; respaldo existente y faltantes explícitos | Backlog |
| I1 | Integraciones, APIs y ecosistema | Email y conexiones documentales | Después del ingreso web validado; conectores con alcance acotado | Backlog |
| I2 | Integraciones, APIs y ecosistema | API/webhooks con caso concreto | P3; contratos, credenciales y alcance por integración | Backlog |
| I3 | Integraciones, APIs y ecosistema | MCP sobre el registry actual | P3 del relevamiento / V4 del roadmap AI | Backlog |
| I4 | Integraciones, APIs y ecosistema | Fiscal, bancos y BIM por iniciativa | P3; cada integración con su caso y decisión | Backlog |
| J1 | Confiabilidad, datos y adopción | Operación de IA/canales | P0: flags/controles vigentes; cuotas distribuidas e infraestructura pendientes | Por validar (parcial) |
| J2 | Confiabilidad, datos y adopción | Datos maestros | P1a: resolver ambigüedad sin fusionar; limpieza integral posterior | Por validar (mínimo) |
| J3 | Confiabilidad, datos y adopción | Adopción por rol | P1a; responsable del piloto, ayuda y tarea completa | Guía/Help actualizados; piloto pendiente |
| J4 | Confiabilidad, datos y adopción | Evaluación y continuidad manual | P0/P1a; permisos, fallos, recuperación y medición | Por validar |

## 5. Invariantes del primer paquete

- Tenant y actor salen de la sesión/contexto autorizado. Empresa, obra, entidad y archivo se revalidan al leer y al ejecutar; un identificador producido por el modelo no acredita acceso.
- Toda mutación operativa usa los servicios actuales. Dinero con Decimal/kernel vigente ([D-053](./00-product/DECISION_LOG.md)); no recalcular reglas financieras en React o en el modelo.
- Una factura en `DRAFT` no genera CxP emitida. La confirmación de una extracción no es emisión ni pago. Una OC descargada no queda confirmada por ese acto.
- D-108/D-145 protegen el borrador automático y sus ediciones humanas. Nuevas entregas o reintentos no deben duplicar ni sobrescribir información revisada.
- Archivo, correo y texto extraído son datos no confiables: instrucciones incrustadas no habilitan tools, destinatarios ni cambios de permisos.
- El usuario puede corregir campos, cancelar y volver a carga manual. Si se conserva una interpretación para retomarla, su persistencia, retención y permisos deben estar definidos explícitamente.
- Reintentos y concurrencia se prueban en la capa que produce efectos. No equiparar un aviso deduplicado a una operación idempotente o a un mensaje entregado.
- El registry READ no se amplía silenciosamente con PREPARE/WRITE. Cualquier acción AI nueva respeta la secuencia y decisiones del [roadmap](./BLOQER_AI_ROADMAP.md).

## 6. Validación prevista y criterios de aceptación

Estas comprobaciones describen el cierre esperado; sus casillas vacías no son pruebas ejecutadas. Los comandos concretos y resultados se registran en §8. Priorizar suites existentes y tests que reproduzcan fallos o protejan invariantes, sin scripts sueltos ni comprobaciones que solo repitan la implementación.

| Frente | Casos mínimos | Evidencia de cierre |
|---|---|---|
| Digest/reportes | Horario seleccionado, UTC/zona acordada, atraso, dos ejecuciones, política deshabilitada | Tests del scheduler/runner + configuración desplegada verificada cuando se publique |
| Comunicación | Éxito aceptado por proveedor, error, reintento, ausencia de credencial/configuración | Resultado visible y semántica documentada; sin afirmar entrega no comprobada |
| Rate limit/AI | Controles vigentes de tenant/usuario, flags y límite en memoria; concurrencia distribuida/fallo compartido quedan para el lote de infraestructura | Tests del corte y límites remanentes explícitos; no marcar distribuido por un test de memoria |
| Tools READ | Permiso revocado, alcance por empresa/obra, listas grandes, límite/paginación | Respuesta autorizada y acotada; regresión de consultas afectadas |
| Factura revisable | PDF/foto representativos, faltantes, unidad/moneda ambigua, cancelación, fallo del extractor; moneda no ARS y NC/ND como casos negativos | Original conservado, campos corregibles, derivación manual y continuidad; dedupe fiscal fuera de alcance |
| Alta AP y adjunto | Reintento del adjunto, factura ya creada, error de extracción, empresa/obra/proveedor incompatibles | Sin duplicación por reintentar archivo; sin emisión/pago; borradores OC fuera del flujo de extracción |
| OC individual | Permisos cruzados, datos comerciales, campos faltantes, textos largos y varias páginas | Documento completo y legible; sin transición de estado por descargar |
| UX/documentación | Escritorio/móvil, labels, ruta, siguiente paso y mensaje de error reales | Guía + Help coherentes y knowledge/evals actualizados cuando corresponda |

### Medición del piloto

Registrar empresa/obra, roles participantes y responsable antes de pilotear. La propuesta inicial del relevamiento es un corpus de 50–100 documentos con variedad de proveedores, páginas y fotos deficientes; reservar una parte para evaluar sin ajustar sobre ella. Monedas no ARS, NC/ND y formatos no soportados funcionan como casos negativos para comprobar la derivación manual. Los duplicados sirven para evaluar el procedimiento humano, no para atribuir al corte una deduplicación fiscal inexistente. Ese tamaño es orientativo, no una garantía estadística. Los audios se preparan cuando se abra P1c.

Medir tiempo completo hasta registro correcto (ingreso + revisión + corrección), mediana/p90, errores de campos críticos, correcciones humanas, duplicados y costo por operación aceptada. La reducción de 30% de la mediana fue una **meta propuesta para acordar**, no una mejora obtenida ni un compromiso ya aprobado.

Cero accesos cruzados y cero escrituras no confirmadas son condiciones de seguridad del flujo. Un fallo en esos controles detiene la capacidad nueva. Si interpretar y revisar cuesta más que la carga actual, no se amplía el piloto.

## 7. Pendientes y decisiones que no se resuelven por inferencia

| Tema | Tratamiento en este paquete |
|---|---|
| Corpus, empresa/obra y responsables | Registrar antes de validación con datos reales; no inventar un piloto ejecutado |
| Proveedor/parser, credenciales, costo y condiciones de datos | Proveedor actual en prototipo; benchmark/corpus y llamadas reales pendientes; no instalar candidatos adicionales |
| Persistencia/cola y resultado de entrega | [P-EMAIL-06 / P-EMAIL-04](./08-architecture/PENDING_ARCHITECTURE_ITEMS.md): recuperación de digest/outbox pendientes; D-114 separado de reportes D-143 |
| Control distribuido y presupuesto AI | [P-AI-QUOTA-01](./08-architecture/PENDING_ARCHITECTURE_ITEMS.md): chat/extracción comparten contador solo dentro de cada instancia; no es cuota monetaria ni límite global |
| Número fiscal y duplicados | [Q-093](./00-product/OPEN_QUESTIONS.md#q-093--referencia-fiscal-y-duplicados-en-captura-de-facturas) abierta: lectura informativa; no se simula referencia fiscal con número interno |
| Idempotencia durable del alta DRAFT | [Q-094](./00-product/OPEN_QUESTIONS.md#q-094--idempotencia-durable-del-alta-manual-de-borrador-ap) abierta: preservar ID conocido/evitar reintento incierto no garantiza recuperación entre dispositivos o tras cerrar el formulario |
| Horarios configurables del digest | [Q-095](./00-product/OPEN_QUESTIONS.md#q-095--horarios-configurables-del-digest-frente-a-ejecución-diaria) abierta: advertencia de incompatibilidad; pendiente elegir opciones acotadas o scheduler frecuente con infraestructura compatible |
| Q-061: regularización histórica | Mantener reglas vigentes; no cambiar unidad/vigencia histórica para pasar controles |
| Q-062: factura multi-OC | No duplicar el comprobante para simular soporte |
| Q-063 / ADR-013: anticipo sin factura | No crear cuenta puente ni aplicación a CxP por este plan |
| D-128 / Q-076: saldo de OC sin recibir | Mantener como alcance separado |
| Q-057 / D-122: RFI/cambios formales | No presentarlos como variantes de incidencias o adendas ya implementadas |
| Activación y publicación | Sin cambios DB ni deploy en este corte; registrar commit/entorno/flags/smoke por separado cuando se publique |

La entrega coordina los cambios de Guía, Help, `DECISION_LOG`, ADR y preguntas abiertas. Las observaciones de este plan remiten a esos documentos; no sustituyen su resolución ni crean nuevas reglas.

## 8. Registro de ejecución, pruebas y resultados

### Estado al abrir el plan

| Fecha | Lote | Acción comprobada | Evidencia | Resultado / límite |
|---|---|---|---|---|
| 19/11/2026 | Plan | Lectura de instrucciones, módulos y relevamiento; matriz A1–J4 y secuencia P0/P1a documentadas | Este documento y enlaces desde los índices/roadmaps | Plan abierto; no acredita implementación ni despliegue |
| 19/11/2026 | Plan | Validación documental local: 40 IDs únicos A1–J4, enlaces relativos existentes y UTF-8 sin caracteres de reemplazo | Comprobación de texto y `git diff --check` sobre los documentos del plan | Correcto; no es validación del producto |
| 19/11/2026 | P0 | Inventario inicial de hallazgos | §2; baseline local del relevamiento | Correcciones y pruebas por validar |
| 19/11/2026 | P1a | Alcance documental y OC compartible definido para seguimiento | §3–§6 | Implementación, piloto y resultados por validar |

### Evidencia local posterior al baseline

Las filas de apertura anteriores conservan el estado inicial. Las siguientes registran avance comprobado sobre el árbol de trabajo con cambios previos; no son evidencia de despliegue y no deben sumarse como suites independientes cuando se solapan.

| Lote | Cambio / comprobación | Resultado y límites |
|---|---|---|
| Baseline estático | Typecheck de services, AI, report-pdf y web; lint de paquetes y web | 4 typechecks + 2 lint aprobados. Ejecutados sobre árbol con cambios previos, no HEAD limpio. No build ni DB. `pnpm` quedó bloqueado por Corepack/DNS; se usaron binarios instalados sin instalar dependencias |
| B1 OC individual | Proyección explícita de datos comerciales, identidades scoped, ruta autenticada, renderer existente y revisión/descarga/share nativo | 5 tests de servicio + 3 de ruta + 3 de PDF aprobados. Typecheck services/web/report-pdf y lint de 10 archivos B1 aprobados. Sin smoke autenticado de navegador ni prueba en dispositivo físico |
| B1 PDF visual | Fixtures sintéticas de 2 y 110 renglones, texto largo, estado y paginación | Renderer real y revisión Poppler de documento de 2 páginas y cierre de documento de 7: texto/renglón final/totales legibles, sin solapes. No se enviaron documentos externos |
| P0-08 READ compras | Filtros y `take` máximo 30 en consulta, count del mismo tenant/empresa/obra en `RepeatableRead`, pendientes acotados a 2 × 10; guards, dinero y orden conservados | 9 pruebas nuevas de búsqueda; tanda de búsqueda + READ + zero-trust: 25 aprobadas. Fixtures/mocks; no consulta SQL real ni medición de rendimiento en producción. El límite de raíces conserva hidratación de relaciones necesaria para guards |
| A2 backend | Extensión compatible del proveedor, preview efímero, permiso AP/empresa/obra, flags, validación de archivo/JSON y ruta GET/POST | Servicio 11/11, ruta HTTP 8/8 y extractor 9/9 aprobados después de ajustar precisión de tasas. Sin llamadas reales, DB ni red. Tanda previa de extractor/provider/orquestación/env: 34 aprobadas; se solapa con la validación posterior del extractor |
| A2 formulario/recuperación | Preview revisable, aplicar al formulario, guardar por alta DRAFT vigente y conservar el ID ante fallo de adjunto/refresco | 10 tests offline de prefill, alta y reintento aprobados. Respuesta incierta bloquea repetición y dirige al listado. Sin almacenamiento configurado no se declara original conservado. Sin prueba con documentos reales ni sesión de producción |
| P0 horarios/entrega | Aviso de próxima revisión/horarios compatibles sin alterar D-114; documentación diaria de reportes; fallos por tenant visibles en runner y labels de aceptación | Pruebas locales incluidas en consolidado inferior. No cambia cron/plan Vercel; Q-095 y recuperación durable siguen abiertos |
| Guía/Help | §9.2, §12.2, horarios y aceptación del correo; fichas de lectura de comprobante y PDF individual relacionadas con ayuda existente | 31 pruebas existentes de catálogo/integridad/búsqueda aprobadas. Lint focalizado de 4 catálogos y `git diff --check` aprobados. Las búsquedas «leer comprobante», «pdf para proveedor» y «resumen no llega» devuelven primero la ficha correspondiente |
| Validación consolidada local | Revisión integrada de los lotes, fixtures/fakes y renderer PDF | **413 tests únicos aprobados:** services 192 + cron 18 + PDF 21 + web 104 + Flight AP 3 + HTTP preview 8 + AI 42 + knowledge 25. Las tandas anteriores están incluidas o se solapan: no sumarlas otra vez. Reejecución HTTP 8 en ubicación final aprobada |
| Cierre AI/estático | Índice regenerado tras la corrección final de módulo OC; verificación de vigencia, knowledge, últimos componentes UI y tipos web | **620 chunks**, hash de fuente con prefijo `8abfb8cb2b49`; freshness correcta y knowledge **25/25**. Lint de los 2 componentes web finales y `tsc --noEmit --incremental false` de web: exit 0. Las 25 pruebas knowledge ya forman parte de las 413; lint/tipos/freshness son comprobaciones aparte |
| Build directo | Next sin usar el script raíz que incluye migraciones; entorno de proceso con DB/proveedor local no operativo, AI apagada y valores de fixture | **No aprobado:** fallo DNS `ENOTFOUND fonts.googleapis.com` y `EPERM` al crear `.next/server/app/(app)/contabilidad/asientos`. No se reportó error TypeScript, pero eso no demuestra que el build completo pase. No se modificaron `.env` ni se aplicaron migraciones |

Comandos de validación reproducibles ejecutados:

| Alcance / directorio | Comando | Resultado |
|---|---|---|
| Baseline; raíz | `.\node_modules\.bin\tsc.cmd --noEmit --incremental false -p <paquete>/tsconfig.json` para `packages/services`, `packages/ai`, `packages/report-pdf` y `apps/web` | 4 exit 0 |
| Baseline; raíz | `.\node_modules\.bin\eslint.cmd packages/services packages/ai packages/report-pdf` | Exit 0 |
| Baseline; `apps/web` | `..\..\node_modules\.bin\eslint.cmd . --max-warnings 0` | Exit 0 |
| B1; `packages/services` | `node --import tsx --test src/procurement/purchase-order-document.test.ts` | 5 aprobadas |
| B1; `apps/web` | `node --import ../../packages/services/node_modules/tsx/dist/loader.mjs --test features/procurement/lib/purchase-order-document-route.test.ts` | 3 aprobadas |
| B1; `packages/report-pdf` | `node --import tsx --test src/purchase-order-pdf-export.test.tsx` | 3 aprobadas |
| P0-08; `packages/services` | `node --import tsx --test src/procurement/procurement-search.test.ts src/ai/read-only.test.ts src/ai/zero-trust-access.test.ts` | 25 aprobadas |
| A2; `packages/ai` | `node --import tsx --test src/document-extraction/supplier-invoice-document.test.ts` | 9 aprobadas después del ajuste de precisión |
| A2; `packages/services` | `node --import tsx --test src/ap/supplier-invoice-document-preview.test.ts` | 11 aprobadas |
| A2; `apps/web` | `node --import ../../packages/services/node_modules/tsx/dist/loader.mjs --test features/ap/lib/supplier-invoice-document-route.test.ts` | 8 aprobadas en ubicación final |
| Help; `apps/web` | `node --import ../../packages/services/node_modules/tsx/dist/loader.mjs --test features/help/lib/catalog-integrity.test.ts features/help/lib/catalog.test.ts features/help/lib/search-audit.test.ts features/help/lib/search-probe.test.ts features/help/lib/search-safety.test.ts` | 31 aprobadas |
| Help; `apps/web` | `..\..\node_modules\.bin\eslint.cmd features/help/lib/articles/finance.ts features/help/lib/articles/planning-procurement.ts features/help/lib/articles/control.ts features/help/lib/articles/concepts-reports.ts --max-warnings 0` | Exit 0 |
| Build; `apps/web` | `node node_modules/next/dist/bin/next build` con entorno aislado de fixture y sin script de migración | Exit 1; DNS de fuentes y permiso de carpeta `.next` |

El intento inicial de lint de archivos web desde la raíz los encontró ignorados; no se contó como validación y se repitió desde `apps/web` con su configuración, con resultado correcto. El `build` raíz incluye pasos de migración y no se ejecutó; la prueba posterior usó Next directamente con el resultado fallido registrado arriba.

Agregar una fila por lote comprobado con: archivos/commit, entorno, comandos o caso manual, cantidad de pruebas cuando aplique, resultado y limitaciones. **No reemplazar un resultado fallido por “pendiente”**: registrar el fallo y su resolución posterior. Un test omitido, bloqueado por infraestructura o no ejecutado debe indicarse como tal.

### Checklist de cierre de esta entrega

- [x] P0-01 a P0-08 revisados; cada uno con resolución local o limitación explícita. Esto no cierra infraestructura, scheduler de producción ni decisiones pendientes.
- [x] Alcance real de P1a y capacidades que permanecen pendientes identificados.
- [x] Pruebas locales pertinentes y revisiones de permisos/invariantes con resultado registrado; smoke/piloto real pendientes.
- [x] Tipos/lint verificados y limitación concreta del build informada; build no aprobado.
- [x] Guía y Help alineados con cambios efectivamente visibles; refresco de knowledge AI se registra aparte (D-090).
- [x] Índice AI regenerado/verificado: 620 chunks, prefijo de hash `8abfb8cb2b49`, knowledge 25/25.
- [x] Piloto y medición real identificados como pendientes; no se atribuye ahorro ni calidad de extracción sobre documentos reales.
- [x] Entrega expresamente local sin publicación; smoke autenticado y piloto siguen pendientes.

## 9. Refinamiento UX/UI autorizado antes de ampliar canales (19/11/2026)

Owner autorizó completar la experiencia del primer paquete antes de continuar con WhatsApp/audio u otras categorías. Se mantiene el alcance A2/B1 y el piloto deshabilitado por defecto; no cambia DB, dependencias ni decisiones financieras.

### Recorridos y cambios

| Punto del proceso | Cambio implementado en código |
|---|---|
| Alta de factura de empresa/obra | Elección **Carga manual / Desde un comprobante** dentro del formulario existente; la opción asistida depende de capacidad y almacenamiento. La carga contra OC conserva su circuito. Cambiar de entrada antes de aplicar conserva archivo y datos manuales |
| Archivo | Guía específica de tipos y 3 MiB, cámara existente en celular, rechazo explicado con salida manual. Seleccionar no inicia lectura. Original en pestaña aparte, sin abandonar el formulario; no hay conversión HEIC ni compresión automática |
| Lectura | Resumen de proveedor/CUIT/referencia/total y observaciones primero; detalle completo desplegable con renglones en tarjetas, sin tabla de ancho fijo |
| Lectura incompleta | Fechas, descripción, cantidad, precio, IVA, descuento e IIBB desconocidos se conservan como null/vacío. **Usar datos y completar** permite completarlos; no asume ceros ni valores fiscales habituales. Impedimentos de tipo/moneda, impuestos no representables identificados y diferencias comprobables de importes bloquean el prellenado |
| Completar y revisar | Pendientes con acceso al campo, proveedor manual y partida/tipo de costo en obra, selección explícita de precios con/sin IVA. Totales **Por completar** cuando faltan importes. Confirmación de comparación contra el original, invalidada al modificar datos. Se comprueba C/E antes de que el envío habitual normalice IVA |
| Guardar y recuperar | Borrador y original; mensaje de éxito. Foco en el error/resultado y reintento de adjunto sobre ID conocido. Resultado incierto sigue dirigido al listado. No hay nueva garantía de idempotencia durable |
| PDF de OC | Estado **PDF listo para revisar**, nombre del archivo, información secundaria desplegable, acciones con tamaño táctil y **Cerrar**. Panel con scroll y altura dinámica; descarga/share no cambian estado ni acreditan envío |
| Adaptación y accesibilidad | Una columna en celular, campos numéricos asistidos de 16 px en móvil, controles principales de al menos 44 px, selección por teclado, labels, foco tras lectura/aplicación/error, modales con altura dinámica y texto largo que puede quebrarse |

### Validación de este refinamiento

Las pruebas de eventos de componentes se ejecutan con fronteras simuladas; verifican flujo y errores, **no** un render visual de navegador. No se abrió localhost ni se desplegó el código. El fallo de build documentado en §8 sigue sin resolución acreditada; no se repite como si hubiese pasado.

| Verificación local de UX | Resultado |
|---|---|
| Servicio de preview: autorización, formatos, datos ausentes, C/E, importes y cabecera verificable aun con renglones incompletos | 14/14 pruebas, sin DB ni llamadas reales |
| Web AP + interacción financiera/compras + ruta PDF | 56/56; incluye 5 pruebas de eventos de componentes para revisión parcial, confirmación invalidada, cancelación/resultado tardío, campos vacíos y recuperación del mismo ID |
| Uploader y Help | 2/2 uploader + 31/31 catálogo/búsqueda/integridad. La reejecución adicional de las 5 de UI está incluida en las 56, no se suma |
| Extractor y knowledge | 9/9 extractor + 25/25 knowledge; sin proveedor real |
| Total de pruebas distintas en este refinamiento | **137 aprobadas**, sin omitidas. No sumar las tandas repetidas ni las 413 del corte anterior |
| Tipos/lint | Web y services con `tsc --noEmit --incremental false`: exit 0. Lint focalizado de componentes/helpers/tests/Help y servicio: exit 0, sin advertencias |
| Documentación AI | Índice regenerado: **623 chunks**, prefijo de hash `d468a2c1b3d2`; `check-docs-index` correcto |
| Integridad del cambio | `git diff --check` correcto; sin cambios en schema/dependencias/lockfile. No migrations, commit, push, deploy, activación ni env real |

Comandos de la tanda principal web (desde `apps/web`): `node --import ../../packages/services/node_modules/tsx/dist/loader.mjs --test "features/ap/lib/*.test.ts" features/finance/lib/financial-interactions.test.ts features/procurement/lib/procurement-interactions.test.ts features/procurement/lib/purchase-order-document-route.test.ts`. Servicio (desde `packages/services`): `node --import tsx --test src/ap/supplier-invoice-document-preview.test.ts`. Extractor/knowledge (desde `packages/ai`): `node --import tsx --test src/document-extraction/supplier-invoice-document.test.ts "src/knowledge/*.test.ts"`. Catálogos Help: los cinco archivos indicados en §8. Uploader: `features/documents/lib/client-upload-document.test.ts`.

En la primera comprobación, TypeScript detectó la fixture anterior sin `reviewReasons` y lint detectó tipos `any` en el arnés nuevo de eventos. Se corrigieron las fixtures/tipos y las comprobaciones posteriores pasaron; no se silenció ninguna regla. Estos fallos de desarrollo no representan llamadas ni cambios sobre datos operativos.

### Recorrido de aceptación pendiente en portal

Una vez publicado y habilitado para un piloto acordado, verificar en escritorio (1280 px), celular (360–390 px) y tablet (768 px), con usuario/empresa/obra autorizados:

1. Función deshabilitada: alta manual y facturación contra OC conservan su comportamiento.
2. Elegir **Desde un comprobante**, subir PDF o tomar foto: no debe llamar a IA hasta **Leer comprobante**. Revisar foto de varias líneas, total y bordes legibles; HEIC o archivo demasiado grande debe ofrecer salida manual.
3. Cancelar y reintentar lectura; un resultado tardío o de otro archivo no debe aplicar datos. Cambiar a manual conserva archivo y datos previos.
4. Lectura parcial: revisar resumen, abrir/cerrar detalle, abrir el original en otra pestaña y volver sin perder el formulario. Completar IVA/descuento/IIBB ausentes con valores explícitos, incluido cero.
5. En empresa, no exigir EDT. En obra, enlazar pendientes a proveedor/fechas/partidas/tipos de costo. Los desplegables y el teclado deben permanecer dentro del diálogo, sin scroll horizontal de la página.
6. Comparar total real con leído/calculado; confirmar revisión, editar un valor y comprobar que la confirmación deja de estar vigente. C/E con IVA no debe silenciar una discrepancia en la carga asistida.
7. Guardar una única vez. Con falla controlada de adjunto, recuperar el mismo borrador; con respuesta incierta, revisar el listado. Estos casos deben ensayarse en un entorno acordado, sin provocar fallos en operaciones reales.
8. Preparar PDF de una OC, revisar estado/importes, descargar y cerrar. En dispositivo compatible, probar share hacia un destino de prueba autorizado; comprobar el envío en la app elegida. No se realizó ningún envío en este refinamiento.

Siguiente paso recomendado: cerrar build y realizar este recorrido con documentos representativos antes de habilitar otro canal. Las 40 oportunidades de §4 conservan su estado de backlog o parcial; este refinamiento no incorpora funcionalidades de las otras categorías.

### Continuación en segundo plano — 19/11/2026

- Se verificó la fuente Inter local: SHA-256 `693b77d4f32ee9b8bfc995589b5fad5e99adf2832738661f5402f9978429a8e3`, coincidente con su procedencia documentada. El layout ya utiliza `next/font/local`.
- Se ejecutó una única comprobación adicional con `node node_modules/next/dist/bin/next build` desde `apps/web`, con configuración de prueba del proceso, sin invocar migraciones ni abrir navegador o ventanas interactivas.
- **Resultado: exit 1.** Webpack informó `EPERM: operation not permitted, mkdir 'C:\Dev\bloqer-v2\apps\web\.next\server\app\api\reports\contabilidad'`. Este intento no informó un fallo de Google Fonts; la compilación completa sigue sin aprobarse. El error no permite atribuir por sí solo la causa a ACL, antivirus o sandbox.
- No se modificaron permisos del sistema ni se repitió el build tras ese fallo. Las 137 pruebas de §9 corresponden a la ejecución anterior; no se reejecutaron ni se suman otra vez. La inspección visual autenticada, el piloto y la publicación continúan pendientes.
- Preferencia operativa del Owner: continuar con comandos y procesos en segundo plano, sin tomar control de su escritorio o navegador ni abrir ventanas. No repetir solicitudes de aprobación que la aplicación haya invalidado.

Prioridad siguiente: resolver la ejecución del build y comprobar el flujo en un entorno de prueba antes de activar la lectura documental. Aprovechar Playwright ya instalado para recorridos automáticos en CI ([documentación oficial](https://playwright.dev/docs/ci)); evaluar después Sentry para errores/rendimiento ([Next.js](https://docs.sentry.io/platforms/javascript/guides/nextjs/)). Para recuperación de tareas y avisos, evaluar Inngest ([documentación](https://www.inngest.com/docs)) junto al diseño pendiente de outbox e idempotencia: el proveedor no resuelve esas garantías por sí solo. Son recomendaciones para otro lote, sin instalación ni aprobación implícita de dependencias/arquitectura. WhatsApp y audio conservan su posición posterior al piloto.

## 10. Referencias canónicas y trazabilidad

### Entrega autorizada y siguiente etapa técnica — 19/11/2026

Owner autorizó validar, compilar, verificar, hacer commit/push y continuar. Se prepara la entrega sobre `main` vigente (`63e17849`), preservando las NC/ND y exportaciones ya integradas; no se vuelve a publicar el árbol antiguo de `codex/pruebas` sobre `main`.

La siguiente etapa técnica incorpora compilación de producción y nueve pruebas públicas de navegador en CI, usando Playwright existente. Se comprueban tres tamaños, fuentes, teclado y barreras de acceso. No agrega dependencias, DB ni un proveedor nuevo. El piloto documental y los recorridos autenticados siguen separados; este refuerzo no equivale a la etapa de WhatsApp oficial.

La corrida local amplia detectó once fallos del arnés `fiscal-note-actions.test.ts`: los actions AP incorporaron el helper real de recuperación del borrador y el arnés no resolvía ese import. Se incorpora la dependencia real a la fixture, conservando las aserciones y los servicios simulados; no se omiten casos ni se debilitan controles. La validación final y el build se registran en los checks del commit enviado.

La primera corrida Linux del PR #16 aprobó lint, tipos y todas las suites unitarias del monorepo, pero detuvo la entrega por un índice AI obsoleto. El manifiesto incluía los saltos CRLF del checkout Windows en sus hashes y tamaños. Se normalizan a LF antes de calcularlos y se agregan regresiones con ambos formatos y ediciones reales: el formato del checkout no invalida el índice, pero un cambio de contenido sí. Se regenera el índice con el generador existente; no se elimina el control de CI.

El intento de trasladar `.next` fue denegado y la copia aislada no logró enlazar dependencias; no se alteraron ACL ni controles del sistema. La compilación de entrega se ejecuta en el runner Linux de CI. Un resultado remoto correcto no demuestra una reparación del bloqueo local. El alcance actual mantiene la lectura asistida deshabilitada por defecto y no incluye activación ni migración en producción.

- [Documentos](./02-modules/DOCUMENTS.md), [notificaciones](./02-modules/NOTIFICATIONS.md), [OC y recepciones](./02-modules/PURCHASE_ORDERS_AND_RECEIPTS.md), [gastos/facturas/pagos](./02-modules/EXPENSES_AND_PAYMENTS.md).
- [Decisiones](./00-product/DECISION_LOG.md): D-053, D-054, D-090, D-105/D-106, D-108, D-111, D-114, D-118, D-128, D-130 y D-145 según el flujo.
- [Roadmap AI](./BLOQER_AI_ROADMAP.md), [arquitectura AI](./BLOQER_AI_ARCHITECTURE.md), [Change Impact Policy](./CHANGE_IMPACT_POLICY.md).
- [ADR-019](./08-architecture/ARCHITECTURE_DECISION_RECORDS.md#adr-019--lectura-asistida-efímera-de-comprobantes-y-documento-individual-de-oc): límite técnico del corte implementable sin nuevas dependencias/persistencia ni escritura conversacional.
- [Service layer](./08-architecture/SERVICE_LAYER.md), [aislamiento tenant](./08-architecture/TENANT_ISOLATION_MODEL.md), [jobs](./08-architecture/BACKGROUND_JOBS_ARCHITECTURE.md), [notificaciones](./08-architecture/NOTIFICATIONS_ARCHITECTURE.md), [pruebas](./08-architecture/TESTING_STRATEGY.md).
- Relevamiento del 19/11/2026: las categorías e IDs A1–J4 se preservan en §4. Las capacidades de competidores fueron declaraciones públicas consultadas; no un benchmark con documentación propia ni una decisión de adoptar sus reglas financieras.

Este archivo conserva el seguimiento del primer paquete dentro del repositorio. Las futuras etapas actualizan la matriz y agregan evidencia; no deben borrar el baseline ni convertir el backlog completo en capacidades disponibles.

## 11. Integración y preparación del piloto — 19/11/2026

Owner autorizó continuar con la integración y preparación del piloto propuesto. PR #16 integrado en `main` mediante `895cf09b5a35ae7caf6f11aa850bcd5c72f49422`. Su head `80a0141b` aprobó 2.955 pruebas, lint/tipos, índice de 623 chunks, build de producción y nueve pruebas públicas de Chromium. El despliegue automático del merge se sigue por su estado Vercel; no equiparar el merge con la comprobación del portal o la activación de extracción.

Se incorpora una tanda autenticada independiente con Postgres 16 descartable en CI y las fixtures existentes de documentación. Reutiliza el build y prueba nueve casos en los tres tamaños: login real, carga manual con lectura deshabilitada, descarga de PDF de una OC sintética y cierre de acceso al quitar cookies. La ejecución y su resultado quedan en los checks del PR correspondiente; preparar el arnés no constituye una corrida aprobada.

Este refuerzo no cambia rutas, etiquetas o flujos del producto: sin impacto funcional en Guía/Help/knowledge. No modifica schema, reglas financieras ni dependencias npm. Los servicios externos permanecen deshabilitados en este entorno; no se envían mensajes ni archivos reales.

La primera corrida del PR #17 aprobó las migraciones en una base vacía, pero el seed de documentación falló por FK: `seedFieldScheduleItems` intentaba crear vínculos hacia nodos EDT antes de `seedBudgetAndWbs`. Se corrige el orden del seed existente, sin quitar constraints ni introducir parches SQL. La preparación de fixtures pasa al comienzo de CI para detectar esta clase de error antes del build. Los casos autenticados no se contabilizan como ejecutados en esa corrida fallida.

El control de secretos señaló las contraseñas sintéticas fijas del primer borrador. Se reemplazan por valores aleatorios por ejecución, enmascarados y transmitidos por el entorno del job. Postgres queda ligado a loopback y se detiene al finalizar incluso tras fallos; no se deshabilita el control de secretos ni se modifica ninguna credencial operativa. La entrega se consolida en una rama nueva desde `main`, preservando el borrador anterior sin reescribir su historial.

Para el piloto representativo siguen pendientes: entorno remoto comprobado, cuenta/empresa/obra acordadas, configuración efectiva de IA y almacenamiento, corpus y responsable de revisión. Las variables locales existentes no prueban la configuración de Vercel. La conexión Neon consultada no encontró el proyecto ni el compute de desarrollo; no se creó un proyecto alternativo ni se alteraron datos. Vercel se solicitó como conexión para inspeccionar el entorno en segundo plano.

El checkout local conserva la rama original y sus cambios porque `.git` es de solo lectura en este entorno. La integración remota preserva las entregas previas de `main`; no se hizo reset, limpieza ni sustitución de los cambios locales. P0 distribuido/outbox/Q-093/Q-094/Q-095 y P1b/P1c mantienen los límites y decisiones de §§3 y 7.

## 12. Seguimiento de los diez bloques — 20/11/2026

Los diez bloques son las categorías A–J del relevamiento original, con cuatro oportunidades cada una (§4). Su estado describe esta iniciativa de automatización, no la ausencia de los módulos operativos que Bloqer ya tiene. La secuencia de entrega sigue siendo P0/P1a, después P1b/P1c y los lotes P2/P3.

| # / bloque | Área original | Avance comprobado de esta iniciativa | Próximo paso sugerido |
|---|---|---|---|
| 1 / A | Captura y revisión documental | Factura normal ARS a propuesta revisable implementada e integrada; lectura apagada por defecto. Pruebas aisladas aprobadas; OCR real y guardado/adjunto del piloto pendientes | Comprobar entorno y ejecutar el piloto A2 completo; luego ampliar bandeja, remitos y deduplicación con sus decisiones |
| 2 / B | WhatsApp y comunicaciones operativas | PDF individual de OC integrado; preparación/descarga autenticada aprobadas en CI en tres tamaños. Share real y entrega externa no acreditados | Cerrar B1 en piloto; luego diseñar B2/B3/B4 con número, consentimiento, plantillas y recuperación |
| 3 / C | Avisos relevantes y pendientes | Horarios y significado de aceptación documentados; manejo de fallos del runner probado. Scheduler efectivo y recuperación durable pendientes | Verificar los cron desplegados y resolver Q-095/outbox antes de ampliar avisos |
| 4 / D | Audio y asistente que prepara acciones | Consultas READ acotadas probadas; sin flujo nuevo de audio ni tools WRITE | P1c: elegir audio a SC o parte y mantener revisión/confirmación humana |
| 5 / E | Compras y proveedores | Sin ampliaciones E1–E4 en este corte; los circuitos vigentes se preservan | P2: cotizaciones a matriz y excepciones sobre los contratos actuales |
| 6 / F | Dirección, finanzas y análisis | Sin ampliaciones F1–F4 en este corte | P2: brief de dirección con cifras, alcance y fuentes verificables |
| 7 / G | Obra, planificación y conectividad | Sin ampliaciones G1–G4 en este corte | P2: abastecimiento de próximas semanas; offline/búsqueda/inspecciones por lotes |
| 8 / H | Contratos, cliente y cierre de obra | Sin ampliaciones H1–H4 en este corte | Definir RFI/cambio formal antes de implementar; luego portal/dossier con permisos propios |
| 9 / I | Integraciones, APIs y ecosistema | GitHub/CI operativos. Conexión Vercel instalada; acceso a proyectos pendiente de autorización del equipo al inspeccionar. I1–I4 siguen en backlog | Resolver acceso de Vercel para el piloto; email/API/MCP/fiscal/bancos/BIM en iniciativas posteriores |
| 10 / J | Confiabilidad, datos y adopción | Build, 2.955 pruebas y 18 casos de navegador aprobados; base descartable y credenciales efímeras en CI. Guía/Help disponibles | Medir calidad/costo/tiempo del piloto y cerrar sus límites operativos; cuotas distribuidas y datos maestros siguen separados |

### Evidencia disponible

- PR [#16](https://github.com/simonbravin/bloqer-v2/pull/16) integrado mediante `895cf09b`; PR [#18](https://github.com/simonbravin/bloqer-v2/pull/18) mediante `f12c5cdcf6cc0544ba2111975e6d772991766cff`.
- [CI de #18](https://github.com/simonbravin/bloqer-v2/actions/runs/44663824009): migraciones desde base vacía y seed correctos, lint/tipos, 2.955 pruebas sin fallos/omitidas, índice AI de 623 chunks, build y nueve casos públicos más nueve autenticados. El job E2E de entorno externo quedó omitido por faltar sus secretos y no se cuenta entre los 18 ejecutados.
- Vercel informó despliegue completado para `f12c5cdc` mediante el estado del commit. Eso acredita el resultado reportado por Vercel, no una inspección del alias/entorno ni un piloto real.
- Inspección del 20/11: la conexión Vercel lista el equipo `Simon's projects`, pero la consulta por ID del equipo devuelve cero proyectos; proyecto, alias y deployment responden 404. Se solicitó acceso del equipo mediante el mecanismo oficial de la conexión. No se modificaron flags, credenciales, DB ni datos operativos.
- Se corrigió la documentación de R2: hay cuatro variables obligatorias y `R2_PUBLIC_URL` es opcional. Se documentaron los gates reales de lectura y el [preflight del piloto](./08-architecture/DEPLOYMENT_SMOKE_TEST.md#primer-paquete--preparación-del-piloto-documental), incluido el latch de producción que también alcanza a Preview con `NODE_ENV=production`.

### Próximo corte concreto

1. Confirmar acceso al proyecto Vercel existente, versión/alias y configuración efectiva de IA/R2 y cron, sin copiar secretos ni crear un proyecto alternativo.
2. Registrar entorno, cuenta, empresa/obra, corpus y responsable del piloto; ejecutar el procedimiento de aceptación y medir la tarea completa. Estos datos aún no están acordados y no se sustituyen por fixtures de CI.
3. Cerrar A2/B1/J3/J4 con esa evidencia; mantener visibles P0 distribuido/outbox/Q-093/Q-094/Q-095. Después abrir P1b WhatsApp y P1c audio con un alcance propio.

Esta actualización es de preparación operativa y seguimiento. No incorpora una nueva funcionalidad financiera ni acredita un piloto ejecutado. Cada próximo cierre debe actualizar este registro con resultados, límites y el siguiente paso de los diez bloques.


## 13. Continuación de bloques 1, 9 y 10 — 20/11/2026

La auditoría de publicación confirmó los 174 archivos locales contra main b6bf7b54 y su despliegue Vercel exitoso. Exportaciones, NC/ND y documentación estaban integradas; las referencias locales de Git siguen atrasadas por el acceso de solo lectura a .git. No hay que volver a publicar el árbol antiguo.

Corte en curso: exportación CSV del historial autorizado y comprobación de recuperación del archivo guardado, reutilizando R2, permisos y campos existentes. Restore permanece ARCHIVED → ACTIVE, con el mismo original y auditoría; no equivale a recuperación de un borrado físico. Sin migraciones ni servicios externos nuevos. Guía, ayuda e índice AI deben acompañar el cambio.

Próximos cortes: 1/A, versionado simple que conserve cada original y permita seguir sus revisiones; 9/I, validación del piloto en el entorno existente; 10/J, backup independiente y ensayo de recuperación con alcance y retención acordados. No dar estos puntos por cerrados con una verificación de bytes. Después siguen 2/B WhatsApp, 3/C avisos y 4/D audio, con 5-8 conservados en la matriz de §12.

## 14. Cierre documental y preparación de 2/B y 3/C — 20/11/2026

PR #24 integró exportación CSV y comprobación de bytes mediante main `61768fa5`. CI aprobó 2.978 pruebas unitarias, 22 SQL y 30 recorridos de navegador; Vercel informó producción exitosa `6LBZwhu2DADoyycgdVSBdDQ3CC55`.

El Owner autorizó cerrar los pendientes y seguir con 2/B y 3/C. El nuevo corte 1/A implementa D-146/Q-008: revisiones enlazadas, cada original privado conservado, archivo anterior archivado solo al confirmar el siguiente, navegación autorizada por empresa/obra/entidad y protección frente a reemplazos concurrentes. Incluye una migración aditiva nullable, sin modificar registros históricos. Las revisiones confirmadas se archivan, no se eliminan desde la aplicación. Guía, ayuda e índice acompañan el cambio. Los resultados finales de CI y despliegue se registran en el PR; código preparado no implica migración aplicada.

9/I permanece abierto: esta conexión sigue sin exponer el proyecto Bloqer en Vercel/Neon; no hay cuenta de piloto autenticada disponible para P-01 a P-07. 10/J requiere destino de copia separado, acceso y retención acordada, además de ensayo de restauración aislado de DB y objetos. Ni el versionado ni una lectura correcta de R2 sustituyen ese backup.

2/B puede continuar sobre preparación/descarga/share manual de OC existente. Activar WhatsApp oficial exige cuenta y número del negocio, destino de prueba autorizado, consentimiento y plantillas; no se incorporan suscripciones ni se envían mensajes a terceros automáticamente. 3/C conserva los cron y preferencias existentes; Q-095 y recuperación durable/outbox siguen pendientes de decisión, sin inventar una frecuencia ni afirmar entregas efectivas. Se permite revisar y reforzar las rutas actuales mientras se resuelven esos prerrequisitos.

### Continuación implementable de 2/B y 3/C

- **2/B:** mensaje editable junto al PDF individual de OC, copiar texto y compartir archivo + texto desde el dispositivo. El mensaje no incluye una URL privada, no se persiste como enviado ni modifica el estado de la OC. La prueba de navegador intercepta portapapeles y share: verifica edición, cancelación, reintento y bytes PDF sin contactar destinatarios ni usar el portapapeles real.
- **3/C:** los tres endpoints cron ahora comunican fallos parciales con HTTP 500 y excepciones con un error genérico, siempre sin caché. Un tenant vacío/duplicado/inválido se rechaza sin ampliar la corrida a todas las empresas. Se conservan secreto, horarios y runners actuales. Pruebas de ruta cubren GET/POST, autorización, ámbito, bridge de PDF y fallos sin enviar correos.
- Pendientes operativos: acceso Demo para el piloto, copia independiente con restauración comprobada, número/cuenta WhatsApp oficial y decisión Q-095. No se presentan como resueltos por estos refuerzos. Bloques 4/D a 8/H mantienen el orden y alcance de §12.

## 15. Continuación sin acceso administrativo a Vercel — 21/11/2026

Por indicación del Owner se difiere la reparación del conector Vercel; GitHub y su despliegue automático siguen siendo la vía de publicación. No es requisito para desarrollar ni ejecutar CI aislado.

Corte 1/A y 10/J: recuperación de cargas con archivo/metadata estables al reintentar y acción Completar carga sobre el registro existente cuando faltó confirmar. Se reutilizan permisos, estados, auditoría y servicios; sin migraciones, nuevas dependencias ni escrituras en DB operativa. Incluye pruebas de respuestas perdidas/malformadas, UI de reintento y una foto en SQL descartable con bytes inválidos, recuperación y control de ámbito/procedencia.

Límites: las pruebas de navegador interceptan el transporte; las SQL usan objetos en memoria. No cierran P-01 a P-07 remotos ni acreditan backup independiente. 9/I queda diferido por el Owner. 10/J conserva destino/retención y restauración de copia independiente pendientes. 2/B conserva la preparación manual publicada; WhatsApp oficial requiere cuenta/número y destino de prueba. 3/C conserva los cron publicados; Q-095 sigue abierta. 4/D a 8/H mantienen el orden de §12. Resultados ejecutados se registran en el PR, no se infieren de la presencia de tests.


## 16. Integración de lectura y recuperación de adjunto — 22/11/2026

La restauración aislada quedó integrada en PR #28/main `433a1a57`: pg_dump/pg_restore reales, originales/revisiones/foto sintéticos, integridad y aislamiento aprobados. La [política inicial de respaldo](./08-architecture/BACKUP_RECOVERY_RUNBOOK.md) mantiene proveedores actuales sin contratar servicios nuevos; el backup independiente real sigue pendiente.

Corte 1/A: recorridos autenticados que unen lectura simulada, revisión obligatoria, campos faltantes, invalidación de confirmación al editar, creación real de un borrador en SQL descartable y reintento del adjunto sobre el mismo ID y archivo. También cubren una nota de crédito bloqueada para prellenado de factura normal y conservación del original al volver a carga manual. Se prueban escritorio, tablet y teléfono.

Límite de evidencia: sesión, acción de creación y persistencia de borrador son reales dentro de CI; extracción IA, inicio/PUT/confirmación del adjunto están interceptados. No prueban persistencia remota del archivo ni reemplazan P-01 a P-07 con proveedores reales. El estado final de ejecución se registra en el PR; disponer del test no implica que haya pasado.

2/B conserva PDF + mensaje manual; WhatsApp oficial sigue pendiente de cuenta/número y destinatario de prueba. 9/I continúa diferido, 10/J mantiene backup real pendiente. 4/D y 5/E–8/H conservan su orden.

Durante este corte el Owner aprobó mantener el resumen diario sin nuevos servicios. **3/C: Q-095 resuelta por D-147.** «Hora mínima del resumen» ofrece opciones compatibles con la próxima revisión y conserva visibles los históricos incompatibles. El servidor valida cambios de hora y no reescribe una hora sin cambios cuando se editan otras preferencias. Guía, Help y conocimiento AI acompañan el cambio. No se migran preferencias, se alteran audiencias ni se envían correos al guardar. La programación sigue diaria a las 10:05 UTC; una prueba de configuración no acredita entrega real ni cierra outbox/recuperación durable. Pruebas unitarias cubren autorización, aislamiento, zona horaria, validación y conservación de históricos; navegador comprueba selección y persistencia explícita en CI. Sin schema, dependencias ni proveedores nuevos.

### Verificación local de D-147 — 23/11/2026

Confirmación del Owner ratificada: resumen diario sin nuevos servicios. Se revisó la implementación ya preparada y se ejecutaron las seis pruebas de política del servicio y las tres de vista previa del horario: **9/9 aprobadas**. Typecheck de `packages/services` y `apps/web` aprobado. Índice AI vigente, comprobado con `check-docs-index` (628 chunks). Se agregó el procedimiento posterior al despliegue en `08-architecture/DEPLOYMENT_SMOKE_TEST.md`.

La ejecución usó las dependencias locales con Node porque Corepack no pudo descargar pnpm por falta de resolución de `registry.npmjs.org`. No se instalaron dependencias. Este corte no ejecutó el recorrido autenticado (requiere SQL descartable en CI), no envió correos ni publicó cambios; no acredita entrega efectiva en el portal.

## 17. Cierre de PR #29 y primer flujo de audio - 23/11/2026

**1/A y 3/C:** PR #29 integrado en `main` (`db766fa6`) tras CI aprobada sobre `def6c948`: 3.013 pruebas unitarias, 25 SQL, 3 de recuperación, 15 recorridos públicos y 33 autenticados; lint, tipos, índice y compilación aprobados. Se corrigió sincronización de la prueba con el formato editable decimal y el fin del guardado del adjunto. Vercel informó despliegue exitoso del merge. Esto no acredita recepción real de email ni cierra el piloto documental remoto.

**4/D — elección aprobada Q-096 / D-148:** solicitud de compra desde audio; parte diario diferido. ADR-020 aplica el proveedor y los servicios existentes a una transcripción efímera revisada, propuesta estructurada sin IDs, formulario editable y guardado DRAFT. Sin schema, nuevos estados/eventos, dependencias, servicios o tools WRITE. La capacidad queda apagada por defecto: el proveedor existente puede cobrar consumo de transcripción/generación.

Implementación: grabación de hasta 60 segundos/archivo WebM-MP4-WAV hasta 3 MiB, alternativa de texto, cancelación y descarte de respuestas tardías; permisos de módulo/rol/obra antes del proveedor, límites de cuerpo y cuota compartida. Los desconocidos quedan vacíos, las fechas relativas requieren fecha explícita, elegir partida no borra la propuesta. Aplicarla reemplaza renglones/fecha/notas con aviso. La revisión final se invalida al editar, incluso al revertir; se guarda solo el formulario mediante el servicio canónico y Enviar solicitud permanece separado.

Guía, Help, módulo, decisiones, entorno, roadmap AI y procedimiento de smoke acompañan la entrega. Las pruebas nuevas cubren flag, permisos, formatos/tamaño, salida estructurada, datos incompletos, HTTP, cancelación y revisión. El recorrido autenticado usa IA interceptada y SQL descartable; su resultado final queda en el PR. No equivale a probar el micrófono o la calidad de la transcripción con un proveedor real.

Próximo paso: completar CI del corte 4/D y realizar el piloto medido con un pedido sintético en una obra de ensayo antes de activar la capacidad para usuarios. Después seguir **5/E — Compras y proveedores** (cotizaciones a matriz y excepciones) según §12, conservando el orden 6/F–8/H. **2/B** sigue con PDF/mensaje manual y cuenta/número oficial pendiente; **9/I** diferido por el Owner; **10/J** conserva pendiente copia independiente/restauración real. No marcar como resueltos P-01–P-07, recepción de avisos ni outbox por una prueba simulada.
## 18. Continuación autorizada — 23/11/2026

El Owner pidió integrar el refuerzo de aislamiento del chat y continuar bloque 5. PR #31 integrado en `main` (`6432366e`): historial limpio al cambiar obra/empresa y rechazo de proyecto inaccesible antes del proveedor; CI 45189046039 aprobada, incluidos 57 recorridos de navegador. Audio continúa apagado.

**5/E1 — Cotizaciones a la matriz existente:** implementación de lectura efímera de PDF/imagen con proveedor actual, revisión y correspondencia manual de renglones, cantidades/unidades sin conversión y alta por el servicio de cotizaciones. Se conservan D-118, monedas/FX, vigencia, mínimos de ofertas, segregación y freeze. Campos desconocidos pendientes de completar; comparación de importes en servicio con kernel vigente. El formulario canónico se habilita también en celular. Aplicar no guarda, registrar no adjudica. Original adjuntable después por el flujo existente.

Flag `BLOQER_AI_PROCUREMENT_QUOTE_PREVIEW_ENABLED=false`; sin nuevos servicios, dependencias, campos o migraciones. La publicación del código no autoriza activación ni acredita precisión de IA: el piloto con oferta sintética sigue separado. Pruebas de parser, scopes, HTTP, correspondencias, revisión y persistencia se registran en el PR de esta entrega. **E2** requiere diseño de acceso externo revocable, **E3** cobertura de datos comparables y **E4** diseño de nuevas excepciones; no se declaran implementados con E1.

## 19. Cierre UX de Compras y diseño E2 — 23/11/2026

**5/E1 y UX:** PR #32 integrado en `62bfd712`; PR #33 integrado en `5b19a18172df59dfd38af5d646cf56dbbb0d15b1`. La revisión UX reutiliza componentes y unifica anchos, controles, observaciones, acciones y tablas en solicitudes, cotizaciones, OC y recepciones. CI [45222320967](https://github.com/simonbravin/bloqer-v2/actions/runs/45222320967) aprobó lint, tipos, pruebas unitarias/SQL, restauración aislada, índice, compilación y 68 recorridos de navegador (15 públicos, 53 autenticados; diálogo móvil omitido porque usa página completa). Vercel informó despliegue completo del merge de #33. La sesión autenticada corresponde a CI aislado; no se recuperó la credencial demo del portal ni se acredita inspección manual de pantallas productivas.

**5/E2:** el Owner aprobó Q-097 / D-149 / ADR-021: enlace sin cuenta, válido siete días, revocable, una respuesta por proveedor y revisión de Compras antes de incorporar, con tabla nueva. Implementación de capacidad desactivada por defecto, token hasheado, cookie aislada por invitación, snapshot mínimo, evidencia inmutable e incorporación atómica por el servicio canónico. Sin nuevos servicios ni envíos automáticos. Se añaden migración aditiva, pruebas de política, SQL aislado, recorrido de navegador y guía/Help/índice. Publicación, validación final y piloto se registran con evidencia; el código por sí solo no acredita activación.

Entrega E2 en [PR #34](https://github.com/simonbravin/bloqer-v2/pull/34): consultar allí el commit final, CI y despliegue antes de retomar. Pruebas SQL aisladas verifican dos empresas/tenants, pérdida de permisos, expiración/revocación, cambio de solicitud, respuesta simultánea, carreras e incorporación atómica. El navegador mantenido cubre respuesta/revisión/incorporación y dos empresas abiertas a la vez en el mismo contexto externo. El PR registra el resultado efectivo; no se presume piloto real.

Próximos cortes conservados tras validar e integrar #34: E3 desempeño con datos comparables, E4 excepciones OC-recepción-factura. 6/F-8/H mantienen su orden. 2/B sigue con envío manual; 9/I diferido y 10/J con copia independiente real pendiente. Audio, lectura asistida y enlaces conservan sus flags apagados por defecto y piloto separado.

