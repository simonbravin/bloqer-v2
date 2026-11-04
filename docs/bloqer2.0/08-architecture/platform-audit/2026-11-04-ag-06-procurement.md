# AG-06 — Compras, cotizaciones, órdenes y recepciones

**Estado: corregida y verificada localmente, en el alcance aprobado.** 35 grupos corregidos; cierre parcial formal diferido expresamente por D-128. Verificación automática, SQL y muestra visual final completadas. AG-07 no iniciada. No publicado.

## 1. Encargo, base y autorización

- Campaña global por etapas; en esta fase el Owner pidió auditar, corregir y verificar Compras, esperando autorización antes de avanzar.
- Inicio: 04/11/2026. Rama `codex/pruebas`, HEAD `3407c023eb00dec9d6361e4842af016480b1c813`; revisión final es el árbol local sin commit. Ese HEAD es la última publicación comprobada de AG-00 a AG-04, no estos cambios.
- Se preservaron **149 rutas con cambios previos de AG-05**. La atribución compara hashes con `output/platform-audit/ag-06-2026-11-04/initial-snapshot.json`, no todo el diff contra HEAD. El informe estructurado conserva manifiesto final y aliases de los subreportes; no reabre AG-05 completa.
- Skills: auditoría de plataforma, guía/ayuda operativa, Neon para usar la conexión aislada existente y revisión visual autorizada desde AG-02. Participaron agentes de contratos, datos/seguridad, UX y un verificador independiente; un responsable por archivos durante las correcciones.
- Único destino de escritura de pruebas: compute de desarrollo `ep-curly-math-aptjniho.c-7.us-east-1.aws.neon.tech`, base **bloqer_audit_ag01_20261103**. Guard de identidad efectivo antes de toda fixture. Emails, AI, R2 y proveedores externos deshabilitados; `.env` sin cambios.
- D-125/Q-072: moneda comparable; D-126/Q-073: historial de SC; D-127/Q-074: correlativo de recepción con históricos preservados; D-129/Q-075: nueva aprobación cuando cambia FX. D-128/Q-076 delimita el cierre parcial como desarrollo separado, aprobado expresamente.

## 2. Fuentes y cuatro inventarios

Fuentes: AGENTS, arquitectura/ADR-018 y aislamiento cerrado; módulos [PROCUREMENT](../../02-modules/PROCUREMENT.md), [SC](../../02-modules/PURCHASE_REQUESTS.md), [OC/recepciones](../../02-modules/PURCHASE_ORDERS_AND_RECEIPTS.md) y frontera AP; BUSINESS_RULES BR-PUR-001–025/BR-APR-004/005, STATE_MACHINES, APPROVAL_WORKFLOWS, MONEY_MODEL, COST_FORMULAS, REGISTER_PURCHASE, PURCHASE_TO_PAY y schema/migraciones reales. Se armonizaron los textos de período con el alcance posterior D-078, sin agregar un bloqueo operativo no aprobado.

1. **SC y snapshots.** Documentado en D-044/050/096/126. Implementado en `purchase-request.service`, scope/enrichment/guards y Zod; expuesto por listado, alta, detalle, editar y Actions de la obra. Verificado con 24 SQL distintos y pruebas de contrato/lectura/formulario. Se preservan snapshots históricos y excepción de fecha D-096.
2. **Ofertas y adjudicación por ítem.** D-068/093/118, BR-PUR-024. Servicios quote/award persisten cotización/líneas y OC/líneas, no una capa de repositorios hipotética. Desktop/móvil, matriz y atajo, tipos APU, FX, vigencia y mínimos por ítem. SQL de competencia, lote atómico, payload viejo, rol de proveedor, cancelación/readjudicación e historial.
3. **OC directa y workflow.** Crear/editar → enviar → aprobar/devolver → confirmar; líneas siempre WBS del presupuesto autorizado. Validator/service/kernel → Prisma bajo bloqueo → audit → DTO → invalidación. SQL comprueba padres, numeración entre obras, nota, segregación, FK de adjudicación y D-129.
4. **Recepciones y stock.** Alta/edición borrador → confirmación/anulación, correlativo/idempotencia y depósitos autorizados. Se amplió solo la reversa directa del stock afectado; no se auditó todo Inventario. PostgreSQL real verifica suma de duplicados, tolerancia, reversa agregada y atomicidad; D-104 se repitió en sus tres casos de recepción.
5. **OC → factura.** Preview, borrador automático y carga manual enlazada, resumen/lista/advertencias; validación de padres al crear/editar/emitir. SQL verifica empresa, grafo, moneda, Payable, cantidades repetidas y edición simultánea. La carga manual sin FK de línea conserva su regla y aviso; no se infiere un vínculo por importe/descripción ni se auditan todos los pagos/AP.
6. **Políticas, avisos, hub y consumidores.** Ajustes parciales en configuración, CRUD auditado y locks; notificación/SLA por documento/empresa/usuario activo. Hub SC-only omite consultas de OC/recepción. Consumers: pendientes, detalle/listados, materiales/MO/equipos, cronograma, reportes enlazados y herramientas AI de lectura existentes. Servicios externos reales no ejecutados.
7. **UX y conocimiento.** Patrones AG-02 de confirmación/pending/error, moneda y referencia por ítem, datos opcionales no disponibles y contexto global con obra compartida. Guía §9, ayuda, fuente de fórmulas/estados y siete casos de evaluación incorporados y recuperaciones comprobadas; tests recuperan las reglas desde el índice distribuido sin llamar a un modelo.

Los inventarios completos documentado/implementado/expuesto/probado y trazas por archivo están en `requests-results.json`, `orders-results.json` y `frontend-results.json` bajo el directorio de evidencia. El JSON consolidado mantiene su correspondencia y no suma hallazgos duplicados entre perspectivas.

## 3. Hallazgos y correcciones

35 grupos correctivos y una brecha funcional delimitada por aprobación expresa. Los aliases de trabajo conservan la trazabilidad entre perspectivas; no se cuentan duplicados.

### GA-AG-06-001 — SC: aislamiento en lecturas, mutaciones y vínculos hijos

- **P1; corregido y verificado localmente.** Aliases: REQ-01.
- **Observado:** La obra compartida permitía resolver SC de otra empresa o contar hijos por UUID sin autorizar al padre.
- **Corrección/decisión:** Filtros del documento y comprobación tenant/empresa/obra/ACL antes de leer u operar.
- **Evidencia:** requests-audit-live-first; requests-audit-live-fixture-recheck. Fuentes y casos específicos en los subreportes y suites del registro estructurado.

### GA-AG-06-002 — OC/recepción: empresa del documento y padres coherentes

- **P1; corregido y verificado localmente.** Aliases: orders.company_scope, orders.joined_graph.
- **Observado:** Varias entradas comprobaban obra/tenant pero omitían empresa o consistencia de padres WBS/APU/producto/SC/cotización.
- **Corrección/decisión:** Grafo compartido procurementOrderParentScopeInclude y assertPurchaseOrderRelations en lecturas y operaciones, incluido límite OC→AP.
- **Evidencia:** orders-audit-live-second; platform-audit-live-second. Fuentes y casos específicos en los subreportes y suites del registro estructurado.

### GA-AG-06-003 — Actions de SC/cotizaciones ligadas a la obra real

- **P1; corregido y verificado localmente.** Aliases: AG06-FE-01.
- **Observado:** La obra de la ruta podía diferir del padre del documento enviado a una Action.
- **Corrección/decisión:** Resolver padre y comprobar la obra antes de invocar la mutación e invalidar sus vistas.
- **Evidencia:** frontend-results.json: 74 procurement tests, 16 groups; procurement-actions.test.ts. Fuentes y casos específicos en los subreportes y suites del registro estructurado.

### GA-AG-06-004 — SC/cotización/OC: revalidación dentro del bloqueo y auditoría atómica

- **P1; corregido y verificado localmente.** Aliases: REQ-02, REQ-05, orders.races_and_acl.
- **Observado:** Edición, devolución, anulación, adjudicación y conteos de facturas activas podían usar líneas, estado, proveedor o cobertura anteriores al bloqueo.
- **Corrección/decisión:** Project→Company→SC/OC cuando corresponde; relectura y gates dentro de TX, audit en la misma TX y rechazo de payload viejo.
- **Evidencia:** requests-audit-live-first; orders-audit-live-second. Fuentes y casos específicos en los subreportes y suites del registro estructurado.

### GA-AG-06-005 — Numeración SC/OC por empresa entre obras compartidas

- **P1; corregido y verificado localmente.** Aliases: REQ-04.
- **Observado:** El máximo por empresa se calculaba sin serializar altas de proyectos distintos; SC compartida no resolvía empresa activa.
- **Corrección/decisión:** Bloqueo Company FOR NO KEY UPDATE después de Project y antes de SC/OC; usar empresa autorizada, sin adivinar para contexto global.
- **Evidencia:** requests-audit-live-first; requests-audit-live-fixture-recheck; orders-audit-live-second. Fuentes y casos específicos en los subreportes y suites del registro estructurado.

### GA-AG-06-006 — D-126: devolución e históricos de cotizaciones

- **P1; corregido y verificado localmente.** Aliases: REQ-03, AG06-FE-08.
- **Observado:** Ofertas rechazadas/sustituidas permitían devolución y luego reemplazo de IDs/cantidades o snapshots históricos.
- **Corrección/decisión:** Nunca devolver con historial; históricos DRAFT conservan líneas/cantidades/referencias y permiten cabecera no destructiva, incluso al reenviar.
- **Evidencia:** requests-audit-live-first; frontend-results.json: 74 procurement tests, 16 groups. Fuentes y casos específicos en los subreportes y suites del registro estructurado.

### GA-AG-06-007 — OC directa: impedir reserva de ítems de otra SC

- **P1; corregido y verificado localmente.** Aliases: orders.direct_award_injection.
- **Observado:** updatePurchaseOrder aceptaba purchaseRequestLineId en una OC sin SC y podía bloquear otra adjudicación por índice único.
- **Corrección/decisión:** Rechazar vínculos de adjudicación en OC directa y comprobar los padres de los FKs presentes en las demás órdenes, sin inventar FKs históricos.
- **Evidencia:** orders-audit-live-second; independent review. Fuentes y casos específicos en los subreportes y suites del registro estructurado.

### GA-AG-06-008 — Moneda/FX de cotización, adjudicación y OC

- **P1; corregido y verificado localmente.** Aliases: REQ-06, orders.fx_capture, AG06-FE-06.
- **Observado:** Cambiar moneda podía reutilizar otro FX; adjudicación dejaba totalAmountArs cero y formularios no exponían o conservaban el FX.
- **Corrección/decisión:** Parser FX6 canónico, carga manual, actualización de total ARS al editar y copia de moneda/FX de la oferta adjudicada; UI y DTO nativos.
- **Evidencia:** requests-audit-live-first; orders-audit-live-second; frontend-results.json: 74 procurement tests, 16 groups. Fuentes y casos específicos en los subreportes y suites del registro estructurado.

### GA-AG-06-009 — D-125: referencia, varianza y saldo comparables

- **P1; corregido y verificado localmente.** Aliases: orders.currency_baseline, AG06-FE-07.
- **Observado:** Importes originales de distintas monedas se comparaban o sumaban como si fueran equivalentes, incluso al copiar precios APU.
- **Corrección/decisión:** Moneda/unidad demostrables; NO_BUDGET_BASELINE y nota vigente si no son comparables; saldo null con aviso, sin subtotal falso ni FX inferido.
- **Evidencia:** orders-audit-live-second; frontend-results.json: 74 procurement tests, 16 groups; knowledge acceptance. Fuentes y casos específicos en los subreportes y suites del registro estructurado.

### GA-AG-06-010 — Insumo APU explícito, naturaleza y cantidades exactas

- **P2; corregido y verificado localmente.** Aliases: orders.explicit_apu, orders.nature_under_lock.
- **Observado:** El hint LAB/EQ quedaba detrás de MATERIAL; inferencia de naturaleza usaba un preview y la necesidad física pasaba por Number.
- **Corrección/decisión:** Respetar APU explícito, Decimal para cantidades e inferencia vigente dentro del Project lock, conservando costType explícito.
- **Evidencia:** orders-audit-live-second; orders-apu-lock-regression-live. Fuentes y casos específicos en los subreportes y suites del registro estructurado.

### GA-AG-06-011 — SC: DTO serializado y estimado completo en moneda nativa

- **P2; corregido y verificado localmente.** Aliases: REQ-07.
- **Observado:** El spread de relaciones exponía Decimal; estimados rotulaban USD como ARS, omitían líneas sin base o reemplazaban snapshots nulos por precios actuales.
- **Corrección/decisión:** DTO explícito, ISO por línea y estimado solo con base completa/comparable; no sustituir un snapshot enviado faltante.
- **Evidencia:** requests-audit-live-first; requests-audit-live-fixture-recheck; frontend-results.json: 74 procurement tests, 16 groups. Fuentes y casos específicos en los subreportes y suites del registro estructurado.

### GA-AG-06-012 — Entradas parciales, fechas y precisión

- **P2; corregido y verificado localmente.** Aliases: REQ-10.
- **Observado:** Regex aceptaba fechas imposibles, defaults reescribían moneda omitida y motivos en blanco pasaban el schema.
- **Corrección/decisión:** Fechas calendario, trim, FX6 y updates parciales; histórico sin fecha conserva la excepción documentada D-096.
- **Evidencia:** validators; requests-audit-live-first. Fuentes y casos específicos en los subreportes y suites del registro estructurado.

### GA-AG-06-013 — Readjudicación e historia de punteros de cobertura

- **P2; corregido y verificado localmente.** Aliases: REQ-08.
- **Observado:** Cachés de adjudicaciones anuladas bloqueaban readjudicar o se limpiaban en solicitudes ajenas y estados terminales.
- **Corrección/decisión:** Recuperar solo los vínculos válidos del documento, conservar OC históricas y atomizar lotes/criterio D-118 por ítem.
- **Evidencia:** requests-audit-live-first. Fuentes y casos específicos en los subreportes y suites del registro estructurado.

### GA-AG-06-014 — Aprobación: nota obligatoria y actor habilitado

- **P1; corregido y verificado localmente.** Aliases: orders.approval_note, orders.approval_eligibility, AG06-FE-12.
- **Observado:** Aprobar recalculaba varianza pero ignoraba nota faltante; UI solo miraba rol y omitía segregación/alto nivel.
- **Corrección/decisión:** Exigir justificación vigente y exponer elegibilidad canónica del servicio; explicar la intervención de otro aprobador.
- **Evidencia:** orders-audit-live-second; frontend-results.json: 74 procurement tests, 16 groups. Fuentes y casos específicos en los subreportes y suites del registro estructurado.

### GA-AG-06-015 — Recepción: cantidades agregadas, tolerancia y depósito

- **P1; corregido y verificado localmente.** Aliases: receipts.aggregate_and_warehouse, AG06-FE-05.
- **Observado:** Filas repetidas se validaban separadas y productos podían confirmarse sin entrada de stock por falta de depósito; UI bloqueaba tolerancia válida.
- **Corrección/decisión:** Sumar por línea OC, exigir depósito autorizado para productos y revalidar su elegibilidad; UI conserva tolerancia del servicio y explica servicios sin stock.
- **Evidencia:** orders-audit-live-second; frontend-results.json: 74 procurement tests, 16 groups. Fuentes y casos específicos en los subreportes y suites del registro estructurado.

### GA-AG-06-016 — Reversa de recepción sin stock negativo ni movimientos ajenos

- **P1; corregido y verificado localmente.** Aliases: receipts.stock_reversal.
- **Observado:** Dos ingresos de cuatro se comprobaban individualmente con cinco disponibles y su reversa podía dejar negativo; se tocaban movimientos ajenos o de consumo.
- **Corrección/decisión:** Agrupar producto/depósito, bloquear y comprobar el total, revalidar recibo y revertir solo IN propios; rollback íntegro si falta stock.
- **Evidencia:** orders-audit-live-second. Fuentes y casos específicos en los subreportes y suites del registro estructurado.

### GA-AG-06-017 — Idempotencia de recepción y notas por línea

- **P2; corregido y verificado localmente.** Aliases: REQ-09, receipts.replay.
- **Observado:** Replay ignoraba notas, podía colisionar por delimitadores o fallar después de completar la OC y en creates concurrentes con la misma key.
- **Corrección/decisión:** Fingerprint de tuplas normalizadas incluyendo notas; resolver replay válido antes de elegibilidad/reservas y otra vez bajo lock; un ID/efecto/número.
- **Evidencia:** orders-audit-live-second; idempotency pure tests. Fuentes y casos específicos en los subreportes y suites del registro estructurado.

### GA-AG-06-018 — D-127: identidad de recepciones nuevas e históricas

- **P2; corregido y verificado localmente.** Aliases: receipts.number, AG06-FE-15.
- **Observado:** No había número propio y varias recepciones de una OC mostraban el mismo código de orden.
- **Corrección/decisión:** Campo number Int? e índice por tenant/empresa/número; RC-NNN para altas nuevas serializadas, UUID histórico preservado, sin reutilización ni backfill.
- **Evidencia:** orders-audit-live-second; frontend-results.json: 74 procurement tests, 16 groups; migration isolated; visual-final.json: RC-001 and RC-002 confirmed. Fuentes y casos específicos en los subreportes y suites del registro estructurado.

### GA-AG-06-019 — Política de compras: validación de parches y atomicidad

- **P1; corregido y verificado localmente.** Aliases: root-policy.
- **Observado:** Coerción de booleanos, Number y validación de un patch aislado podían habilitar flags o dejar límites incompatibles al editar simultáneamente; faltaba auditoría atómica.
- **Corrección/decisión:** Zod canónico/Decimal, validar estado fusionado después de lock de Company, preservar omitidos, registrar before/after en la misma TX e invalidar consumidores.
- **Evidencia:** platform-audit-live-second; company-procurement-settings.test.ts. Fuentes y casos específicos en los subreportes y suites del registro estructurado.

### GA-AG-06-020 — Audiencia de avisos y SLA por empresa/usuario activo

- **P1; corregido y verificado localmente.** Aliases: root-notifications.
- **Observado:** Owner de otra empresa en obra compartida o usuario inactivo podían recibir avisos; ejecución manual recorría otras empresas.
- **Corrección/decisión:** Filtrar pertenencia activa, estado User, empresa del documento y ACL de obra antes de campana/email; acotar contexto manual sin limitar cron global autorizado.
- **Evidencia:** platform-audit-live-second. Fuentes y casos específicos en los subreportes y suites del registro estructurado.

### GA-AG-06-021 — Hub Compras: permisos y significado de indicadores

- **P2; corregido y verificado localmente.** Aliases: AG06-FE-09, root-hub.
- **Observado:** Rol SC-only consultaba OC/recepciones o veía accesos inaccesibles; etiquetas confundían cualquier oferta con suficiencia y cobertura total.
- **Corrección/decisión:** Gates PROJECTS/PROCUREMENT, canViewOrders y consultas omitidas para secciones ocultas; Sin cotizaciones recibidas y Adjudicadas con significado explícito.
- **Evidencia:** platform-audit-live-second; frontend-results.json: 74 procurement tests, 16 groups. Fuentes y casos específicos en los subreportes y suites del registro estructurado.

### GA-AG-06-022 — OC y facturación: moneda nativa y cálculo no disponible

- **P2; corregido y verificado localmente.** Aliases: root-ap-currency, AG06-FE-11.
- **Observado:** El resumen rotulaba USD como ARS o sumaba documentos incompatibles; lecturas podían incorporar NC/ND como cobertura física.
- **Corrección/decisión:** Moneda explícita, FX6/amount2 serializados y rechazo del cálculo mezclado conservando documentos originales; NC/ND no alteran cobertura física por D-115.
- **Evidencia:** platform-audit-live-second; frontend-results.json: 74 procurement tests, 16 groups. Fuentes y casos específicos en los subreportes y suites del registro estructurado.

### GA-AG-06-023 — OC→AP: padres financieros y cabecera manual

- **P1; corregido y verificado localmente.** Aliases: root-ap-scope.
- **Observado:** Preview/generación omitían el grafo WBS/APU; alta/edición/emisión manual podían vincular OC de otra empresa en obra compartida.
- **Corrección/decisión:** Reutilizar grafo canónico y validar tenant/empresa/obra/proveedor/moneda antes y dentro de la escritura; validar facturas y Payable antes de resumir.
- **Evidencia:** platform-audit-live-second; independent review. Fuentes y casos específicos en los subreportes y suites del registro estructurado.

### GA-AG-06-024 — Borrador AP desde recepción: sumar cantidades y conservar origen

- **P1; corregido y verificado localmente.** Aliases: root-ap-draft.
- **Observado:** Un Map sobrescribía renglones repetidos y actualizar un borrador de otra moneda podía reinterpretar sus precios nativos.
- **Corrección/decisión:** Sumar por línea OC, comprobar el grafo del recibo y rechazar sobreescritura incompatible. Carga manual sin FK de línea conserva su aviso informativo y su permiso vigente.
- **Evidencia:** platform-audit-live-second. Fuentes y casos específicos en los subreportes y suites del registro estructurado.

### GA-AG-06-025 — Edición parcial AP concurrente: no mezclar validación vieja

- **P1; corregido y verificado localmente.** Aliases: root-ap-concurrency.
- **Observado:** Dos ediciones podían combinar proveedor anterior con OC retargeteada después de validar el snapshot original.
- **Corrección/decisión:** Claim DRAFT con updatedAt exacto y audit en la misma TX; rechazar el patch desactualizado y conservar la edición ganadora.
- **Evidencia:** platform-invoice-concurrency-live; independent review. Fuentes y casos específicos en los subreportes y suites del registro estructurado.

### GA-AG-06-026 — Invalidación de todos los consumidores de compras

- **P2; corregido y verificado localmente.** Aliases: AG06-FE-02.
- **Observado:** Mutaciones no refrescaban detalle, tableros, materiales/MO/equipos, pendientes o cronograma ligados.
- **Corrección/decisión:** Helper de revalidación común por obra/documento y actualización de consumidores reales, incluidas políticas.
- **Evidencia:** frontend-results.json: 74 procurement tests, 16 groups; procurement-actions.test.ts. Fuentes y casos específicos en los subreportes y suites del registro estructurado.

### GA-AG-06-027 — Formularios: doble envío, fallas de transporte y datos conservados

- **P2; corregido y verificado localmente.** Aliases: AG06-FE-03, AG06-FE-04.
- **Observado:** Clicks antes del rerender duplicaban intentos, rechazos de red escapaban y callbacks action de React19 vaciaban formularios rechazados.
- **Corrección/decisión:** Mutex síncrono y transición compartida, error recuperable, onSubmit sin reset tras rechazo y diálogos que no cierran mientras procesan.
- **Evidencia:** frontend-results.json: 74 procurement tests, 16 groups; browser sample. Fuentes y casos específicos en los subreportes y suites del registro estructurado.

### GA-AG-06-028 — Fuentes opcionales AP/Inventario sin ceros ficticios

- **P2; corregido y verificado localmente.** Aliases: AG06-FE-10.
- **Observado:** Fallos de consulta o falta de acceso se presentaban como cero facturado, ninguna recepción o ausencia de stock.
- **Corrección/decisión:** Estado no disponible con razón y documentos permitidos separados; diferenciar desconocido de ausencia comprobada.
- **Evidencia:** frontend-results.json: 74 procurement tests, 16 groups. Fuentes y casos específicos en los subreportes y suites del registro estructurado.

### GA-AG-06-029 — Contexto global y opciones de la empresa/obra del documento

- **P2; corregido y verificado localmente.** Aliases: AG06-FE-14.
- **Observado:** Detalle de OC compartida fallaba al pedir settings con empresa null; edición usaba defaults silenciosos/opciones ajenas.
- **Corrección/decisión:** Resolver política, WBS, proveedores/documentos con order.companyId; filtrar productos globales/propios y depósitos de obra/generales permitidos.
- **Evidencia:** frontend-results.json: 74 procurement tests, 16 groups; independent review. Fuentes y casos específicos en los subreportes y suites del registro estructurado.

### GA-AG-06-030 — Presentación de recepción, confirmaciones y lectura móvil

- **P2; corregido y verificado localmente.** Aliases: AG06-FE-13.
- **Observado:** Depósito y anulación de borrador tenían feedback distinto; móvil omitía historia DRAFT/CANCELLED visible en escritorio.
- **Corrección/decisión:** Patrones del sistema, mensajes de stock/servicio, confirmación de anulación y lectura móvil de histórico sin ampliar acciones.
- **Evidencia:** frontend-results.json: 74 procurement tests, 16 groups; browser sample. Fuentes y casos específicos en los subreportes y suites del registro estructurado.

### GA-AG-06-031 — Saldo WBS: no incorporar una OC de otra obra

- **P1; corregido y verificado localmente.** Aliases: orders.legacy_commitment_project.
- **Observado:** Una FK legacy al mismo WBS podía introducir compromisos de otro proyecto aunque el PO quedaba rechazado en su ficha.
- **Corrección/decisión:** Validar proyecto del compromiso contra presupuesto antes de sumar y fallar genéricamente, sin ocultar importes.
- **Evidencia:** orders-audit-live-second. Fuentes y casos específicos en los subreportes y suites del registro estructurado.

### GA-AG-06-032 — Transacciones complejas: presupuesto de tiempo y DTO fuera del lock

- **P2; corregido y verificado localmente.** Aliases: orders.transaction_budget.
- **Observado:** El timeout heredado de cinco segundos vencía en operaciones válidas con relecturas reales; joins de presentación retenían bloqueos.
- **Corrección/decisión:** maxWait10s/timeout30s en estas operaciones y cargar DTO final después del commit cuando es seguro; conservar revalidación y auditoría atómica.
- **Evidencia:** orders-audit-live-first failure; orders-audit-live-second pass. Fuentes y casos específicos en los subreportes y suites del registro estructurado.

### GA-AG-06-033 — Documentación de implementación, estados y período

- **P2; corregido y verificado localmente.** Aliases: root-docs.
- **Observado:** Listas históricas decían que WBS/plazos/baseline/avisos no existían; alias de estados y precondición de período contradecían fuentes posteriores.
- **Corrección/decisión:** Inventario real, estados canónicos y alcance D-078 reconciliados con Hallazgo; Guía/Ayuda y knowledge/evals actualizados.
- **Evidencia:** docs/help; knowledge acceptance; independent review. Fuentes y casos específicos en los subreportes y suites del registro estructurado.

### GA-AG-06-034 — D-129: aprobación vigente al cambiar FX al confirmar

- **P1; corregido y verificado localmente.** Aliases: orders.confirmation_fx, D129.
- **Observado:** Un EDIT podía cambiar FX de una OC aprobada y superar monto/nivel/segregación sin renovar aprobación.
- **Corrección/decisión:** Aprobación habilitada con nuevo ARS/varianza/nota/segregación, sello y evento existente dentro de la confirmación atómica; FX igual conserva permiso anterior.
- **Evidencia:** orders-confirmation-fx-d129-live; frontend-results.json: 74 procurement tests, 16 groups; independent review. Fuentes y casos específicos en los subreportes y suites del registro estructurado.

### GA-AG-06-035 — Cierre parcial formal: brecha de producto delimitada por D-128

- **P2; desarrollo separado aprobado, funcionalidad pendiente.** Aliases: Q-076, D-128.
- **Observado:** BR-PUR-013 anunciaba una acción sin representación física ni cálculo completo implementados.
- **Corrección/decisión:** Owner aprobó desarrollo separado con diseño previo; quitar instrucciones que la presentaban como disponible, conservar frenos y registrar pendiente explícito.
- **Evidencia:** D-128 and approved proposal. Fuentes y casos específicos en los subreportes y suites del registro estructurado.

### GA-AG-06-036 — Cierre de la OC: saldo fiscal y cobertura emitida, sin mezclar reservas

- **P1; corregido y verificado localmente.** Aliases: root-final-settlement, D-112, D-115.
- **Observado:** La ficha consideraba completo el pago cuando paidAmount bruto alcanzaba invoicedAmount neto+IVA: con factura124 y pago121 quedaba una deuda3 por percepción y podía indicarse pago completo. Además, pendingToInvoice incluye reservas DRAFT y se usaba como si acreditara cobertura emitida, pudiendo completar el proceso con otro borrador pendiente.
- **Corrección/decisión:** Dos indicadores derivados en el servicio: cobertura recibida realmente emitida (sin reservas DRAFT) y cancelación de todas las obligaciones válidas de facturas/ND emitidas (PAID con saldo canónico normalizado cero). Las ND emitidas vinculadas directamente o mediante la factura referida se validan y mantienen su deuda y pagos efectivos; no alteran cobertura física. React consume ambos hechos; etiquetas distinguen neto+IVA, percepciones, efectivo y cancelación por NC. No se agregan campos persistidos ni reglas financieras nuevas.
- **Evidencia:** platform-payment-settlement-live; platform-issued-and-debit-closure-live; frontend RSC and workflow regressions; independent final billing review. Fuentes y casos específicos en los subreportes y suites del registro estructurado.

## 4. Verificación y límites

Evidencia local: [registro estructurado](./2026-11-04-ag-06-procurement.json), con logs, fechas y hashes bajo `output/platform-audit/ag-06-2026-11-04/`. Se conserva la base inicial y la revisión final sin credenciales.

- **Pruebas generales: 2.335 aprobadas, cero fallos**, nueve tareas. Incluyen los 13 casos de PDF; no se suman otra vez. **29 suites live omitidas** en ese comando sin DB, declaradas por separado; no se presentan como pruebas aprobadas. AI 35; web 331 (328 TS + 3 RSC); services 1.695 (1.681 TS + 14 MTS); validators 45; domain 111; utils 85; auth 8; email 12; PDF 13. Log `general-tests-closure-final.log`.
- **SQL real: 100 casos distintos aprobados**, sin fallos finales: SC 24; OC/recepciones 43 (34 + 1 APU bajo lock + 8 D-129); plataforma/frontera AP 30 (25 + 1 edición concurrente + 2 cancelación de saldo + 2 cobertura emitida/ND); regresión recepción/cronograma 3. `verification-summary.json` enumera sus nombres y corridas. El caso NC/ND repetido en la última selección y los subconjuntos previos se deduplican.
- **Tipos: 13 tareas aprobadas. Lint completo de packages/web: cero errores/advertencias. Compilación raíz completa aprobada**, dos tareas, sin caché, del 04/11/2026 19:28:57 a 19:31:24 UTC. `full-build-final-result.json` fija 14 hashes de las fuentes críticas utilizadas; la comprobación de cierre verifica que coinciden. DB y proveedores deshabilitados, VERCEL sin definir: el migrador condicional no se ejecutó durante el build. Aviso no bloqueante de antigüedad de Browserslist conservado.
- **Guía, ayuda y Bloqer AI:** siete casos nuevos de recuperación sobre el índice realmente distribuido, aprobados sin LLM remoto; 542 chunks, sourceHash `a5418c64a3d02863c4d1144f203cc2095fc28cf002005a27521b04c6bb745ce0`. Generación y comprobación de vigencia exitosas. Se actualizaron definiciones de eval; no se ejecutaron evals con proveedores reales.
- **Fallos iniciales conservados y resueltos:** dos sustituciones del harness incompatibles con descriptores dinámicos Prisma; fixtures de segundo presupuesto que requerían adenda; timeout heredado de cinco segundos en operaciones complejas. Se corrigieron las causas y se repitieron las selecciones afectadas, sin contar fallos/cancelaciones como aprobados. Un intento de orquestación importó el guard por una ruta incorrecta y terminó antes de migrar/escribir. El primer build falló por permiso al crear salida; las repeticiones y el build raíz final con permisos del workspace pasaron. No se atribuyen estos fallos a producción.
- **Migración D-127:** [20261104183000_purchase_receipt_company_number](../../../../packages/database/prisma/migrations/20261104183000_purchase_receipt_company_number/migration.sql), aplicada únicamente en la DB sintética aislada: 71 migraciones, sin UPDATE/backfill; cliente Prisma generado. Dev normal y producción no migrados. Aplicar esa migración en el destino de un futuro despliegue antes de ejecutar el cliente nuevo. Esta corrida no incluye publicación.
- **Revisión independiente:** `ag06_verification` verificó contratos, datos y consumidores sin modificar archivos. Sus cinco hallazgos adicionales y el caso de edición AP concurrente se corrigieron y revalidaron. Ejecutó 79 servicios, 36 frontend, un caso D-129 y cuatro casos focales finales de facturación; son subconjuntos solapados y no incrementan los contadores generales/SQL. Relectura final confirmó separación de reservas DRAFT, cobertura neto+IVA, efectivo y obligaciones de facturas/ND. Sin hallazgos abiertos de esa revisión acotada; no ejecutó SQL/browser/build propios.

### Muestra visual y operativa

Sesión Owner con datos sintéticos en la instancia compilada local y la DB aislada autorizada. La muestra inicial recorrió SC-9103, cotización USD con referencia ARS y carga manual FX6, envío, OC directa OC-9305, aprobación/confirmación y RC-001; comprobó el diálogo de anulación sin ejecutarla. Una adjudicación con una sola oferta no creó OC; la lectura posterior comprobó mínimo configurado de dos, una oferta y cero órdenes asociadas. La causa es una inferencia de esa política: no se capturó el toast y no se le atribuye un mensaje observado.

La **compilación raíz final** se probó confirmando RC-002 y leyendo las dos recepciones RC-001/RC-002 con OC-9305 como origen, explicación de renglones sin producto y resumen fiscal: recibido neto+IVA 242 ARS, emitido 0, pagado 0 y pendiente neto+IVA 242. Escritorio 1.280×720 claro/oscuro y móvil 390×844 claro/oscuro en la muestra combinada. La última lista móvil mostró ambas tarjetas completas y acciones de navegación legibles. Evidencia en `visual-initial.json` y `visual-final.json`; se distingue la build intermedia de la final.

- [Cotización USD y referencia ARS, escritorio oscuro](./assets/ag06/quote-usd-reference-ars-desktop-dark.png).
- [SC en móvil claro](./assets/ag06/request-mobile-light.png).
- [Primera recepción en escritorio](./assets/ag06/receipt-rc001-desktop-light.png).
- [Explicación sin stock en la build final](./assets/ag06/receipt-draft-final-light.png).
- [Dos correlativos confirmados, escritorio claro](./assets/ag06/receipts-two-codes-final-light.png).
- [Dos correlativos confirmados, móvil oscuro](./assets/ag06/receipts-two-codes-final-mobile-dark.png).

Al terminar se restauraron tema oscuro y viewport, se verificó logout en `/login`, se cerró la pestaña temporal y se detuvo únicamente el servidor propio tras comprobar comando, creación UTC y puerto libre. Evidencia `local-server-final-stopped.json`.

**Límites:** solo Owner navegado en AG-06; roles negativos/ACL/gates tienen SQL y pruebas de componentes. D-129 tiene SQL y pruebas de UI, sin un recorrido completo en navegador de confirmación de OC extranjera. Históricos con UUID verificados mediante SQL/componentes; la muestra visual contiene recepciones nuevas. No se emitieron facturas ni pagos en el navegador ni se comunicaron órdenes a proveedores. Sin E2E completos, smoke en portal, emails/R2/modelos reales, certificado WCAG/NVDA completo, auditoría de rendimiento o todos los viewports. CSV/PDF conservan su contrato y la regresión general incluye PDF; no se repitieron por rutina todos los reportes.

## 5. Estado y continuación

**AG-06 terminada en el alcance aprobado:** GA-AG-06-001–034 y 036 corregidos y verificados localmente; GA-AG-06-035 documentado como desarrollo separado por aprobación expresa D-128, pendiente [P-AG06-01](../PENDING_ARCHITECTURE_ITEMS.md). Q-072 a Q-076 resueltas en D-125 a D-129. No quedan decisiones bloqueantes ni defectos confirmados abiertos dentro del alcance de cierre.

Código, SQL, compilación y muestra visual local tienen evidencia diferenciada; **no publicado**. Se preserva el trabajo previo de AG-05. Última publicación comprobada: AG-00–04, HEAD `3407c023`. **AG-07 no iniciada; esperar indicación del Owner.** Las auditorías completas de Inventario, AP, avisos, reportes y rendimiento permanecen en sus etapas; RFIs, contratos legales y simplificación de roles conservan sus decisiones separadas.

Cambiar schema, permisos, FX/varianza, padre de línea, recibos o sus consumidores invalida la evidencia correspondiente: seleccionar regresión mediante [TESTING_STRATEGY](../TESTING_STRATEGY.md) y el [runbook](../PLATFORM_AUDIT_RUNBOOK.md). Para la futura publicación, desplegar primero la migración D-127 en el destino autorizado y ejecutar el [smoke de despliegue](../DEPLOYMENT_SMOKE_TEST.md).

