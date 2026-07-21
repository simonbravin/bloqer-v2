# Business Rules — Bloqer 2.0

> **Reglas de negocio globales y transversales**. Las reglas específicas de un módulo viven en su `02-modules/<MODULE>.md`. Acá viven las que **cruzan módulos** o son **estructurales**.

Cada regla tiene un ID `BR-<área>-NNN`. Citala así: `[BR-CERT-002]`.

---

## 1. Reglas de multitenancy

### BR-MT-001 — Aislamiento total de datos por tenant
- **Regla:** ninguna query puede leer ni escribir datos de un tenant distinto al del usuario autenticado.
- **Aplica:** todas las tablas operativas.
- **Origen:** [D-001].

### BR-MT-002 — `tenant_id` heredado
- **Regla:** al crear una entidad hija, su `tenant_id` se valida igual al de su padre. Nunca se ingresa manualmente.
- **Aplica:** toda creación de entidad relacionada.

### BR-MT-003 — Cross-tenant prohibido
- **Regla:** no se permite ninguna FK que cruce tenants. Mismo si dos empresas son grupo, se modela como dos tenants independientes (salvo decisión de [Q-001]).

---

## 2. Reglas de auditoría e inmutabilidad

### BR-AUD-001 — Toda acción crítica se audita
- **Regla:** crear, modificar, anular, aprobar, cerrar periodo, cambiar permisos: todo queda en `AuditLog`.
- **Aplica:** transversal.

### BR-AUD-002 — Comprobantes legales emitidos no se editan
- **Regla:** una vez confirmado/emitido, un comprobante con valor legal (OC, certificación, factura, recibo, orden de pago) **no se puede editar**. Solo se anula y se reemite.
- **Origen:** [D-025].
- **Aplica:** PurchaseOrder, Certification, SalesInvoice, PurchaseInvoice, Payment, Collection.

### BR-AUD-003 — Anulación con motivo obligatorio
- **Regla:** anular un comprobante en estado terminal exige texto de motivo (campo `cancellation_reason`) y queda auditado con quién y cuándo.

### BR-AUD-004 — Borrado físico prohibido para entidades operativas
- **Regla:** ninguna entidad operativa se borra físicamente. Se anula o se marca eliminada (soft-delete).

---

## 3. Reglas de moneda

### BR-CUR-001 — ARS es la moneda base
- **Regla:** todos los reportes consolidados se expresan en ARS. Toda entidad con dinero almacena moneda original + monto + FX + monto en ARS.
- **Origen:** [D-008].

### BR-CUR-002 — FX manual por movimiento
- **Regla:** el tipo de cambio se carga manualmente por movimiento y queda inmutable junto al monto. No hay servicio FX externo en Fase 1.

### BR-CUR-003 — Sin diferencias de cambio en Fase 1
- **Regla:** en Fase 1, no se calculan diferencias de cambio automáticamente. Cada movimiento mantiene su FX original. Ver [Q-025].

### BR-CUR-004 — Conversión a ARS obligatoria al confirmar
- **Regla:** ningún movimiento se confirma si no tiene FX cargado y monto en ARS calculado (cuando moneda ≠ ARS).

---

## 4. Reglas de proyecto

### BR-PROJ-001 — Project tiene cliente
- **Regla:** todo `Project` debe tener `client_id` apuntando a un Contact con rol `CLIENT`. Cliente único por proyecto.
- **Aplicable:** desde creación.

### BR-PROJ-002 — Tipo de obra inmutable después de primer presupuesto aprobado
- **Regla:** `project.project_type` (`PUBLIC` / `PRIVATE`) no se cambia una vez que hay un presupuesto aprobado, porque cambia las reglas de sobrecertificación.

### BR-PROJ-003 — Estado del proyecto vs operación
- **Regla:** un proyecto en estado `ON_HOLD`, `COMPLETED` o `CANCELLED` no admite nuevas certificaciones, OCs ni movimientos imputados a él. Solo lectura operativa. Un proyecto `DRAFT` no admite operaciones financieras ni operativas de obra; presupuesto/WBS en planificación sí ([D-042]).

### BR-PROJ-004 — Cancelación no destructiva
- **Regla:** cancelar un proyecto **no elimina** presupuestos, facturas, pagos, cobros ni movimientos imputados. Congela la obra en solo lectura operativa.
- **Origen:** [D-042].

### BR-PROJ-005 — Cancelar obra en curso
- **Regla:** cancelar desde `ACTIVE` o `ON_HOLD` requiere rol **OWNER** o **ADMIN** ([PERM-007]), motivo obligatorio, y **bloqueo** si existen documentos operativos abiertos: OC `ISSUED`/`PARTIALLY_RECEIVED`, certificaciones `DRAFT`/`ISSUED`/`APPROVED`, facturas AP/AR `ISSUED`, cobros/pagos `CONFIRMED`, C×C/C×P `OPEN`/`PARTIAL`/`OVERDUE`, subcontratos `ACTIVE`.
- **Origen:** [D-042].

### BR-PROJ-006 — Reactivación de obra cancelada
- **Regla:** `CANCELLED` → estado previo guardado en `status_before_cancellation` al cancelar; solo **OWNER** o **ADMIN** ([PERM-007]); motivo obligatorio; auditado (`project.reactivated`). Si no hay estado previo persistido, fallback conservador: `DRAFT` si la obra no tuvo actividad operativa; si no, `ON_HOLD`.
- **Origen:** [D-042].

---

## 5. Reglas de presupuesto

### BR-BUD-001 — Una versión activa por proyecto
- **Regla:** un proyecto tiene **un único** presupuesto activo. Las adendas/fases nacen como Budgets adicionales con `parent_budget_id` apuntando al activo.
- **Origen:** [D-002].

### BR-BUD-002 — Presupuesto cerrado solo se modifica con adenda
- **Regla:** `Budget.status = CLOSED` es la **base contractual/comercial**. No se modifica directamente el cómputo vendido ni condiciones de venta. Cualquier cambio de **monto, alcance vendido, condiciones vendidas o WBS contractual** requiere **Adenda** (u homólogo formal) y **Budget** complementario / fase adicional ([D-005]). Un **Change Order** aprobado **no** alcanza solo para ese fin ([BR-CO-003]).
- **Origen:** [D-005].

### BR-BUD-003 — Adendas siempre suman, nunca reemplazan
- **Regla:** la lectura del "presupuesto del proyecto" es la **suma** del activo más todas las adendas/fases activas. Ninguna versión sustituye a otra.

### BR-BUD-004 — Sin “desaprobar” informalmente
- **Regla:** pasar a `APPROVED` es decisión formal. La vuelta atrás desde revisión es **`RETURNED_FOR_CHANGES`** (evento `budget.returned_for_changes`) o **`DRAFT`** por descarte explícito — siempre **auditada**, no edición encubierta bajo `IN_REVIEW`.

### BR-BUD-005 — Análisis de costos requerido para aprobar
- **Regla:** un Budget no puede pasar a `APPROVED` si tiene `CostItem`s sin `CostAnalysisLine` (cada ítem debe tener composición de costo).

### BR-BUD-006 — APPROVED: estructura económica bloqueada, metadata editable
- **Regla:** con `Budget.status = APPROVED`, **no** se pueden modificar montos, WBS, cantidades, precios unitarios, fórmulas comerciales, margen, impuestos ni estructura económica. **Sí** se pueden editar datos **no estructurales**: notas internas, adjuntos, responsable, tags y metadata no económica. Cualquier cambio económico o de alcance presupuestario requiere **nuevo proceso formal** (típicamente **Adenda + Budget hijo**, o política de nueva versión / supersede acordada).
- **Origen:** alineado a [D-005] y tabla en [`STATE_MACHINES.md`](./STATE_MACHINES.md) § Budget.

### BR-BUD-007 — IN_REVIEW no es aprobado ni editable en lo estructural
- **Regla:** `IN_REVIEW` **no** cuenta como presupuesto aprobado. **Prohibidos** cambios estructurales (WBS, cantidades, PU, fórmulas, márgenes, impuestos, moneda, alcance vendido, condiciones contractuales, plazos de pago frente a cliente). Permitidos: **comentarios de revisión**, **adjuntos de revisión** y metadata no económica acotada al workflow. Para corregir números/estructura → **`RETURNED_FOR_CHANGES`** (o `DRAFT` si se descarta la ronda) y luego **`IN_REVIEW`** de nuevo ([D-030]).

### BR-BUD-008 — CLOSED: whitelist estricta de metadata
- **Regla:** con `Budget.status = CLOSED`, solo se editan campos de la **lista blanca**: `internal_notes`, `attachments`, `tags`, `display_order`, `non_contractual_reference_code`, `assigned_internal_responsible`. **Prohibido** modificar WBS, cantidades, PU, fórmulas de costo, márgenes, impuestos, precio de venta, moneda, alcance frente a cliente, términos contractuales, plazos de pago ni cualquier campo que alimente certificaciones, contratos, adendas, reportes o rentabilidad. El cómputo vendido cambia solo vía **Adenda** + budget hijo ([BR-BUD-002], [D-030]).

---

## 6. Reglas de certificación

### BR-CERT-001 — Solo sobre presupuesto vigente
- **Regla:** certificar requiere que exista al menos un Budget en estado `APPROVED` o `CLOSED` para el proyecto.

### BR-CERT-002 — Sobrecertificación según tipo de obra
- **Regla:**
  - **`PUBLIC`**: el avance acumulado por ítem no puede superar el 100% del presupuesto vigente. Si se requiere, primero adenda. **Bloqueante**.
  - **`PRIVATE`**: permitido superar el 100%, requiere **nota aclaratoria** y muestra **alerta visible**. **No bloqueante**.
- **Origen:** [D-004].

### BR-CERT-003 — Avance físico y económico por línea
- **Regla:** cada `CertificationLine` registra avance físico (%) y económico ($) **independientemente**. Pueden no coincidir (ej. acopio de materiales certificados como avance económico sin avance físico ejecutado).
- **Origen:** [D-003].

### BR-CERT-004 — Certificación emitida no se edita
- **Regla:** una `Certification` con `status` en `ISSUED`, `APPROVED` o `REJECTED` es inmutable. Corregir vía anulación (`CANCELLED`) y reemisión.

### BR-CERT-005 — Anulación de certificación afecta AR
- **Regla:** anular una certificación que tenga **`SalesInvoice` / `Receivable` asociadas** debe resolver esas obligaciones según política (anular factura/AR, notas de crédito, etc.).

### BR-CERT-006 — Estados retroceden solo por anulación
- **Regla:** el `status` de la certificación **no retrocede** (p. ej. de `APPROVED` a `ISSUED`). Las facturas y cobranzas **no** cambian el `status`; actualizan solo el **`payment_status` derivado**. Solo se anula el documento y se reemite uno nuevo si corresponde.

### BR-CERT-PAYMENT-001 — Estado de pago de certificación derivado de AR y cobranzas
- **Regla (EN):** Certification `payment_status` is derived from receivables and collections (payment applications), never manually set as the main certification lifecycle state.
- **Regla (ES):** el campo `payment_status` de la certificación se **deriva** de las `Receivable` vinculadas y de las **cobranzas** (`Collection` y sus aplicaciones). **No** forma parte del ciclo de vida principal (`status`) y **no** se establece manualmente en operación normal; solo vía **ajuste financiero excepcional** auditado (misma gobernanza que correcciones de saldos AR). Los recálculos y la mora se explicitan con **`receivable.payment_status_recalculated`** y **`receivable.overdue_detected`** ([D-031]); **no** mutan `Certification.status`.

### BR-CERT-007 — Certification sin estado INVOICED
- **Regla:** `Certification.status` **no** incluye `INVOICED`. Saber si está facturada = existe **`SalesInvoice` / `Receivable`** vinculada a la certificación (p. ej. `certification_id`), no un valor de `status` ([D-026]).

---

## 7. Reglas de compras y vistas de costo (reporting)

### BR-COS-001 — Comprometido, devengado y pagado (definiciones)
- **Regla:** las magnitudes `committed_amount`, `accrued_amount`, `paid_amount`, `open_committed_amount` y `expected_cost_exposure` para **costos de proyecto** se definen **solo** como en [`04-formulas/COST_FORMULAS.md`](../04-formulas/COST_FORMULAS.md) §1. Los reportes Presupuesto vs real, rentabilidad, compras y KPIs de costo deben **etiquetar** la vista usada.
- **Origen:** [D-021] (ampliado).

### BR-COS-002 — Exposición esperada de costo sin doble conteo
- **Regla:** el **costo total esperado** para reporting se calcula como  
  \(\text{expected\_cost\_exposure} = \text{accrued\_amount} + \text{open\_committed\_amount}\)  
  con \(\text{open\_committed\_amount} = \text{committed\_amount} - \text{accrued\_amount\_linked\_to\_that\_commitment}\).  
  **Prohibido** sumar \(\text{committed\_amount} + \text{accrued\_amount}\) cuando el devengado ya está vinculado al mismo compromiso (p. ej. factura contra OC).
- **Origen:** alineado a [BR-PUR-003] y [D-021].

### BR-PUR-001 — OC confirmada impacta costo
- **Regla:** confirmar una `PurchaseOrder` registra el compromiso de costo en el proyecto, aún sin factura ni recepción.
- **Origen:** [D-006].

### BR-PUR-002 — Compra directa también impacta
- **Regla:** una `PurchaseInvoice` sin OC asociada impacta costo en el proyecto al confirmarse.
- **Origen:** [D-006].

### BR-PUR-003 — Doble impacto prohibido
- **Regla:** una factura con `po_id` no genera nuevo compromiso; aplica el compromiso de la OC. La factura solo materializa la deuda (Payable). El reporting usa `accrued_amount_linked_to_that_commitment` y [BR-COS-002] para no duplicar comprometido + devengado.

### BR-PUR-004 — Recepción exige OC confirmada
- **Regla:** una `Receipt` solo se confirma si la OC referenciada está en `CONFIRMED` o posterior.

### BR-PUR-005 — Recepciones parciales permitidas
- **Regla:** una `PurchaseOrder` puede recibirse en múltiples `Receipt`s parciales hasta cubrir las cantidades.

### BR-PUR-006 — Sobrerrecepción bloqueada con tolerancia configurable
- **Regla:** la suma de cantidades recibidas no puede exceder la cantidad de la OC en más de un % configurable por empresa (default 0%, máximo configurable 5%).

### BR-PUR-007 — Imputación WBS obligatoria en compras de proyecto
- **Regla:** toda línea de `PurchaseRequest` y `PurchaseOrder` con `project_id` **debe** tener `wbs_node_id` apuntando a un nodo WBS `ITEM` de un presupuesto `APPROVED` o `CLOSED` del mismo proyecto. Los gastos generales / indirectos de obra se imputan a **partida(s) WBS** presupuestables del proyecto, no a líneas sin WBS. Compras sin proyecto (overhead de empresa) siguen la vía corporativa ([D-035], [D-040]), no este flujo.
- **Origen:** [D-050](../00-product/DECISION_LOG.md).

### BR-PUR-008 — Solicitud obligatoria sobre umbral
- **Regla:** si el monto estimado en ARS de una OC directa o compra supera `CompanyProcurementSettings.purchaseRequestRequiredAboveArs`, debe existir una `PurchaseRequest` completada con cotizaciones mínimas antes de confirmar la OC, salvo compra de emergencia documentada por OWNER/ADMIN con `emergencyReason` obligatorio y política `allowEmergencyDirectPo` habilitada.
- **Origen:** [D-044](../00-product/DECISION_LOG.md), [D-050](../00-product/DECISION_LOG.md).

### BR-PUR-009 — Tiers de varianza presupuestaria en OC
- **Regla:** al enviar una OC, cada línea calcula `varianceTier`: `NONE` (&lt; soft %), `NOTE_REQUIRED` (soft–extra %), `EXTRA_APPROVAL` (≥ extra %), `UNIT_MISMATCH` (unidad distinta al WBS), `NO_BUDGET_BASELINE` (sin costo APU). `NOTE_REQUIRED` y superiores exigen `varianceJustification`; `EXTRA_APPROVAL` exige aprobador de alto nivel. **OC directa y OC desde solicitud** usan el mismo cálculo; la OC directa debe capturar `budgetUnitCostSnapshot` al crear/enviar si el WBS tiene baseline.
- **Origen:** [D-044](../00-product/DECISION_LOG.md), [D-050](../00-product/DECISION_LOG.md).

### BR-PUR-010 — Cotizaciones mínimas antes de seleccionar
- **Regla:** no se puede generar OC desde cotización hasta tener al menos `minQuotesRequired` cotizaciones en estado `RECEIVED` para la solicitud, y la cotización elegida no debe estar vencida (`validUntil`). Cada cotización debe incluir **precio por línea** y **plazo de entrega** comparable ([D-050]).
- **Origen:** [D-044](../00-product/DECISION_LOG.md), [D-050](../00-product/DECISION_LOG.md).

### BR-PUR-011 — Costo referencial y saldo de partida visibles
- **Regla:** al cargar o enviar SC/OC, la UI y el service exponen el **costo unitario referencial** de la partida (snapshot / APU) y el **saldo disponible** (presupuestado − comprometido abierto − real, ver [`COST_FORMULAS.md`](../04-formulas/COST_FORMULAS.md)). Si al confirmar la OC el compromiso de la línea haría superar el presupuestado de la partida, el sistema **alerta**; el bloqueo duro es configurable por empresa (default: alerta + justificación, sin bloqueo automático en Fase 1).
- **Origen:** [D-050](../00-product/DECISION_LOG.md).

### BR-PUR-012 — Matching tres vías y tolerancia en factura
- **Regla:** la factura de proveedor vinculada a OC se valida contra cantidades/precios de OC y, cuando existe, contra cantidades **recibidas**. Desvíos dentro de la tolerancia de empresa se permiten con registro; fuera de tolerancia requieren justificación y, si supera umbral de varianza, aprobación FINANCE/OWNER/ADMIN según política AP.
- **Origen:** [D-020], [D-050](../00-product/DECISION_LOG.md).

### BR-PUR-013 — Cierre parcial de OC
- **Regla:** una OC en `PARTIALLY_RECEIVED` (o `CONFIRMED` con saldo pendiente que no se recibirá) puede **cerrarse** dejando el saldo sin recibir: el `committed_amount` abierto se reduce al monto efectivamente comprometido/recibido según política de reporting; no se anula si ya hay recepciones confirmadas o facturas activas (usar cierre, no `CANCELLED`).
- **Origen:** [D-050](../00-product/DECISION_LOG.md).

### BR-PUR-014 — Periodo cerrado en compras
- **Regla:** confirmar OC, confirmar recepción o emitir/aprobar factura de compra que afecte un periodo **CLOSED** está bloqueado ([BR-TRZ-003] / [BR-PER-001]), salvo reapertura del periodo con motivo. Crear borradores en periodo que aún no cierra está permitido.
- **Origen:** [D-014], [D-050](../00-product/DECISION_LOG.md).

### BR-PUR-015 — Notificaciones de procurement
- **Regla:** cambios de estado de SC/OC disparan notificación **in-app** y **email** a destinatarios según rol (compras, aprobadores, solicitante). Documentos pendientes de aprobación o SC sin cotizar generan **recordatorio por antigüedad** (SLA configurable; default sugerido 48–72 h) con escalamiento a OWNER/ADMIN. El fallo de email no debe abortar la mutación de negocio (best-effort).
- **Origen:** [D-050](../00-product/DECISION_LOG.md).

### BR-PUR-016 — Rechazo / devolución de OC
- **Regla:** desde `SUBMITTED`, un aprobador autorizado puede devolver la OC a `DRAFT` con **motivo obligatorio** (auditado). El origen/creador edita y reenvía. No existe “des-aprobar” un `APPROVED`/`CONFIRMED`: se anula o se cierra según [BR-PUR-013] y reglas de anulación.
- **Origen:** [D-050](../00-product/DECISION_LOG.md).

### BR-APR-004 — Segregación solicitante vs aprobador OC
- **Regla:** quien originó la solicitud (`originRequestedByUserId` o `PurchaseRequest.requestedByUserId`) no puede aprobar la OC vinculada, salvo `allowSelfApproval` y sin varianza `EXTRA_APPROVAL` ni umbral de alto monto.
- **Origen:** [D-044](../00-product/DECISION_LOG.md).

### BR-APR-005 — Factura directa a obra sobre umbral
- **Regla:** una `SupplierInvoice` de proyecto sin `purchaseOrderId` cuyo total en ARS supere `purchaseRequestRequiredAboveArs` solo puede registrarse por roles con `APPROVE AP` u OWNER/ADMIN, salvo que exista OC confirmada o solicitud completada que respalde el gasto.
- **Origen:** [D-044](../00-product/DECISION_LOG.md).

---

## 8. Reglas de inventario

### BR-INV-001 — Stock por depósito, nunca global
- **Regla:** todo movimiento se registra contra un `Warehouse`. El stock global es agregación de los depósitos.
- **Origen:** [D-022].

### BR-INV-002 — Stock no puede ser negativo (en confirmado)
- **Regla:** un `StockMovement` confirmado de tipo `OUT` o `TRANSFER_OUT` no puede dejar el saldo en negativo. Excepción: ajuste manual con motivo (`ADJUSTMENT`).

### BR-INV-003 — Transferencia interna = par de movimientos
- **Regla:** una transferencia entre depósitos genera **dos** `StockMovement` con el mismo `transfer_id`: `TRANSFER_OUT` en origen, `TRANSFER_IN` en destino.

### BR-INV-004 — Método de valuación inmutable después del primer movimiento
- **Regla:** una vez que un depósito tiene movimientos, su método de valuación no puede cambiar. Para cambiar, requerir saldo cero o proceso especial.
- **Origen:** [D-007], [Q-018].

### BR-INV-005 — Recepción genera ingreso de stock
- **Regla:** confirmar una `Receipt` con `warehouse_id` genera automáticamente `StockMovement IN` por cada línea con producto.

### BR-INV-006 — Reservas restan disponible
- **Regla:** una `StockReservation` activa baja del **stock disponible** pero no del **stock real**. El stock real solo cae al egresar.
- **Origen:** [D-034].

### BR-INV-008 — Reserva consumida vincula StockMovement
- **Regla:** pasar una `StockReservation` a `CONSUMED` implica **vínculo** al **`StockMovement`** (egreso/consumo) que materializa la salida. Sin movimiento, no hay consumo reconocido.
- **Origen:** [`STATE_MACHINES.md`](./STATE_MACHINES.md) §25 StockReservation.

### BR-INV-007 — Anulación de movimiento de stock confirmado
- **Regla:** un `StockMovement` en `CONFIRMED` **no** se elimina físicamente. La anulación pasa por transición a `CANCELLED` con **movimiento compensatorio** (cantidades opuestas, referencia al original) **o** procedimiento explícito tenant auditado que deje el mismo efecto en saldos.
- **Origen:** alineado a [`STATE_MACHINES.md`](./STATE_MACHINES.md) §9 StockMovement.

---

## 9. Reglas de tesorería

### BR-TRZ-001 — Movimiento siempre tiene cuenta
- **Regla:** todo `AccountMovement` pertenece a una `Account` activa.

### BR-TRZ-002 — Estado terminal protegido
- **Regla:** un `AccountMovement` con status `RECONCILED` no se puede modificar. Solo se desconcilia (cambio a `CONFIRMED`) si el movimiento no está en periodo cerrado.

### BR-TRZ-003 — Periodo cerrado bloquea
- **Regla:** un `AccountMovement` con `date_accounting` dentro de un `Period` cerrado no se crea, edita ni anula sin reabrir el periodo.
- **Origen:** [D-014].

### BR-TRZ-004 — Transferencia interna par
- **Regla:** una `InternalTransfer` genera exactamente 2 `AccountMovement` con `transfer_id` compartido. Una sin la otra es inconsistente.
- **Origen:** [D-023].

### BR-TRZ-005 — Pago no puede exceder saldo de Payable
- **Regla:** la suma de `Payment.applies_to[].amount` aplicada a una `Payable` no puede exceder su `balance` actual.

### BR-TRZ-006 — Cobranza no puede exceder saldo de Receivable
- **Regla:** simétrico al BR-TRZ-005 para `Collection` y `Receivable`.

### BR-TRZ-007 — Pagos parciales permitidos
- **Regla:** un `Payment` puede aplicarse a una `Payable` por menos que su `balance` total. La Payable queda en `PARTIAL` hasta que se complete.
- **Origen:** [D-010].

### BR-TRZ-008 — Anulación de pago restaura saldo
- **Regla:** anular un `Payment` restaura el `balance` y `paid_amount` de las Payables que afectaba, y anula su `AccountMovement`.

---

## 10. Reglas de AR/AP

### BR-AR-001 — Receivable nace de fuente o manual
- **Regla:** una `Receivable` se crea desde:
  1. `SalesInvoice` confirmada (auto).
  2. Carga manual (con motivo).
- **Origen:** [D-009].

### BR-AR-002 — Estado se deriva del saldo
- **Regla:** el `status` de Receivable/Payable se calcula:
  - `OPEN` si `paid_amount = 0` y no vencida.
  - `PARTIAL` si `0 < paid_amount < total`.
  - `PAID` si `paid_amount = total`.
  - `OVERDUE` si vencida y `paid_amount < total`.
  - `CANCELLED` si anulada manualmente.
- No se setea a mano salvo `CANCELLED`.

### BR-AR-003 — Project_id opcional
- **Regla:** Receivable y Payable pueden no tener proyecto (deuda/crédito general de la empresa).
- **Origen:** [D-009].

### BR-AR-004 — Facturas anuladas anulan AR/AP
- **Regla:** anular una `SalesInvoice` o `PurchaseInvoice` anula automáticamente su `Receivable` o `Payable` (cascada controlada).

---

## 11. Reglas de impuestos y retenciones

### BR-TAX-001 — Carga manual
- **Regla:** todas las retenciones, percepciones e impuestos se cargan manualmente por movimiento. Sin motor automático.
- **Origen:** [D-011].

### BR-TAX-002 — Aplicación: % sobre base o monto fijo
- **Regla:** una `TaxLine` define `tax_type_id`, `base` (monto sobre el que aplica), `rate` (%) o `amount` (monto fijo), y signo (+ percepción, - retención).

### BR-TAX-003 — Retenciones no afectan el total facturado
- **Regla:** las retenciones reducen el monto **a pagar/cobrar** pero no el monto **facturado**. La factura mantiene su total bruto, el pago/cobranza se hace por neto.

### BR-TAX-004 — Reportes de impuestos por periodo
- **Regla:** sistema permite reporte de impuestos retenidos/percibidos por periodo, por tipo, por contraparte.

---

## 12. Reglas de aprobaciones

### BR-APR-001 — Roles con permiso APPROVE
- **Regla:** solo roles con `APPROVE` sobre el módulo pueden confirmar/aprobar comprobantes.
- **Origen:** [D-012].

### BR-APR-002 — Umbral de aprobación de OC (configurable)
- **Regla:** si Admin configura `poApprovalThresholdArs`, las OCs con total ARS ≥ umbral requieren aprobación de OWNER/ADMIN. El desvío `EXTRA_APPROVAL` también exige alto nivel ([BR-PUR-009]). Ver [Q-017] (cerrada), [D-044], [D-050].
- **Origen:** [D-012], [D-044], [D-050].

### BR-APR-003 — Self-approval permitido por defecto
- **Regla:** quien tiene `APPROVE` puede aprobar su propia creación, salvo configuración explícita de "4 ojos". En OC, la segregación con el **solicitante de origen** prevalece vía [BR-APR-004] y `allowSelfApproval`.

---

## 13. Reglas de ciclo de vida

### BR-LIFE-001 — Estados terminales son terminales
- **Regla:** estados `CANCELLED`, `PAID`, `CLOSED` (según entidad) no admiten transición a estado anterior. Solo lectura.

### BR-LIFE-002 — Estado vencido es derivado
- **Regla:** `OVERDUE` se calcula a partir de `due_date` y saldo. No se setea ni se almacena fijo (puede materializarse para performance, pero la semántica es derivada).

### BR-LIFE-003 — Anulación es transición explícita
- **Regla:** anular es **siempre** una transición de estado documentada en `STATE_MACHINES.md`, no un atajo (no es "borrar").

---

## 14. Reglas de cierre de periodo

### BR-PER-001 — Solo Admin/Owner cierran
- **Regla:** solo roles `ADMIN` y `OWNER` pueden cerrar/reabrir periodos.
- **Origen:** [D-014].

### BR-PER-002 — Cierre bloquea edición de movimientos
- **Regla:** cerrar un `Period` impide editar/anular `AccountMovement`s con `date_accounting` dentro del rango.

### BR-PER-003 — Reapertura queda auditada
- **Regla:** reabrir un periodo cerrado registra usuario, motivo, timestamp.

### BR-PER-004 — Cierre no bloquea operaciones futuras
- **Regla:** cerrar el periodo Mar-2026 no impide registrar operaciones de Abr-2026 ni futuras.

---

## 15. Reglas de cronograma

### BR-SCH-001 — Cronograma del proyecto único
- **Regla:** un proyecto tiene a lo sumo un `Schedule`. Tareas/hitos viven dentro.

### BR-SCH-002 — Avance del cronograma vs avance certificado
- **Regla:** el avance del cronograma es **distinto** del avance certificado. Pueden mostrarse comparados pero no son lo mismo.

### BR-SCH-003 — Ítem bloqueado con causa
- **Regla:** pasar un `ScheduleItem` a `BLOCKED` requiere **`block_reason`** no vacío (texto). Desbloquear (`IN_PROGRESS`) registra actor y timestamp.
- **Origen:** [`STATE_MACHINES.md`](./STATE_MACHINES.md) §27.

### BR-SCH-004 — Sincronización de avance real desde libro de obra
- **Regla:** al **aprobar** un parte de obra (`JobsiteLog` → `APPROVED`), el sistema recalcula y persiste `ScheduleItem.progressPct` para cada ítem de cronograma cuyo WBS primario aparece en las líneas de avance del parte, según [D-045].
- **Regla:** no se sincroniza en `DRAFT`, `SUBMITTED` ni `RETURNED`; tampoco si el acumulado físico del WBS supera 100 %.
- **Regla:** el avance **plan temporal** (curva tiempo vs fechas), el avance **por cantidad** y el **certificado** no se sobrescriben con esta operación.
- **Origen:** [D-045]; procedimiento en [`../05-workflows/PROGRESS_AND_SCHEDULE_PROCEDURE.md`](../05-workflows/PROGRESS_AND_SCHEDULE_PROCEDURE.md).

---

## 16. Reglas de subcontratos

### BR-SUB-001 — Subcontrato se imputa a proyecto
- **Regla:** un `Subcontract` siempre tiene `project_id`.

### BR-SUB-002 — Subcontratista es Contact con rol
- **Regla:** un Subcontract apunta a un `Contact` que tiene rol `SUBCONTRACTOR`.
- **Origen:** [D-016].

### BR-SUB-003 — Payable solo al aprobar certificación de subcontrato
- **Regla:** una `SubcontractCertification` genera o incrementa **`Payable` únicamente** al pasar a **`APPROVED`**. En **`SUBMITTED`** no hay AP. En **`REJECTED`** no se genera AP. En **`CANCELLED`**, si ya existía obligación, se revierte por **mecanismo compensatorio** auditado. No hay política configurable “ISSUED o APPROVED” ([D-028]).

### BR-SUB-004 — settlement_status en subcontrato (no payment_status)
- **Regla:** el indicador derivado de liquidación frente a AP/pagos del **subcontrato** se llama **`settlement_status`**: `UNSETTLED` \| `PARTIALLY_SETTLED` \| `SETTLED` \| `OVERDUE`. **No** reutilizar el nombre `payment_status` en `SubcontractCertification` para evitar confusión con certificación **a cliente** (`payment_status` + AR) ([D-027]).

### BR-SUB-005 — Rechazo de certificación subcontrato: nueva versión
- **Regla:** `SubcontractCertification` en **`REJECTED`** es **terminal** para ese documento. No se reabre a `DRAFT`. La corrección es un **nuevo** certificado con **`replaces_certification_id`** (o campo equivalente) al rechazado ([D-033]).

---

## 17. Reglas de change orders y RFIs

### BR-CO-001 — Change order requiere proyecto
- **Regla:** un `ChangeOrder` está atado a un `Project` y opcionalmente a un `Contract`.

### BR-CO-002 — Change Order aprobado: trazabilidad operativa, no sustituto de adenda
- **Regla:** un `ChangeOrder` **aprobado** documenta el cambio operativo (alcance, plazo, cantidades, costo estimado). **No** modifica por sí solo el presupuesto **`CLOSED`** ni el **contrato / precio vendido / WBS contractual cerrada**. Para impactar esa base hace falta **Adenda** (instrumento contractual/económico) y el **Budget** complementario asociado. El CO puede **originar** una adenda.

### BR-CO-003 — Regla fuerte: precio vendido o WBS contractual cerrada ⇒ Adenda
- **Regla:** si cambia el **precio vendido**, el **alcance contractual** o la **WBS contractual** asentada en base cerrada/contrato, el vehículo obligatorio es **Addendum/Adenda** (+ presupuesto complementario). El **Change Order solo** no alcanza.

#### Tabla — Change Order vs Addendum / Adenda

| Dimensión | Change Order | Addendum / Adenda |
|---|---|---|
| Naturaleza | Solicitud / control **operativo** de cambio | Instrumento **contractual y económico** |
| Origen típico | Cliente, obra, RFI, imprevisto, decisión interna | Negociación contractual; puede **nacer** de un CO aprobado |
| Contenido | Describe alcance, plazo, cantidades, **costo estimado** | Modifica monto, alcance vendido, condiciones vendidas, **WBS contractual** |
| Presupuesto `CLOSED` / contrato vendido | **No** lo altera por sí solo | **Sí** impacta la base contractual/comercial (vía nuevo Budget complementario) |
| Regla fuerte | No sustituye adenda si cambia lo **vendido** contractualmente | Obligatorio cuando cambia precio vendido, alcance contractual o WBS contractual cerrada |

### BR-ADD-001 — Adenda: solo firmada impacta base contractual
- **Regla:** efectos sobre **base contractual/comercial** (p. ej. aplicar `Budget` complementario, actualizar referencias de contrato vigente para reporting) requieren `Addendum.status = SIGNED`. `APPROVED` o `IN_REVIEW` **no** sustituyen una adenda firmada.
- **Origen:** [`STATE_MACHINES.md`](./STATE_MACHINES.md) §4.2 Addendum.

### BR-RFI-001 — RFI: cierre con o sin respuesta
- **Regla:** transición típica `ANSWERED` → `CLOSED` con respuesta registrada. Pasar de `SUBMITTED` → `CLOSED` **sin** respuesta está permitido **solo** con `closure_without_response_reason` obligatorio y permiso acorde (auditoría).
- **Origen:** [`STATE_MACHINES.md`](./STATE_MACHINES.md) §16 Rfi.

### BR-RFI-002 — RFI vencido es derivado (no estado)
- **Regla:** la condición “vencido” es **`is_overdue`** (o job `recompute_overdue_rfis` / evento `rfi.overdue`) cuando `due_date` pasó, `status = SUBMITTED` y no está cerrado ni cancelado. **No** es un valor de `status`.

---

## 18. Reglas del libro de obra

### BR-JL-001 — Una entrada por día por proyecto (recomendado)
- **Regla:** se permite, pero no se exige, una entrada de `JobsiteLogEntry` por día por proyecto. Sí debe haber al menos `date` y `created_by`.

### BR-JL-002 — Adjuntos opcionales
- **Regla:** una entrada puede tener fotos y otros adjuntos via `Document`.

### BR-JL-003 — Consumo de inventario al aprobar materiales
- **Regla:** al pasar un `JobsiteLog` a `APPROVED`, cada línea de `JobsiteLogMaterialUsage` con `productId` y `warehouseId` genera un `StockMovement` `OUT` / `CONSUMPTION` (idempotente por línea). Requiere módulo `INVENTORY` habilitado y stock suficiente al momento de aprobar.
- **Nota:** la validación de stock también corre al guardar/enviar; el descuento ocurre solo en aprobación.

---

## 19. Reglas globales sobre fechas

### BR-DATE-001 — Fecha contable vs fecha valor
- **Regla:** todo movimiento financiero registra **dos fechas**: `date_accounting` (cuándo se imputa contablemente) y `date_value` (cuándo se acredita/debita en cuenta).
- **Origen:** [D-023].

### BR-DATE-002 — Saldos por fecha
- **Regla:** los reportes de saldo a una fecha usan **fecha contable** por default. La fecha valor se usa para reportes bancarios.

### BR-DATE-003 — Fechas no pueden ser futuras
- **Regla:** un `AccountMovement` con `date_accounting` futura no se puede confirmar. Sí se puede crear como `DRAFT` (caso pago programado).

---

## 20. Reglas globales sobre numeración

### BR-NUM-001 — Numeración correlativa
- **Regla:** OCs, certificados, facturas, recibos, órdenes de pago tienen número correlativo único por tipo.
- **Pendiente:** [Q-002] define alcance (por empresa, por proyecto, configurable).

### BR-NUM-002 — Anulación no libera número
- **Regla:** anular un comprobante **no libera** su número. El siguiente comprobante toma el siguiente número, no el del anulado.

---

## 21. Reglas de validación general

### BR-VAL-001 — Validación de tax_id (CUIT/CUIL)
- **Regla:** al crear un `Contact` con CUIT/CUIL, se valida formato (no necesariamente padrón AFIP en Fase 1).

### BR-VAL-002 — Email obligatorio para Users
- **Regla:** todo `User` debe tener email único por tenant.

### BR-VAL-003 — Códigos únicos
- **Regla:** códigos como `Project.code`, `Product.code`, `Account.name` son únicos por tenant.

---

## 22. Cómo se citan las reglas

- En código: comentario `// BR-CERT-002` cerca de la validación.
- En documentación de módulo: en sección §10 Reglas de Negocio, listar IDs aplicables.
- En tests: nombre del test debe contener el ID (`should_block_overcertification_in_public_project_BR_CERT_002`).
