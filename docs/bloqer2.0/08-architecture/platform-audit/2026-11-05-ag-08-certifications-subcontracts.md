# AG-08 — Certificaciones y subcontratos

**Estado: AG-08 cerrada, corregida y verificada localmente.** 30 grupos consolidados resueltos; D-131/D-132 implementadas. AG-07 publicada; AG-08 sin publicar y AG-09 no iniciada.

## Encargo, base y fuentes

Campaña global por etapas, con corrección autorizada de todos los hallazgos confirmados. Base limpia b05fa722786d935d6eef7eb666722da261a01cac, rama codex/pruebas, 2.640 archivos fijados en initial-snapshot.json. La [publicación AG-07](./2026-11-05-ag-07-publication.md) se hizo antes y quedó separada de AG-08.

Fuentes: [CERTIFICATIONS](../../02-modules/CERTIFICATIONS.md), [SUBCONTRACTS](../../02-modules/SUBCONTRACTS.md), MONEY_MODEL, CERTIFICATION_FORMULAS, BR-CERT/BR-SUB/BR-AUD, estados, D-027/033/053/082/089/111/115/119, ADR-018, ERD funcional/técnico y schema real. El [registro estructurado](./2026-11-05-ag-08-certifications-subcontracts.json) conserva IDs, aliases, fuentes, evidencia e inventarios.

Escrituras solo en bloqer_audit_ag01_20261103, compute dev curly-math, ambas URLs explícitas e identidad efectiva comprobada antes de fixtures. Proveedores externos deshabilitados. Sin cambios de schema, migraciones, dependencias ni archivos de entorno. Las suites nuevas limpian exclusivamente sus tenants UUID; el legado de certificaciones conserva usuarios/datos sintéticos para smoke, diferenciados de esa limpieza.

## Definiciones aprobadas

- **D-131 / Q-078:** conservar ISSUED/Emitido. Aprobar el certificado de subcontrato crea la factura AP en borrador; la CxP nace al emitirla, como ya establecía D-089. No se renombra el enum ni se migra historia.
- **D-132 / Q-079:** certificaciones habituales con cantidades no negativas. Cualquier rectificación de lo ya reconocido requiere diseño previo si se solicita; no se promete una función de certificados negativos ni se simula avance físico con una NC. [Alcance separado](../PENDING_ARCHITECTURE_ITEMS.md#p-ag08-01--rectificación-de-certificaciones-ya-reconocidas).

## Recorridos y cuatro inventarios

1. Certificaciones: lista/alta/detalle/edición/medición → Actions y schemas → servicios con scope/ACL/gates → Project y serialización del certificado → líneas, snapshots, topes y auditoría atómicos → lectura, reportes e invalidación.
2. Fuentes: avance físico y compras/recepciones → gate/permiso/empresa/grafo y moneda → referencias explícitas o no disponibles; una fuente restringida no se reemplaza por cero.
3. Subcontratos: picker autorizado → crear/editar/activar/completar/anular → líneas contractuales → emitir/aprobar/rechazar/reemplazar certificado → topes, snapshots y sucesión revalidados bajo locks.
4. Frontera AP: aprobación indivisible con factura borrador → emisión/CxP → pago, reversa y NC/ND → liquidación derivada sin confundir deuda saldada con efectivo.
5. Frontera AR: certificado aprobado → factura con dueño/moneda/FX y valores vigentes → CxC/cobro/NC/ND → recorrido con saldo pendiente, saldado o no disponible.
6. Referencias presupuestarias: Budget/WBS/CostItem/APU → costo de subcontrato en moneda nativa → formulario con empresa efectiva y aplicación solo comparable; cobertura de otra empresa no oculta la partida.
7. Contratos compartidos: siete escritores INVOICE entre AR/AP coordinan número por empresa; Actions validan los padres reales e invalidan rutas/lecturas derivadas. Confirmaciones y formularios conservan datos y bloquean reenvío/cierre pendientes.

Documentado/implementado/expuesto/probado se conservan por recorrido en JSON y handoffs. El roadmap no se usa como prueba de implementación. La prueba de servicio no acredita una pantalla ni una publicación.

## Dimensiones y límites

- **Integridad/ERD:** raíces con tenant y pertenencia heredada de hijos existentes; comprobación de Company/Project/Budget/WBS/CostItem/APU, contactos, certificados, líneas y obligaciones. No se agregaron entidades o migraciones.
- **Acceso:** OWNER en empresas A/B y contexto global; PM asignado/no asignado, lector de obra sin AP y tenant ajeno; propios/compartidos y gates CERTIFICATIONS/SUBCONTRACTS/AP/AR/JOBSITE_LOG/PROCUREMENT según recorrido. No se simplificaron roles.
- **Dinero y concurrencia:** qty/PU4, money2 half-up, FX manual6, snapshots y acumulados D-119, numeración, reintentos y rollback de auditoría. ARS/USD/EUR en selección declarada; sin conversiones implícitas.
- **UI:** formularios, estados restringidos/no disponibles, rutas y enlaces reales, precisión, errores y pending. A11y estática de labels/alerts y responsive; muestra visual actual de Owner en 1280×720 y 390×844, claro/oscuro aprobada. No certifica WCAG ni todos los dispositivos.
- **Efectos:** auditoría en TX; etiqueta AuditLog de actualización requerida por BR-AUD001, sin nuevo evento de dominio. Los servicios reales ejercitan obligaciones y caja sintéticas. Email/storage/LLM externos, AFIP, contabilidad completa, exports y jobs ajenos a este recorrido no se operaron.
- **Rendimiento:** no hubo benchmark ni prueba prolongada de carga. Los P2028 observados se reparan con opciones acotadas de TX; no se presenta esa medida como una optimización general.

## Hallazgos consolidados

30 grupos con aliases deduplicados, corregidos y verificados en el alcance indicado. No quedan hallazgos confirmados pendientes en este lote. Los residuales de la revisión independiente y las regresiones transitorias se vinculan con la causa original.

### GA-AG-08-001 — Gates de certificaciones también en servicios

- **P1; corregido y verificado localmente.** Alias: AG08-CERT-01.
- **Observado:** Public reads, headers, lines, measurement and lifecycle previously checked only roles; direct Actions did not enforce tenant module.
- **Corrección:** authorizeCertification before any read/write; disabled CERTIFICATIONS fails consistently.
- **Fuentes:** packages/services/src/certification/certification.service.ts; packages/services/src/certification/certification-scope.ts.
- **Regresión:** new SQL module-gate matrix; certification-audit.live.test.ts.

### GA-AG-08-002 — Aislamiento y grafo de presupuesto/partidas de certificaciones

- **P1; corregido y verificado localmente.** Alias: AG08-CERT-02.
- **Observado:** Shared Project allowed company-A ctx to list/read/mutate company-B Certification; Budget/WBS/CostItem graph not revalidated before DTO.
- **Corrección:** Nullable own+shared filter, global context preserved, full tenant/company/project/budget/WBS/CostItem relations guarded on reads and in transaction. Global creation now derives ownership from Budget.companyId before Project.companyId, verifies active preferred company, and cannot silently fall back to shared ownership for an inactive specific parent.
- **Fuentes:** packages/services/src/certification/certification.service.ts; packages/services/src/certification/certification-scope.ts.
- **Regresión:** 5 offline scope + SQL company/shared/global, foreign budget, project ACL and legacy graph; certification-audit.live.test.ts.

### GA-AG-08-003 — Entradas reales y calendario en el límite del servicio

- **P1; corregido y verificado localmente.** Alias: AG08-CERT-03.
- **Observado:** Direct line service calls accepted negative/nonfinite values; date validators accepted impossible days.
- **Corrección:** Service parses existing schemas, calendar dates, finite nonnegative qty and physical0–100; qty/% rounded4dp and money2dp; nullable notes can clear.
- **Fuentes:** packages/services/src/certification/certification-line.service.ts; packages/services/src/certification/certification-scope.ts.
- **Regresión:** 3 validator offline + SQL direct input/snapshot/clear; certification-audit.live.test.ts.

### GA-AG-08-004 — Revalidación de obra, presupuesto y topes bajo bloqueo

- **P1; corregido y verificado localmente.** Alias: AG08-CERT-04.
- **Observado:** Line and worksheet transactions used advisory certification lock without rechecking Project ACTIVE; create/issue baseline status could change after preflight.
- **Corrección:** Project row lock before advisory, parent graph/current budget status reloaded inside transaction. D119 same-WBS/tenant accumulated ceiling retained across companies.
- **Fuentes:** packages/services/src/certification/certification.service.ts; packages/services/src/certification/certification-scope.ts.
- **Regresión:** SQL interleaved project/budget changes, stale revisions and concurrent issues; certification-audit.live.test.ts.

### GA-AG-08-005 — Auditoría indivisible de líneas, medición y refresco

- **P1; corregido y verificado localmente.** Alias: AG08-CERT-05.
- **Observado:** add/update/remove/save audited after commit; refresh had no audit and parent actor attribution could remain old.
- **Corrección:** Audit and totals/revisions/updatedBy inside the same transaction; refresh reuses existing measurement_saved action.
- **Fuentes:** packages/services/src/certification/certification.service.ts; packages/services/src/certification/certification-scope.ts.
- **Regresión:** SQL add + update/remove/measurement/refresh rollback; certification-audit.live.test.ts.

### GA-AG-08-006 — Motivo y repetición segura al cancelar certificaciones

- **P2; corregido y verificado localmente.** Alias: AG08-CERT-06.
- **Observado:** Issued/approved cancellation accepted no reason despite BR-AUD003; repeated cancellation failed.
- **Corrección:** cancelCertification(id,ctx,reason?) audits cancellationReason for issued/approved, keeps draft reason optional; authorized CANCELLED replay returns prior result without audit even when project paused.
- **Fuentes:** packages/services/src/certification/certification.service.ts; packages/services/src/certification/certification-scope.ts.
- **Regresión:** SQL reason/draft/replay and active invoice guard; certification-audit.live.test.ts.

### GA-AG-08-007 — Fuentes de avance autorizadas y datos ausentes explícitos

- **P1; corregido y verificado localmente.** Alias: AG08-CERT-07, UI-10-físico.
- **Observado:** Physical logs queried even when JOBSITE_LOG disabled, procurement/receipt contributions could include other companies or contradictory receipt-order relations.
- **Corrección:** Jobsite gate + existing read-role helper, document-company filtering; null physical values/suggestions and sourceWarnings when unavailable; checked procurement/receipt parents and native currency, without inferred FX.
- **Fuentes:** packages/services/src/certification/certification-measurement.ts; packages/services/src/certification/certification-scope.ts.
- **Regresión:** SQL zero queries when source disabled, company sources and receipt integrity; UI contract coordinated; certification-audit.live.test.ts.

### GA-AG-08-008 — Padres y moneda del recorrido de cobranzas

- **P1; corregido y verificado localmente.** Alias: AG08-CERT-08.
- **Observado:** Read helper selected account.name without tenant/company/invoice/receivable/currency checks.
- **Corrección:** Certificate scope + document company; validate collection/invoice/receivable/account parents and currency before serializing amount/name; AR-off still returns empty.
- **Fuentes:** packages/services/src/certification/certification-calc.service.ts; packages/services/src/certification/certification-scope.ts.
- **Regresión:** SQL foreign-tenant account; existing 11-case flow regression recommended; certification-audit.live.test.ts.

### GA-AG-08-009 — Acceso de subcontratos por empresa y obra

- **P1; corregido y verificado localmente.** Alias: SC-ACCESS.
- **Observado:** Las lecturas y mutaciones no cubrían de forma uniforme membership de proyecto ni company scope, particularmente por UUID y en obra compartida.
- **Corrección:** Centralizar autorización server en assertSubcontractAccess/requireProjectAccess; filtrar cabeceras por empresa obligatoria sin excluir contexto global; validar autorización del proyecto en ambos pickers.
- **Fuentes:** subcontract.service.ts:getSubcontractById/listSubcontractsByProject/getSubcontractFormWbsPickList/listSubcontractorContacts; subcontract-certification.service.ts:loadCert/listSubcontractCertificationsBySubcontract y todos los mutantes; subcontract-scope.ts:assertSubcontractAccess.
- **Regresión:** live: scopes shared-project headers and certificates by company and preserves global access; live: checks membership for every ID read, picker, contract mutation and certification lifecycle method; live: denies cross-tenant roots, company injection and foreign-contact creation; live: keeps shared budget WBS available while excluding another company's WBS.

### GA-AG-08-010 — Grafo de subcontrato, líneas, contactos y contadores

- **P1; corregido y verificado localmente.** Alias: SC-RELATIONS.
- **Observado:** Existían FK simples y serialización de relaciones sin comprobar de forma completa el tenant/empresa/proyecto/agregado de cada extremo ni que contadores certificados conciliaran con APPROVED.
- **Corrección:** Includes acotados de scope y validación real de Company/Project/Contact/WBS/CostItem/certificaciones/líneas/factura/sucesoras. Contador certifiedQuantity debe coincidir con suma de APPROVED; error explícito ante discrepancia, sin reparar históricos.
- **Fuentes:** subcontract-scope.ts:subcontractInclude/subcontractCertificationInclude; subcontract-scope.ts:assertSubcontractWbsParent/assertSubcontractParents/assertSubcontractCertificationParents; subcontract.service.ts:loadSubcontract/serializeSubcontract.
- **Regresión:** subcontract-scope.test.ts: 7 casos de padres, WBS, línea, doble origen, contadores y sucesora; live: refuses malformed parent graphs instead of serializing foreign names or mutating; live: validates certification-line ownership against its actual parent; live: detects inconsistent certified counters without silently repairing historical data; live: does not infer settlement from a missing/cancelled payable or a corrupted invoice root.

### GA-AG-08-011 — Estados, topes, sucesión y auditoría concurrente de subcontratos

- **P1; corregido y verificado localmente.** Alias: SC-ATOMICITY, UI-11.
- **Observado:** Previews/contadores/numeración/transiciones podían quedar obsoletos; auditoría y cambios no se consolidaban siempre en la misma TX.
- **Corrección:** Orden de locks Project→Company NO KEY UPDATE→Subcontract→certificado; reread de estado/scope/gate en TX; auditoría atómica; timestamps de borrador; numeración bajo locks; revalidar techo al aprobar y refrescar previous/cumulative/remaining; D082 terminal/sucesora. El DTO y la ruta usan la sucesora real: Ver nueva versión y redirección a la existente, sin ofrecer duplicarla.
- **Fuentes:** subcontract-scope.ts:lockSubcontractMutation; subcontract-certification.service.ts:lockedCert/create/update/issue/approve/reject; subcontract.service.ts:create/update/updateMeta/activate/complete/cancel.
- **Regresión:** live: serializes company-wide contract numbering across distinct projects; live: serializes certification numbering under one parent; live: rechecks the remaining ceiling when sibling approvals compete; live: refreshes previous/cumulative snapshots at approval after another certificate advances; live: preserves approved quantities, invoice and audit atomicity when approval audit fails; live: rolls creation, metadata, draft edits and lifecycle changes back with their audit; live: rechecks parent activity, project status and Subcontracts gate after preflight; live: rejects stale draft writes after a competing issue; live: keeps REJECTED terminal and serializes noncancelled successors.

### GA-AG-08-012 — Precisión contractual y total certificado por snapshots

- **P1; corregido y verificado localmente.** Alias: SC-PRECISION.
- **Observado:** Redondeo y serialización no seguían uniformemente D053; entradas podían admitir calendarios inválidos, rangos invertidos, cantidades inválidas o líneas duplicadas. totalCertified repriciaba cantidades agregadas.
- **Corrección:** Schemas ejecutados también en servicios; decimal-dot canónico 4dp para qty/PU, rango Decimal(18,4), fecha real/rango fusionado, no duplicados ni reemplazo vacío; lineTotal final money2 y sumatoria de snapshots APPROVED para totalCertified. Conservar PU cero, ISO3 y clears null.
- **Fuentes:** packages/validators/src/subcontracts.ts; subcontract-values.ts:parseSubcontractInput/subcontractLineTotal/assertSubcontractDateRange/assertSubcontractQuantityWithinBalance; subcontract.service.ts:serializeSubcontract/activateSubcontract; subcontract-certification.service.ts:writeLines/approveSubcontractCertification.
- **Regresión:** subcontracts-inputs.test.ts: 7 casos; subcontract-values.test.ts: 3 casos; live: rejects invalid runtime inputs before writing, including duplicate certificate lines; live: stores canonical 4dp quantities/prices and rounds only the final line money; live: totals approved certificate snapshots rather than repricing combined quantities; live: supports date clearing, validates merged patches and audits draft certification edits.

### GA-AG-08-013 — Cancelación atómica de certificado y factura en borrador

- **P1; corregido y verificado localmente.** Alias: SC-CANCELLATION.
- **Observado:** La cancelación no garantizaba trazabilidad de motivo según estado, atomicidad con auditoría, unicidad de reversas y verificación suficiente de documentos financieros.
- **Corrección:** Motivo obligatorio recortado en ISSUED/APPROVED guardado en AuditLog existente; DRAFT opcional; CANCELLED replay sin repetir. REJECTED terminal. APPROVED exige factura del mismo scope; ISSUED AP bloquea; CxP/pagos/créditos activos o incoherentes bloquean. Cancelar AP DRAFT y qty+certificado+audit en TX bajo locks compartidos con AP. Parent cancel bloquea APPROVED.
- **Fuentes:** subcontract-certification.service.ts:cancelSubcontractCertification; subcontract.service.ts:cancelSubcontract; subcontracts.ts:cancelSubcontractSchema; subcontract-scope.ts:lockSubcontractMutation.
- **Regresión:** live: allows draft cancellation but requires reasons for issued/approved documents and replays once; live: cancels approved quantity and draft invoice atomically, including audit failure; live: blocks parent cancellation with approved children and permits reasonless draft cancellation replay; live: serializes AP invoice issue against certification cancellation; live: creates only an AP draft at approval and derives settlement through issue, payments and reversals.

### GA-AG-08-014 — Aprobación y circuito AP coherentes con Emitido/D-089

- **P1; corregido y verificado localmente.** Alias: SC-AP-BOUNDARY.
- **Observado:** Aprobación generaba efecto AP sin exigir su módulo habilitado y la documentación antigua D028/SUBMITTED podía inducir a implementar deuda directa equivocada.
- **Corrección:** Conservar ISSUED aprobado por Owner/D131. Respetar D089: aprobación crea factura AP DRAFT, sin Payable. AP gate preflight y fresco en TX; si está apagado rollback total sin qty/estado/factura/audit parcial. No imponer EDIT AP al PM con permiso de subcontratos.
- **Fuentes:** subcontract-certification.service.ts:approveSubcontractCertification; AP issueSupplierInvoice existente; Documentación canónica corregida por coordinador.
- **Regresión:** live: requires AP to approve and rechecks its module gate inside the transaction; live: creates only an AP draft at approval and derives settlement through issue, payments and reversals; live: allows an assigned PM to approve the automatic AP draft without granting AP edit; live: conserves the existing completion policy and allows an already-issued certificate to be approved.

### GA-AG-08-015 — Liquidación, moneda y deuda de notas vinculadas

- **P1; corregido y verificado localmente.** Alias: SC-SETTLEMENT, SC-DEBIT-NOTES, UI-10-AP.
- **Observado:** El indicador derivado D027 no se exponía con fuentes verificadas; faltaban moneda del padre y sucesora para que UI mostrara valores/CTA correctos. Residual introducido: La primera corrección del loader consultaba únicamente la Payable de la factura original. Original 100 pagada y ND 10 ISSUED OPEN podía mostrarse SETTLED.
- **Corrección:** DTO currency derivado del Subcontract, successorCertificationId/Code de replacedBy no CANCELLED validado. Settlement con gate AP+VIEW AP y razones null-safe; factura DRAFT/CANCELLED/sin obligación→UNSETTLED; ISSUED requiere CxP y pagos/NC activos conciliados con scope/moneda. NC parcial o total reduce deuda sin etiquetar efectivo. No consulta financiera sin acceso. Consultar en lote ND ISSUED por padres autorizados; validar todos los extremos/orígenes/moneda y CxP/pagos de cada nota. ND DRAFT/CANCELLED excluida. Missing/cancelled/contradictoria→unavailable; después OVERDUE prima; SETTLED exige todas las obligaciones conciliadas en cero; mezcla saldada/abierta o reducción parcial→PARTIALLY_SETTLED. También se comprueba Payment.account.companyId contra la obligación, preservando null compartido; la cuenta de otra empresa produce no disponible.
- **Fuentes:** subcontract-certification.service.ts:serializeCert/view/listSubcontractCertificationsBySubcontract; subcontract-settlement.ts:deriveSubcontractSettlement/loadSubcontractSettlements; subcontract-scope.ts:assertSubcontractCertificationParents.
- **Regresión:** subcontract-settlement.test.ts: 16 casos finales, incluidos 6 de ND residual; live: reports unavailable settlement without querying financial rows when AP is disabled; live: withholds AP-derived data from an assigned user without VIEW AP; live: derives partial/full credit settlement without implying a treasury payment; live: does not infer settlement from a missing/cancelled payable or a corrupted invoice root; subcontract-settlement.test.ts: settled original + open ND; overdue; all sources settled; missing/cancelled payables; foreign scopes/currency/ref; múltiples notas y exclusión DRAFT/CANCELLED; live: AG08 residual: includes issued debit-note balances, overdue priority and later payment; live: AG08 residual: refuses missing/cancelled or foreign debit-note obligations; live: AG08 residual: ignores draft/cancelled debit notes and requires every issued note to settle; live: AG08 residual: AP gates prevent original and debit-note financial queries; subcontracts-audit.live.test.ts: validates the payment account company while retaining shared treasury accounts.

### GA-AG-08-016 — Numeración INVOICE compartida por todos los escritores AR y AP

- **P1; corregido y verificado localmente.** Alias: SC-AP-NUMBERING, ROOT-AR-NUMBERING.
- **Observado:** Máximos fuera de la transacción o escritores sin el mismo bloqueo por empresa permitían colisión entre obras y flujos; el máximo AP de aprobación mezclaba series fiscales.
- **Corrección:** Project cuando corresponde → Company NO KEY UPDATE → max INVOICE → crear en una TX. Cuatro escritores AR y tres AP comparten el orden; NC/ND conservan sus series.
- **Fuentes:** ar/sales-invoice.service.ts:createSalesInvoice/createInvoiceFromCertification/lockInvoiceNumberCompany; ar/register-ar-sale.service.ts:registerArSale; ar/register-ar-income.service.ts:registerArIncome; ap/supplier-invoice.service.ts:createSupplierInvoice; ap/register-ap-expense.service.ts:registerApExpense; subcontracts/subcontract-certification.service.ts:approveSubcontractCertification.
- **Regresión:** certification-connections-audit.live.test.ts: two concurrency tests; subcontracts-audit.live.test.ts: three AG08 residual numbering tests.

### GA-AG-08-017 — Facturación desde certificado con grafo y valores vigentes

- **P1; corregido y verificado localmente.** Alias: ROOT-FROM-CERT-SCOPE.
- **Observado:** La carga fuente y las líneas podían cambiar entre preflight y creación; la selección global podía perder el dueño real del presupuesto.
- **Corrección:** Validar grafo/ACL, calendario y contacto; conservar dueño y moneda del presupuesto; Project→Company→certificado y relectura de padres, revisión, líneas y gate AR fresco antes de crear. Una sola factura activa.
- **Fuentes:** ar/sales-invoice.service.ts:createInvoiceFromCertification; validators/sales-invoice.ts:createInvoiceFromCertificationSchema.
- **Regresión:** certification-connections-audit.live.test.ts: owner/FX, interleaving, invalid calendar/module, audit rollback; certification-flow.live.test.ts.

### GA-AG-08-018 — Precios con impuestos incluidos respetados al facturar certificado

- **P1; corregido y verificado localmente.** Alias: ROOT-FROM-CERT-GROSS.
- **Observado:** El flag pricesIncludeTax existente se ignoraba y podía volver a sumar IVA a un importe ya bruto.
- **Corrección:** Reutilizar resolveInvoiceLineMoney y su precio neto derivado; conservar reglas de letra C/E, snapshots y redondeo D-053/D-086.
- **Fuentes:** ar/sales-invoice.service.ts:createInvoiceFromCertification.
- **Regresión:** certification-connections-audit.live.test.ts: tax-inclusive input flag.

### GA-AG-08-019 — Recorrido AR distingue saldo, ausencia de fuente y efectivo

- **P1; corregido y verificado localmente.** Alias: ROOT-AR-SETTLEMENT, UI-09.
- **Observado:** canCollect=false o presencia de cobro puede mostrarse como recorrido cobrado aunque la fuente no disponible o exista saldo en documentos vinculados; obligación faltante/cancelada o ND pendiente podía producir una finalización falsa.
- **Corrección:** Servicio deriva isSettled/collectionStatusAvailable desde CxC, importes canónicos y todas las ND emitidas con padres/moneda válidos. NC puede saldar sin caja. UI usa hechos, no canCollect como prueba de cierre.
- **Fuentes:** ar/certification-invoice-status.ts; ar/sales-invoice.service.ts:getActiveInvoiceForCertification; apps/web/features/certifications/components/certification-flow-trail.tsx; apps/web/features/certifications/components/certification-flow-trail.tsx.
- **Regresión:** certification-invoice-status.test.ts:16 cases; certification-connections-audit.live.test.ts: AR trail/NC/ND/graph; certification-interactions.test.ts.

### GA-AG-08-020 — Referencias de subcontrato con empresa efectiva y grafo autorizado

- **P1; corregido y verificado localmente.** Alias: ROOT-HINT-SCOPE, UI-14.
- **Observado:** Los hints y su cobertura podían consultar otra empresa o una relación CostItem/APU contradictoria; en contexto global el formulario resolvía empresa A pero consultaba referencias globales.
- **Corrección:** Gates/roles/ACL antes de consultar; grafo Budget/WBS/CostItem/APU comprobado, scope propio/compartido y mismo contexto de empresa del picker en el formulario. Sin empresa no se consulta.
- **Fuentes:** reports/budget-variance.service.ts:getWbsSubcontractBudgetHints/getWbsIdsWithActiveSubcontract; apps/web/app/(app)/proyectos/[id]/subcontratos/nuevo/page.tsx.
- **Regresión:** certification-connections-audit.live.test.ts:5 reference tests; certification-interactions.test.ts:4 route contexts.

### GA-AG-08-021 — Sugerencia de presupuesto puede copiar precio a otra moneda sin advertirlo

- **P2; corregido y verificado localmente.** Alias: UI-08.
- **Observado:** Hint no identifica moneda del presupuesto y Usar aplica su PU en la moneda actual del contrato
- **Corrección:** DTO fuente con currency coordinado; UI muestra fuente nativa y limita Usar/autocompletado a igualdad de moneda; captura manual conserva flujo existente
- **Fuentes:** apps/web/features/subcontracts/components/subcontract-budget-hints.tsx; apps/web/features/subcontracts/components/subcontract-form.tsx.
- **Regresión:** subcontract hint displays its source currency and permits only comparable picks.

### GA-AG-08-022 — Subcertificación guardada navega a una ruta relativa equivocada

- **P2; corregido y verificado localmente.** Alias: UI-01.
- **Observado:** push("../id") y push("..") dependen de segmentos y pueden salir al subcontrato o a un hermano equivocado
- **Corrección:** El formulario recibe el projectId y certificationId real y usa la ruta absoluta canónica del documento
- **Fuentes:** apps/web/features/subcontracts/components/subcontract-certification-form.tsx; apps/web/app/(app)/proyectos/[id]/subcontratos/[subcontractId]/certificaciones/[certId]/editar/page.tsx.
- **Regresión:** subcontract certificate create/edit preserves four decimals, currency and absolute navigation.

### GA-AG-08-023 — Captura y vista previa reducen precisión contractual antes de guardar

- **P2; corregido y verificado localmente.** Alias: UI-02.
- **Observado:** DecimalInput por defecto acepta 2 decimales; la vista previa de subcontrato redondea cantidad y PU antes de multiplicarlos
- **Corrección:** Captura conserva 4 dp; preview multiplica cadenas canónicas completas y serializa una vez el importe a 2 dp
- **Fuentes:** apps/web/features/subcontracts/components/subcontract-form.tsx; apps/web/features/subcontracts/components/subcontract-form.tsx; apps/web/features/subcontracts/components/subcontract-certification-form.tsx.
- **Regresión:** 1.2345 × 3.3333 = 4.11, antes 1.23 × 3.33 = 4.10; 4 dp enviados sin float y preservados tras error.

### GA-AG-08-024 — Edición ofrece cambiar identidad que el Action descarta

- **P2; corregido y verificado localmente.** Alias: UI-03.
- **Observado:** Subcontratista y moneda editables aunque updateSubcontractAction no los envía al service
- **Corrección:** Controles de identidad permanecen visibles y deshabilitados en edición con explicación; no se amplió el contrato backend
- **Fuentes:** apps/web/features/subcontracts/components/subcontract-form.tsx; apps/web/features/subcontracts/components/subcontract-form.tsx.
- **Regresión:** subcontract editor preserves identity fields.

### GA-AG-08-025 — Errores de transporte y reenvío dejan operaciones sin recuperación clara

- **P2; corregido y verificado localmente.** Alias: UI-04, UI-15.
- **Observado:** startTransition sin catch ni mutex inmediato; formularios/medición/acciones pueden despachar dos veces antes de rerender y cerrar un diálogo en vuelo startTransition sin catch/mutex; Cancelar permanece activo mientras se crea el borrador y el rechazo de transporte no se representa en el formulario.
- **Corrección:** Hook compartido con ref mutex inmediato, promesa awaitable, error visible sin datos internos y pending protegido; valores sobreviven rechazos Reutiliza useOperationalAction, fieldset/Cancelar/controlados protegidos, error role=alert, promesa/mutex y borrador preservado. Sin nuevas reglas IVA/IIBB/FX ni cambios de componentes financieros compartidos.
- **Fuentes:** apps/web/hooks/use-operational-action.ts; apps/web/features/certifications/components/new-certification-dialog.tsx; apps/web/features/certifications/components/certification-edit-form.tsx; apps/web/features/certifications/components/certification-measurement-sheet.tsx; apps/web/features/subcontracts/components/subcontract-action-button.tsx; apps/web/features/sales-invoices/components/certification-invoice-form.tsx; apps/web/features/sales-invoices/components/certification-invoice-form.tsx.
- **Regresión:** shared operational action; new/header/measurement dialog; creation/edit transport preservation; subcontract lifecycle server/transport/mutex; 3 regresiones: transporte, error de servidor y éxito/reintento con FX6/alícuotas4/fecha/notas conservadas, double-submit y Cancelar antes del rerender, ARS sin FX y regla C con IVA0 vigente..

### GA-AG-08-026 — ConfirmActionButton entrega void al diálogo mientras sigue la mutación

- **P2; corregido y verificado localmente.** Alias: UI-05.
- **Observado:** El diálogo recibe onConfirm que arranca startTransition y retorna void; no espera su operación ni puede capturar su rechazo
- **Corrección:** onConfirm devuelve la promesa del hook; bloqueo de cierre y error visible hasta resolver, sin cambio de props público
- **Fuentes:** apps/web/components/feedback/confirm-action-button.tsx.
- **Regresión:** confirm shared action keeps its confirmation open; payment-detail-rsc 3 casos.

### GA-AG-08-027 — Actions mezclan documento real con padres de ruta e invalidación incompleta

- **P2; corregido y verificado localmente.** Alias: UI-06, UI-13.
- **Observado:** Un id autorizado de otro proyecto/contrato/línea puede mutarse mientras se invalidan padres enviados; reportes/detalles derivados quedan obsoletos Facturas y NC/ND sólo invalidaban listas AR/finanzas; el detalle de la certificación y su recorrido podían conservar factura/saldo anteriores.
- **Corrección:** Antes de mutar se leen y comparan padres reales y pertenencia de línea; se invalidan detalle/edición/lista/reportes/pendientes y fronteras financieras pertinentes Tras éxito se invalidan lista/detalle/edición de la factura, su factura padre si corresponde, AR, pendientes y las rutas exactas de certificación y reportes de avances/certificaciones. Se deriva el vínculo del resultado real o de lectura autorizada antes de mutar.
- **Fuentes:** apps/web/app/(app)/proyectos/[id]/certificaciones/actions.ts; apps/web/app/(app)/proyectos/[id]/certificaciones/actions.ts; apps/web/app/(app)/proyectos/[id]/subcontratos/actions.ts; apps/web/app/(app)/proyectos/[id]/subcontratos/actions.ts; apps/web/app/(app)/proyectos/[id]/facturas/actions.ts; apps/web/app/(app)/proyectos/[id]/facturas/actions.ts; apps/web/app/(app)/proyectos/[id]/facturas/actions.ts.
- **Regresión:** Actions positive and mismatched parent cases; zero writes/invalidation on mismatch.

### GA-AG-08-028 — Lista y rutas de alta/edición anuncian edición a lectores

- **P2; corregido y verificado localmente.** Alias: UI-07.
- **Observado:** Botón Nuevo subcontrato visible para VIEWER; rutas directas cargan formulario aunque no tiene EDIT
- **Corrección:** Enlace condicionado a EDIT y rutas directas retornan al documento/lista antes de cargar opciones de edición
- **Fuentes:** apps/web/app/(app)/proyectos/[id]/subcontratos/page.tsx; apps/web/app/(app)/proyectos/[id]/subcontratos/nuevo/page.tsx; apps/web/app/(app)/proyectos/[id]/subcontratos/[subcontractId]/editar/page.tsx.
- **Regresión:** read-only list; read-only direct new/edit.

### GA-AG-08-029 — Cabeceras y campos no conservan jerarquía en pantallas angostas; errores sin asociación accesible

- **P3; corregido y verificado localmente.** Alias: UI-12.
- **Observado:** Cabeceras de detalle rígidas, grillas de formularios de dos columnas y campos de fechas/presupuesto sin aria-describedby al mensaje
- **Corrección:** Patrones existentes flex-wrap/sm y grid-cols-1 sm:grid-cols-2 o3; IDs/labels/aria-invalid/aria-describedby y alerts asociados Concordancia del mensaje de motivo mínimo: carácter en singular cuando minChars=1, sin cambiar el mínimo ni los demás consumidores.
- **Fuentes:** apps/web/app/(app)/proyectos/[id]/subcontratos/[subcontractId]/page.tsx; apps/web/app/(app)/proyectos/[id]/subcontratos/[subcontractId]/certificaciones/[certId]/page.tsx; apps/web/features/certifications/components/certification-form.tsx; apps/web/features/certifications/components/certification-edit-form.tsx; apps/web/components/ui/reason-alert-dialog.tsx.
- **Regresión:** inspección estática y muestra visual actual en visual-checks.json; sin nuevo test cosmético; reason-copy-lint.log y reason-copy-interactions.log:58 casos, sin tests nuevos por copy cosmético.

### GA-AG-08-030 — Tiempo suficiente para las transacciones protegidas del circuito

- **P2; corregido y verificado localmente.** Alias: AG08-TX-TIMEOUT.
- **Observado:** P2028 demostrado con el límite implícito de 5s en ocho transacciones del circuito. La carrera AR de edición se reprodujo con el error real tras añadir diagnóstico, sin relajar su aserción.
- **Corrección:** Opciones acotadas timeout30s/maxWait10s en las operaciones demostradas. Se conservan todos los locks, relecturas, auditoría y reglas; no se cambia el timeout global ni se afirma un benchmark.
- **Fuentes:** certification/certification.service.ts:createCertification; ar/sales-invoice.service.ts:updateSalesInvoice; ar/credit-debit-note.service.ts:issueSalesCreditNote/issueSalesDebitNote; ap/supplier-invoice.service.ts:issueSupplierInvoice; ap/payment.service.ts:createPayment; ap/credit-debit-note.service.ts:createNoteDraft/issueSupplierDebitNote.
- **Regresión:** certification-flow-audit-guard-live.log; certification-flow-race-repeat-live.log y certification-flow-race-fixed-live.log; certification-connections-final-live.log y certification-note-emission-fixed-live.log; subcontracts-residual-final-live.log y rechecks de lifecycle/debit-note/last-two.

## Guía, ayuda y Bloqer AI

Guía §§10–11/16 y nueve fichas de ayuda actualizadas en el mismo lote. El índice distribuido agrega SUBCONTRACTS y fue regenerado/verificado; cinco pruebas de recuperación comprueban circuito AP, no negativos, NC/ND, fuentes no disponibles y motivos. No se ejecutó un proveedor LLM. La tool de resumen de certificaciones conserva schema/requiredModules y hereda los guards de su servicio; no se introdujo una tool nueva. Refactors internos y locks no agregan pasos visibles.

## Verificación y revisión independiente

- **General:** pnpm run test --force --concurrency=2, 2.528 aprobadas, cero fallos. 36 suites live omitidas, separadas de las corridas SQL. Artefacto workspace-test-source-final.log. La repetición focal58/58 tras el último copy no se suma como cobertura nueva.
- **SQL:** 90 casos distintos aprobados, deduplicados por archivo+título y última ejecución, no una única corrida monolítica.22 certificados,17 conexiones,11 del circuito legado y40 subcontratos. SQL real aislado, incluidos locks, interleavings, rollback y obligaciones. sql-deduplicated-results.json conserva intentos, casos y revalidaciones.
- **Tipos/lint:** 13 tareas de tipos y lint general aprobados. El último cambio de concordancia pasó lint focal y las58 interacciones existentes; el build final también revisó tipos/lint web.
- **Compilación:** pnpm run build final aprobado, VERCEL ausente, ambas URLs a loopback inalcanzable y proveedores deshabilitados. 73 archivos fuente modificados/sin seguimiento fijados en build-source-freeze.json, sin variación posterior. workspace-build-copy-final.result.json acredita la versión del último mensaje corregido.
- **Conocimiento:** índice reproducible de 576 fragmentos regenerado/verificado y cinco recuperaciones aprobadas; sin proveedor LLM. Guía y nueve fichas actualizadas. El copy singular/plural no cambia Motivo, mínimo o flujo y no está citado literalmente en ayuda: sin impacto documental/AI adicional.
- **Independiente:** /root/ag08_verification ejecutó 182 focales iniciales y 193 en la adenda; se solapan y no se suman. Reprodujo cuatro estados del loader AP, comprobó equivalencia de los hunks de timeout/format y terminó con 65 hashes coincidentes. Los últimos deltas cosméticos fueron inspeccionados, sin atribuirles pruebas nuevas. Artefactos independent-final-review.json e independent-final-delta-review.json.

### Fallos y revalidación

- Los tres fallos iniciales de certificaciones fueron una proyección WBS nueva sin budgetId y una recepción de fixture sin proveedor. Corregidos; tres rechecks más el caso global nuevo completan22. No se conservaron como bugs vigentes ni se sumaron repeticiones.
- La primera fixture de subcontratos chocó con membership único; su TX se revirtió. Se repararon usuarios/cleanup. El presupuesto compartido necesitó una adenda real version2/parentBudgetId; una indicación inicial errónea del coordinador usó isPrimary, campo inexistente. Se quitó, se tipó de nuevo y el caso pasó; sin cambiar schema.
- Se reprodujeron P2028 por límites implícitos de 5 s en ocho operaciones conectadas. Se configuraron 30 s/maxWait10s en forma acotada y se revalidaron los casos afectados sin quitar locks, auditoría o reglas. La carrera de edición AR obtuvo diagnóstico concreto y su recheck pasó.
- El primer runner general encontró nueve fallos de mocks antiguos incompletos ante los nuevos grafos/validators. Se completaron fixtures y se conservaron los 75 controles de lifecycle, incluido el mutante que demuestra el efecto de quitar Project. El general final pasó completo. Un intento anterior con opciones mal enviadas a pnpm terminó antes de ejecutar pruebas; no aporta cobertura.
- El primer build terminó con EPERM al crear un directorio temporal .next. Se repitió con escritura autorizada, fuentes idénticas y DB desconectada; compiló. Tras corregir una concordancia visual se compiló nuevamente y pasó. La advertencia no bloqueante de Browserslist no se convirtió en una dependencia nueva.
- Una lectura AX parecía conservar una medición anterior. La captura directa tomada antes de recargar ya mostraba el importe nuevo y Editar habilitado; un segundo guardado alcanzó124,40 sin reload. La hipótesis de lock permanente se descartó, sin parche ni hallazgo confirmado ficticio. Los timeouts de espera del navegador no se contaron como fallos del producto.

### Muestra visual y operativa

Build de producción local sobre la base sintética, Owner del tenant legado. Se observó lista/detalle de certificaciones, medición y edición 4 dp con totales 123,40/124,40 y controles pending; diálogo móvil estable 366 px dentro de 390 px. Se creó contacto y subcontrato por UI, se comprobó 1,2345×3,3333→4,11 persistido, identidad protegida y requerido nativo sin perder datos. Se activó, creó certificado 0,1234→0,41, editó 0,2345→0,78 con navegación absoluta, emitió y anuló con motivo requerido. Se inspeccionó el formulario AR desde una certificación aprobada sin guardar factura. Último build mostró “mín.1carácter” correctamente.

Escritorio 1280×720 y teléfono emulado 390×844; claro/oscuro. En los formularios comprobados pageWidth 390 coincide con viewport 390; tablas conservan scroll interno. Diez capturas y observaciones en visual-checks.json/screenshots. No se presenta el emulado como dispositivo físico ni esta muestra como certificación WCAG/performance.

Logout, tema oscuro original, viewport y cierre de la pestaña comprobados. Ambas instancias propias se detuvieron y el puerto 3100 quedó libre. El legado conserva los datos sintéticos de UI, con IDs y alcance registrados; las suites nuevas limpian sus UUID. No hubo publicación, facturas/pagos reales, adjuntos, correos o LLM por navegador.

### Omitido y no ejecutado

Las 36 suites live del runner general no equivalen a aprobadas allí: sólo la selección SQL declarada se revalidó en esta etapa. No se ejecutó Playwright E2E completo, proveedores reales, workflows autenticados de producción, evaluación formal de accesibilidad/carga ni todos los roles/navegadores en UI. AR/AP/Tesorería/Contabilidad completas mantienen sus etapas; aquí se verificaron las fronteras demostradas.

Evidencia local: output/platform-audit/ag-08-2026-11-05/. Registro estructurado, selección reutilizable en TESTING_STRATEGY y manifiesto final conservan la trazabilidad.
## Cierre y continuación

AG-08 cerrada localmente, con 30 grupos corregidos y verificados en el alcance declarado, cero hallazgos confirmados pendientes. D-131/D-132 documentadas e implementadas. La separación de una eventual rectificación no es un bug abierto ni una promesa de función negativa. No hubo cambios de schema, migraciones, dependencias o entorno.

AG-07 ya está publicada en PR5/Production d897aa7f. AG-08 sigue sin publicar; este cierre no acredita despliegue productivo de sus correcciones. AG-09 no iniciada: esperar nueva indicación del Owner. Revalidar las conexiones afectadas si cambian scopes, schema, locks, fórmulas/snapshots, estados, notas fiscales, Actions, componentes compartidos o fuentes de ayuda.
