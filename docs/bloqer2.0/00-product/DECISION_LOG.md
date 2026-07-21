# Decision Log — Bloqer 2.0

> Registro de **decisiones de producto lockeadas**. Una vez tomadas, no se rediscuten salvo que aparezca evidencia nueva.  
> Cada decisión tiene un ID `D-NNN`. Los agentes IA y humanos pueden citar `[D-007]` y referirse a ella.  
> Si una decisión cambia, **NO se borra**: se marca como `SUPERSEDED` y se agrega la nueva debajo.

---

## Formato de cada decisión

```
### D-NNN — <Título corto>

- **Fecha:** YYYY-MM-DD
- **Estado:** ACTIVA | SUPERSEDED | EN REVISIÓN
- **Decidido por:** <usuario>
- **Contexto:** <por qué se tomó>
- **Decisión:** <qué se decidió>
- **Implicancias:** <qué impacta>
- **Documentos afectados:** <referencias>
```

---

## Decisiones activas

### D-001 — Multitenancy desde día 1

- **Fecha:** 2026-05-07
- **Estado:** ACTIVA
- **Decidido por:** Owner
- **Contexto:** Bloqer es SaaS para múltiples empresas constructoras.
- **Decisión:** Toda entidad operativa pertenece a un `tenant_id`. La capa de datos filtra siempre por tenant. No se "agrega después", es nativo.
- **Implicancias:** ningún query opera sin tenant. Toda relación cross-tenant está prohibida.
- **Documentos afectados:** [`AGENTS.md`](../AGENTS.md), [`07-non-functional/MULTITENANCY.md`](../07-non-functional/MULTITENANCY.md) (Fase D).

---

### D-002 — Múltiples presupuestos por proyecto

- **Fecha:** 2026-05-07
- **Estado:** ACTIVA
- **Contexto:** los proyectos sufren ampliaciones de alcance que requieren presupuestos complementarios.
- **Decisión:** un proyecto tiene **una versión activa de presupuesto** y puede tener **fases/adendas adicionales** que **complementan** al inicial. Ninguna fase reemplaza a otra; suman.
- **Implicancias:** el "presupuesto del proyecto" en reportes es la suma de todas las fases activas. La estructura de WBS puede crecer con adendas.
- **Documentos afectados:** [`02-modules/BUDGETS.md`](../02-modules/BUDGETS.md), [`02-modules/CONTRACTS_AND_ADDENDUMS.md`](../02-modules/CONTRACTS_AND_ADDENDUMS.md), [`05-workflows/ADD_PHASE_OR_ADDENDUM.md`](../05-workflows/ADD_PHASE_OR_ADDENDUM.md).

---

### D-003 — Avance medido en 3 dimensiones

- **Fecha:** 2026-05-07
- **Estado:** ACTIVA
- **Contexto:** confundir avance físico con económico oculta riesgos financieros.
- **Decisión:** el avance se mide y se reporta en **3 dimensiones independientes**: físico (cuánto se construyó), económico (cuánto se certificó), financiero (cuánto se cobró).
- **Implicancias:** las certificaciones registran avance físico **y** económico. El avance financiero se deriva de cobranzas. Los reportes muestran las tres por separado.
- **Documentos afectados:** [`02-modules/CERTIFICATIONS.md`](../02-modules/CERTIFICATIONS.md), [`04-formulas/PROGRESS_FORMULAS.md`](../04-formulas/PROGRESS_FORMULAS.md).

---

### D-004 — Sobrecertificación: regla diferenciada según tipo de obra

- **Fecha:** 2026-05-07
- **Estado:** ACTIVA
- **Contexto:** las obras públicas tienen normativa estricta; las privadas tienen flexibilidad.
- **Decisión:**
  - **Obra pública**: prohibido certificar por encima del presupuesto vigente. Si se requiere, primero hay que generar adenda/presupuesto adicional.
  - **Obra privada**: permitido certificar por encima del presupuesto, **con alerta visible y nota aclaratoria obligatoria**.
- **Implicancias:** el módulo de proyectos tiene flag `tipo_obra: PUBLICA | PRIVADA`. La validación de certificación cambia según ese flag.
- **Documentos afectados:** [`02-modules/PROJECTS.md`](../02-modules/PROJECTS.md), [`02-modules/CERTIFICATIONS.md`](../02-modules/CERTIFICATIONS.md), [`01-domain/BUSINESS_RULES.md`](../01-domain/BUSINESS_RULES.md) (regla `BR-CERT-002`).

---

### D-005 — Presupuesto: APPROVED vs CLOSED; cambios contractuales solo con Adenda

- **Fecha:** 2026-05-07 — texto ampliado: matriz `APPROVED`/`CLOSED` y **Change Order** vs **Adenda**
- **Estado:** ACTIVA
- **Contexto:** trazabilidad legal, estabilidad de cifras comprometidas con el cliente y separación entre control operativo (**Change Order**) e instrumento contractual (**Adenda**).
- **Decisión:**
  1. **`APPROVED`:** presupuesto aprobado **internamente**. Quedan **bloqueados** montos, WBS, cantidades, precios unitarios, fórmulas comerciales, margen, impuestos y estructura económica. **Sí** se permiten ediciones **no estructurales** (notas internas, adjuntos, responsable, tags, metadata no económica). Cualquier cambio económico o de alcance presupuestario requiere **nuevo proceso formal** (típicamente Adenda + Budget complementario o política de nueva versión).
  2. **`CLOSED`:** presupuesto convertido en **base contractual/comercial**. **No** se modifica directamente el cómputo vendido. Cualquier cambio de monto, alcance vendido, condiciones vendidas o WBS contractual requiere **Adenda** (o fase/proceso formal equivalente) y **Budget** hijo que complementa.
  3. **Change Order vs Adenda:** el **Change Order** es solicitud/control operativo; **no** altera por sí solo presupuesto **`CLOSED`** ni contrato/precio vendido. La **Adenda** es el instrumento que **sí** modifica monto, alcance o WBS contractual; puede originarse desde un CO aprobado. **Regla fuerte:** si cambia precio vendido, alcance contractual o WBS contractual cerrada → **Adenda obligatoria**; el CO solo no alcanza ([BR-CO-003]).
- **Implicancias:** `IN_REVIEW` no es aprobado. Tabla estado vs ediciones: [`STATE_MACHINES.md`](../01-domain/STATE_MACHINES.md) § Budget; reglas [BR-BUD-006], [BR-BUD-007], [BR-BUD-002], [BR-CO-002], [BR-CO-003].
- **Documentos afectados:** [`02-modules/BUDGETS.md`](../02-modules/BUDGETS.md), [`02-modules/WBS_AND_COST_ITEMS.md`](../02-modules/WBS_AND_COST_ITEMS.md), [`02-modules/CONTRACTS_AND_ADDENDUMS.md`](../02-modules/CONTRACTS_AND_ADDENDUMS.md), [`02-modules/CHANGE_ORDERS.md`](../02-modules/CHANGE_ORDERS.md), [`01-domain/BUSINESS_RULES.md`](../01-domain/BUSINESS_RULES.md), [`01-domain/STATE_MACHINES.md`](../01-domain/STATE_MACHINES.md), [`05-workflows/`](../05-workflows/).

---

### D-006 — Compras: impacto al confirmar OC, o al cargarse si no hay OC

- **Fecha:** 2026-05-07
- **Estado:** ACTIVA
- **Contexto:** no toda compra requiere OC formal (compras urgentes, materiales menores, servicios chicos).
- **Decisión:** si la compra tiene OC, **el costo impacta en el proyecto al confirmar la OC**. Si la compra es directa (sin OC), **el costo impacta al cargar la compra/factura**.
- **Implicancias:** dos caminos para registrar costo. Ambos válidos. La trazabilidad cambia: con OC hay 3 documentos (OC, recepción, factura); sin OC hay 1 (factura directa o gasto).
- **Documentos afectados:** [`02-modules/PROCUREMENT.md`](../02-modules/PROCUREMENT.md), [`02-modules/PURCHASE_ORDERS_AND_RECEIPTS.md`](../02-modules/PURCHASE_ORDERS_AND_RECEIPTS.md), [`05-workflows/REGISTER_PURCHASE.md`](../05-workflows/REGISTER_PURCHASE.md).

---

### D-007 — Inventario: dos métodos de valuación, configurable por empresa

- **Fecha:** 2026-05-07
- **Estado:** ACTIVA
- **Contexto:** distintas empresas tienen distintas prácticas contables.
- **Decisión:** el sistema soporta **promedio ponderado móvil** y **FIFO**. Cada empresa elige uno como default. Configurable también por depósito si fuese necesario (a confirmar).
- **Implicancias:** el motor de valuación se diseña para soportar ambos. Cambiar de método retroactivamente queda bloqueado o requiere proceso especial.
- **Documentos afectados:** [`02-modules/INVENTORY.md`](../02-modules/INVENTORY.md), [`04-formulas/STOCK_FORMULAS.md`](../04-formulas/STOCK_FORMULAS.md).

---

### D-008 — Multi-moneda con ARS como base y FX manual

- **Fecha:** 2026-05-07
- **Estado:** ACTIVA
- **Contexto:** algunas empresas operan en USD para insumos importados o contratos internacionales.
- **Decisión:**
  - **ARS** es la moneda base obligatoria.
  - Otras monedas (típicamente USD) se admiten en transacciones.
  - El **tipo de cambio se carga manualmente** al momento del movimiento.
  - El sistema almacena ambos: monto original y monto en ARS convertido.
  - Reportes consolidados se expresan en ARS.
- **Implicancias:** toda tabla con dinero tiene `currency`, `amount`, `fx_rate`, `amount_ars`. No hay servicio externo de FX en Fase 1.
- **Documentos afectados:** [`03-finance/MONEY_MODEL.md`](../03-finance/MONEY_MODEL.md), [`03-finance/MULTI_CURRENCY_RULES.md`](../03-finance/MULTI_CURRENCY_RULES.md), [`04-formulas/CURRENCY_CONVERSION_FORMULAS.md`](../04-formulas/CURRENCY_CONVERSION_FORMULAS.md).

---

### D-009 — AR/AP: contabilidad general además de por proyecto

- **Fecha:** 2026-05-07
- **Estado:** ACTIVA
- **Contexto:** la empresa tiene gastos y deudas que no son atribuibles a un proyecto puntual (ej. cuenta corriente con servicio de fotocopias).
- **Decisión:** AR y AP existen tanto **a nivel proyecto** como **a nivel empresa (sin proyecto asignado)**. La carga manual está permitida en ambos casos.
- **Implicancias:** `project_id` es **opcional** en AR/AP. Reportes por proyecto excluyen los registros sin proyecto. Reportes globales los incluyen.
- **Documentos afectados:** [`03-finance/ACCOUNTS_RECEIVABLE.md`](../03-finance/ACCOUNTS_RECEIVABLE.md), [`03-finance/ACCOUNTS_PAYABLE.md`](../03-finance/ACCOUNTS_PAYABLE.md).

---

### D-010 — Pagos y cobranzas parciales habilitados desde el inicio

- **Fecha:** 2026-05-07
- **Estado:** ACTIVA
- **Contexto:** es una práctica universal en construcción.
- **Decisión:** una factura/certificación puede recibir **N pagos/cobranzas parciales**. El saldo pendiente se calcula. El estado de la factura pasa a `PAID` solo cuando saldo = 0.
- **Implicancias:** AR/AP tienen una colección de movimientos asociados. El estado se deriva del saldo, no se setea a mano.
- **Documentos afectados:** [`03-finance/ACCOUNTS_RECEIVABLE.md`](../03-finance/ACCOUNTS_RECEIVABLE.md), [`03-finance/ACCOUNTS_PAYABLE.md`](../03-finance/ACCOUNTS_PAYABLE.md), [`05-workflows/REGISTER_PAYMENT.md`](../05-workflows/REGISTER_PAYMENT.md), [`05-workflows/REGISTER_COLLECTION.md`](../05-workflows/REGISTER_COLLECTION.md).

---

### D-011 — Impuestos y retenciones: carga manual

- **Fecha:** 2026-05-07
- **Estado:** ACTIVA
- **Contexto:** un motor fiscal automático argentino es complejo y específico por jurisdicción/actividad. Entra en Fase 3.
- **Decisión:** en Fase 1 las retenciones, percepciones e impuestos se cargan **manualmente** por movimiento, como **% sobre base** o **monto fijo**. Sin motor automático.
- **Implicancias:** el modelo guarda `tax_lines[]` por documento. Hay reporte resumen de impuestos por periodo, pero no integración fiscal.
- **Documentos afectados:** [`03-finance/TAXES_AND_WITHHOLDINGS.md`](../03-finance/TAXES_AND_WITHHOLDINGS.md), [`04-formulas/TAX_FORMULAS.md`](../04-formulas/TAX_FORMULAS.md).

---

### D-012 — Permisos simples: ver / crear-editar / aprobar

- **Fecha:** 2026-05-07
- **Estado:** ACTIVA
- **Contexto:** matrices de permisos finas hacen el producto inutilizable.
- **Decisión:** el modelo es `VIEW / EDIT / APPROVE` por módulo. **Sin permisos a nivel campo**. Sin grupos custom. Roles fijos predefinidos. Algunos permisos son configurables por Admin (rentabilidad neta, umbrales de aprobación).
- **Implicancias:** la matriz vive en [`PERMISSIONS_MATRIX.md`](./PERMISSIONS_MATRIX.md). No hay un editor visual de permisos en Fase 1.
- **Documentos afectados:** [`PERMISSIONS_MATRIX.md`](./PERMISSIONS_MATRIX.md), [`02-modules/USERS_AND_PERMISSIONS.md`](../02-modules/USERS_AND_PERMISSIONS.md).

---

### D-013 — Rentabilidad neta restringida por defecto

- **Fecha:** 2026-05-07
- **Estado:** ACTIVA
- **Contexto:** la rentabilidad neta consolidada es información sensible.
- **Decisión:** rentabilidad **bruta** visible para `OWNER`, `ADMIN`, `FINANCE`, `PROJECT_MANAGER` (sobre su obra). Rentabilidad **neta** solo `OWNER` y `ADMIN`. Otros roles requieren habilitación explícita por Admin.
- **Implicancias:** la matriz de permisos refleja esto. La UI tiene flags por rol.
- **Documentos afectados:** [`PERMISSIONS_MATRIX.md`](./PERMISSIONS_MATRIX.md), [`03-finance/PROFITABILITY_BY_PROJECT.md`](../03-finance/PROFITABILITY_BY_PROJECT.md).

---

### D-014 — Cierre de periodo configurable por Admin

- **Fecha:** 2026-05-07
- **Estado:** ACTIVA
- **Contexto:** evitar que se modifiquen movimientos de meses ya cerrados.
- **Decisión:** Admin/Owner puede **cerrar un periodo** (típicamente mensual). En periodo cerrado, los movimientos no se pueden editar ni anular sin reabrir. La reapertura queda auditada.
- **Implicancias:** validación transversal en todo el módulo financiero. Existe entidad `period_lock` o equivalente.
- **Documentos afectados:** [`03-finance/PERIOD_CLOSE_AND_LOCKS.md`](../03-finance/PERIOD_CLOSE_AND_LOCKS.md), [`05-workflows/CLOSE_PERIOD.md`](../05-workflows/CLOSE_PERIOD.md).

---

### D-015 — Subcontratos y mano de obra tercerizada desde día 1

- **Fecha:** 2026-05-07
- **Estado:** ACTIVA
- **Contexto:** muchas constructoras subcontratan tareas; ignorarlo es ignorar el negocio real.
- **Decisión:** los subcontratos son **módulo propio**, no embebido en compras. Pueden certificar avances, recibir pagos parciales, tener retenciones, vincularse a ítems del WBS.
- **Implicancias:** un contrato a subcontratista es entidad similar pero distinta de OC. Genera AP. Se imputa a proyecto.
- **Documentos afectados:** [`02-modules/SUBCONTRACTS.md`](../02-modules/SUBCONTRACTS.md), [`02-modules/SUBCONTRACTORS.md`](../02-modules/SUBCONTRACTORS.md).

---

### D-016 — Directorio unificado: Contact con roles múltiples

- **Fecha:** 2026-05-07
- **Estado:** ACTIVA
- **Contexto:** un mismo contacto frecuentemente es cliente y proveedor.
- **Decisión:** existe **un único directorio de Contactos**. Cada contacto puede tener **uno o varios roles**: cliente, proveedor, subcontratista, empleado, otro. Los listados específicos (Clientes, Proveedores) son **vistas filtradas** del directorio.
- **Implicancias:** la entidad raíz es `Contact`. No hay tabla "clientes" ni "proveedores" como entidades separadas.
- **Documentos afectados:** [`02-modules/DIRECTORY.md`](../02-modules/DIRECTORY.md), [`02-modules/CLIENTS.md`](../02-modules/CLIENTS.md), [`02-modules/SUPPLIERS.md`](../02-modules/SUPPLIERS.md).

---

### D-017 — Planificación temporal incluida desde día 1

- **Fecha:** 2026-05-07
- **Estado:** ACTIVA
- **Contexto:** la dimensión temporal es clave en construcción; no puede ser un agregado.
- **Decisión:** el módulo de **cronograma** es parte del núcleo desde Fase 1. Vinculado al proyecto y al WBS. Forma exacta cerrada en [D-038] (híbrido) y [D-039] (vínculo N:M opcional).
- **Implicancias:** los proyectos tienen plan temporal. Las tareas/hitos pueden vincularse a ítems del WBS y a certificaciones.
- **Documentos afectados:** [`02-modules/PROJECT_SCHEDULING.md`](../02-modules/PROJECT_SCHEDULING.md).

---

### D-018 — Dos flujos comerciales soportados

- **Fecha:** 2026-05-07
- **Estado:** ACTIVA
- **Contexto:** las constructoras chicas también hacen ventas directas sin certificación formal.
- **Decisión:** el sistema soporta **dos flujos comerciales coexistentes**:
  - Flujo certificación → cobranza (típico obra pública / contrato extenso).
  - Flujo venta directa (sin certificación, factura directa).
- **Implicancias:** AR puede nacer de certificación o de venta directa. Ambos comparten el mismo modelo de cobranza.
- **Documentos afectados:** [`02-modules/SALES_AND_COLLECTIONS.md`](../02-modules/SALES_AND_COLLECTIONS.md), [`05-workflows/CERTIFY_TO_COLLECT.md`](../05-workflows/CERTIFY_TO_COLLECT.md), [`05-workflows/DIRECT_SALE_FLOW.md`](../05-workflows/DIRECT_SALE_FLOW.md).

---

### D-019 — Contratos y adendas como entidad propia

- **Fecha:** 2026-05-07
- **Estado:** ACTIVA
- **Contexto:** los contratos tienen valor legal y temporal; merecen entidad propia.
- **Decisión:** existe módulo **Contratos y Adendas**. Un proyecto puede tener un contrato con cliente y varios contratos con proveedores/subcontratistas. Las adendas extienden el contrato y pueden generar nuevas fases de presupuesto.
- **Implicancias:** los presupuestos se vinculan a contratos. Los pagos/cobranzas pueden referenciar el contrato como base legal.
- **Documentos afectados:** [`02-modules/CONTRACTS_AND_ADDENDUMS.md`](../02-modules/CONTRACTS_AND_ADDENDUMS.md).

---

### D-020 — OC, Recepción y Factura como entidades separadas

- **Fecha:** 2026-05-07
- **Estado:** ACTIVA
- **Contexto:** estos tres documentos tienen ciclos legales y operativos distintos.
- **Decisión:** **Orden de Compra**, **Recepción** y **Factura de compra** son **entidades separadas**. Pueden estar las tres conectadas (flujo formal) o solo factura (compra directa). Una OC puede tener N recepciones (parciales). Una factura puede cubrir una o varias recepciones.
- **Implicancias:** modelo de procurement con tres tablas. Trazabilidad OC ↔ Recepción ↔ Factura ↔ Pago.
- **Documentos afectados:** [`02-modules/PURCHASE_ORDERS_AND_RECEIPTS.md`](../02-modules/PURCHASE_ORDERS_AND_RECEIPTS.md), [`05-workflows/PURCHASE_TO_PAY.md`](../05-workflows/PURCHASE_TO_PAY.md).

---

### D-021 — "Real" en presupuesto vs real: comprometido, devengado, pagado y anti doble conteo

- **Fecha:** 2026-05-07 — ampliado: definiciones canónicas y fórmula de exposición esperada
- **Estado:** ACTIVA
- **Contexto:** "real" es ambiguo; sin reglas explícitas, presupuesto vs real, cashflow y rentabilidad **duplican** montos (p. ej. OC + factura de la misma obligación).
- **Decisión:**
  1. **Definiciones canónicas** únicas: `committed_amount`, `accrued_amount`, `paid_amount`, `open_committed_amount`, `expected_cost_exposure` — ver [`04-formulas/COST_FORMULAS.md`](../04-formulas/COST_FORMULAS.md) §1 y [BR-COS-001], [BR-COS-002].
  2. **Regla anti doble conteo:** \(\text{expected\_cost\_exposure} = \text{accrued\_amount} + \text{open\_committed\_amount}\); **no** \(\text{committed} + \text{accrued}\) cuando el devengado está vinculado al compromiso.
  3. **Toggle en UI (Presupuesto vs real y afines):** el usuario elige la **capa** mostrada (comprometido, devengado, pagado y/o exposición esperada) con **etiqueta explícita** del reporte.
  4. **Devengado** en producto: datos trackeados en Fase 1; exposición en todos los reportes según política; sin mezclar con **cashflow real** (solo tesorería).
- **Implicancias:** cashflow real y proyección siguen definiciones en [`CASHFLOW.md`](../03-finance/CASHFLOW.md) y [`CASHFLOW_PROJECTION.md`](../03-finance/CASHFLOW_PROJECTION.md); no sustituyen las capas de costo.
- **Documentos afectados:** [`04-formulas/COST_FORMULAS.md`](../04-formulas/COST_FORMULAS.md), [`01-domain/BUSINESS_RULES.md`](../01-domain/BUSINESS_RULES.md), [`03-finance/MONEY_MODEL.md`](../03-finance/MONEY_MODEL.md), [`03-finance/PROFITABILITY_BY_PROJECT.md`](../03-finance/PROFITABILITY_BY_PROJECT.md), [`06-reports/REPORT_CATALOG.md`](../06-reports/REPORT_CATALOG.md), [`06-reports/FINANCIAL_REPORT_PACK.md`](../06-reports/FINANCIAL_REPORT_PACK.md), [`06-reports/OPERATIONAL_REPORTS.md`](../06-reports/OPERATIONAL_REPORTS.md), módulos compras/subcontratos/tesorería.

---

### D-022 — Inventario por depósito (multi-warehouse)

- **Fecha:** 2026-05-07
- **Estado:** ACTIVA
- **Contexto:** las empresas tienen depósito central, depósito de obra, hasta camionetas como depósitos.
- **Decisión:** todo movimiento de stock es **por depósito**. Stock disponible se reporta por depósito y se puede consolidar. Transferencias entre depósitos generan **par de movimientos**.
- **Implicancias:** entidad `Warehouse`. Toda línea de stock tiene `warehouse_id`. El stock global es agregado.
- **Documentos afectados:** [`02-modules/INVENTORY.md`](../02-modules/INVENTORY.md), [`02-modules/WAREHOUSES.md`](../02-modules/WAREHOUSES.md), [`05-workflows/MOVE_INVENTORY.md`](../05-workflows/MOVE_INVENTORY.md).

---

### D-023 — Transferencias internas con fecha contable y fecha valor separadas

- **Fecha:** 2026-05-07
- **Estado:** ACTIVA
- **Contexto:** los bancos suelen acreditar el dinero después del débito. Confundir fechas distorsiona saldos diarios.
- **Decisión:** toda transferencia interna registra **`fecha_contable`** y **`fecha_valor`** separadas. Los saldos por fecha se calculan según el campo correspondiente al reporte.
- **Implicancias:** dos fechas en el ledger. Reportes especifican qué fecha usan.
- **Documentos afectados:** [`02-modules/INTERNAL_TRANSFERS.md`](../02-modules/INTERNAL_TRANSFERS.md), [`03-finance/ACCOUNT_MOVEMENTS.md`](../03-finance/ACCOUNT_MOVEMENTS.md).

---

### D-024 — Modelo de tesorería híbrido: 4 vistas sobre 1 motor

- **Fecha:** 2026-05-07
- **Estado:** ACTIVA
- **Contexto:** tesorería en construcción mezcla extracto bancario, libro diario, posición consolidada y flujo de fondos. Modelar uno solo deja huecos.
- **Decisión:** hay **un único motor**: `account_movement` (ledger unificado). Sobre él, **4 vistas funcionales**:
  1. Extracto por cuenta (operación diaria).
  2. Ledger unificado (todos los movimientos normalizados).
  3. Posición consolidada (saldos por cuenta + total ARS + por moneda + por proyecto).
  4. Flujo de fondos (real + proyectado con AR/AP futuras).
- **Implicancias:** todas las vistas leen de la misma fuente. No hay duplicación. Los reportes financieros heredan esta arquitectura.
- **Documentos afectados:** [`03-finance/TREASURY_MODEL.md`](../03-finance/TREASURY_MODEL.md), [`03-finance/ACCOUNT_MOVEMENTS.md`](../03-finance/ACCOUNT_MOVEMENTS.md), [`02-modules/TREASURY.md`](../02-modules/TREASURY.md).

---

### D-025 — Trazabilidad legal: comprobantes emitidos no se editan

- **Fecha:** 2026-05-07
- **Estado:** ACTIVA
- **Contexto:** OCs, certificaciones, facturas, recibos y órdenes de pago tienen valor legal.
- **Decisión:** una vez emitidos, **no se editan**. Para corregir se **anulan** y se emite uno nuevo. La anulación queda registrada con motivo y autor.
- **Implicancias:** estados como `ISSUED` / `CONFIRMED` (según entidad) son terminales para edición del comprobante. La anulación es transición explícita (`CANCELLED` u otra definida en [`STATE_MACHINES.md`](../01-domain/STATE_MACHINES.md)). Histórico nunca se borra.
- **Documentos afectados:** [`PRODUCT_PRINCIPLES.md`](./PRODUCT_PRINCIPLES.md) §3, [`01-domain/STATE_MACHINES.md`](../01-domain/STATE_MACHINES.md).

---

### D-026 — Certification: sin estado `INVOICED` en `Certification.status`

- **Fecha:** 2026-05-07
- **Estado:** ACTIVA
- **Decidido por:** Owner
- **Contexto:** mezclar ciclo documental con facturación duplica fuentes de verdad y rompe reportes.
- **Decisión:** `Certification.status` **no** incluye `INVOICED`. La facturación se representa con `SalesInvoice`, `Receivable`, vínculos (`certification_id`) y el **`payment_status` derivado** desde AR/cobranzas.
- **Implicancias:** pantallas y reportes que pregunten “¿facturada?” consultan factura/AR vinculada, no un valor de `status`.
- **Documentos afectados:** [`01-domain/BUSINESS_RULES.md`](../01-domain/BUSINESS_RULES.md) ([BR-CERT-007]), [`01-domain/STATE_MACHINES.md`](../01-domain/STATE_MACHINES.md) § Certification, [`02-modules/CERTIFICATIONS.md`](../02-modules/CERTIFICATIONS.md), [`02-modules/SALES_AND_COLLECTIONS.md`](../02-modules/SALES_AND_COLLECTIONS.md), [`03-finance/ACCOUNTS_RECEIVABLE.md`](../03-finance/ACCOUNTS_RECEIVABLE.md), [`05-workflows/CERTIFY_TO_COLLECT.md`](../05-workflows/CERTIFY_TO_COLLECT.md), [`06-reports/REPORT_CATALOG.md`](../06-reports/REPORT_CATALOG.md), [`00-product/GLOSSARY.md`](./GLOSSARY.md).

---

### D-027 — SubcontractCertification: `settlement_status` (no `payment_status`)

- **Fecha:** 2026-05-07
- **Estado:** ACTIVA
- **Decidido por:** Owner
- **Contexto:** reutilizar `payment_status` en subcontrato confunde con certificación a cliente (AR).
- **Decisión:** el indicador derivado de liquidación frente a AP/pagos del subcontrato se llama **`settlement_status`**: `UNSETTLED` \| `PARTIALLY_SETTLED` \| `SETTLED` \| `OVERDUE`. **`SubcontractCertification.status`** sigue siendo ciclo documental; **`settlement_status`** no es el estado principal editable.
- **Implicancias:** pagos y AP recalculan `settlement_status`; naming y reportes alineados.
- **Documentos afectados:** [`01-domain/BUSINESS_RULES.md`](../01-domain/BUSINESS_RULES.md) ([BR-SUB-004]), [`01-domain/STATE_MACHINES.md`](../01-domain/STATE_MACHINES.md) §19, [`01-domain/CORE_ENTITIES.md`](../01-domain/CORE_ENTITIES.md), [`02-modules/SUBCONTRACTS.md`](../02-modules/SUBCONTRACTS.md), [`03-finance/ACCOUNTS_PAYABLE.md`](../03-finance/ACCOUNTS_PAYABLE.md), [`05-workflows/PURCHASE_TO_PAY.md`](../05-workflows/PURCHASE_TO_PAY.md), [`06-reports/REPORT_CATALOG.md`](../06-reports/REPORT_CATALOG.md), [`00-product/GLOSSARY.md`](./GLOSSARY.md).

---

### D-028 — BR-SUB-003: AP solo al aprobar certificación de subcontrato

- **Fecha:** 2026-05-07
- **Estado:** ACTIVA
- **Decidido por:** Owner
- **Contexto:** política “ISSUED o APPROVED” genera ambigüedad contable.
- **Decisión:** una `SubcontractCertification` genera o incrementa **`AccountsPayable` únicamente** en **`APPROVED`**. `SUBMITTED` no genera AP; `REJECTED` no genera AP; `CANCELLED` revierte por mecanismo compensatorio si ya había obligación. La revisión interna previa a obligación ocurre **antes** de `APPROVED`.
- **Implicancias:** no hay toggle de producto entre ISSUED/APPROVED para crear AP.
- **Documentos afectados:** [`01-domain/BUSINESS_RULES.md`](../01-domain/BUSINESS_RULES.md) ([BR-SUB-003]), [`01-domain/EVENTS_AND_AUTOMATIONS.md`](../01-domain/EVENTS_AND_AUTOMATIONS.md), [`02-modules/SUBCONTRACTS.md`](../02-modules/SUBCONTRACTS.md), [`03-finance/ACCOUNTS_PAYABLE.md`](../03-finance/ACCOUNTS_PAYABLE.md), [`05-workflows/PURCHASE_TO_PAY.md`](../05-workflows/PURCHASE_TO_PAY.md), [`01-domain/STATE_MACHINES.md`](../01-domain/STATE_MACHINES.md) §19.

---

### D-029 — Un solo evento canónico `collection.confirmed`

- **Fecha:** 2026-05-07
- **Estado:** ACTIVA
- **Decidido por:** Owner
- **Contexto:** definiciones duplicadas del mismo evento producían efectos solapados o contradictorios.
- **Decisión:** existe **una** definición canónica de **`collection.confirmed`**: lista cerrada de efectos en [`EVENTS_AND_AUTOMATIONS.md`](../01-domain/EVENTS_AND_AUTOMATIONS.md) §3.3 (aplicación a AR, movimiento INCOME, recálculo de derivados, cashflow real, notificaciones). No se documentan variantes paralelas del mismo nombre.
- **Implicancias:** implementación y pruebas usan esa lista como contrato funcional.
- **Documentos afectados:** [`01-domain/EVENTS_AND_AUTOMATIONS.md`](../01-domain/EVENTS_AND_AUTOMATIONS.md) §3.3, [`03-finance/ACCOUNTS_RECEIVABLE.md`](../03-finance/ACCOUNTS_RECEIVABLE.md), [`05-workflows/CERTIFY_TO_COLLECT.md`](../05-workflows/CERTIFY_TO_COLLECT.md), [`05-workflows/REGISTER_COLLECTION.md`](../05-workflows/REGISTER_COLLECTION.md).

---

### D-030 — Presupuesto: `CLOSED` whitelist, `IN_REVIEW` sin cambios estructurales, `RETURNED_FOR_CHANGES`

- **Fecha:** 2026-05-07
- **Estado:** ACTIVA
- **Decidido por:** Owner
- **Contexto:** cerrar ambigüedad entre revisión, aprobación y base contractual.
- **Decisión:**
  1. **`CLOSED`:** solo edición de metadata en **lista blanca**: `internal_notes`, `attachments`, `tags`, `display_order`, `non_contractual_reference_code`, `assigned_internal_responsible`. Prohibido todo lo económico/contractual que alimente certificaciones, contratos, reportes o rentabilidad.
  2. **`IN_REVIEW`:** prohibidos cambios estructurales directos; permitidos comentarios/adjuntos/notas de revisión y metadata no económica acotada. Para corregir números/estructura → **`RETURNED_FOR_CHANGES`** (o `DRAFT` si se descarta la ronda) y luego reenvío a **`IN_REVIEW`**.
  3. Estado **`RETURNED_FOR_CHANGES`** explícito en la máquina de estados; evento `budget.returned_for_changes`.
- **Implicancias:** workflows de aprobación y permisos de edición dependen de estos estados.
- **Documentos afectados:** [`01-domain/BUSINESS_RULES.md`](../01-domain/BUSINESS_RULES.md) ([BR-BUD-007], [BR-BUD-008]), [`01-domain/STATE_MACHINES.md`](../01-domain/STATE_MACHINES.md) § Budget, [`01-domain/EVENTS_AND_AUTOMATIONS.md`](../01-domain/EVENTS_AND_AUTOMATIONS.md), [`01-domain/APPROVAL_WORKFLOWS.md`](../01-domain/APPROVAL_WORKFLOWS.md) §2.1, [`02-modules/BUDGETS.md`](../02-modules/BUDGETS.md), [`05-workflows/APPROVE_BUDGET.md`](../05-workflows/APPROVE_BUDGET.md), [D-005] (complementario).

---

### D-031 — AR: `receivable.overdue_detected` y `receivable.payment_status_recalculated`

- **Fecha:** 2026-05-07
- **Estado:** ACTIVA
- **Decidido por:** Owner
- **Contexto:** vencimiento y recálculo de derivados deben ser explícitos sin mutar lifecycle de certificación.
- **Decisión:**
  - **`receivable.overdue_detected`:** marca/expone vencimiento de AR; recalcula `payment_status` derivado en certificaciones vinculadas si aplica; puede notificar; **no** cambia `Certification.status`.
  - **`receivable.payment_status_recalculated`:** coherencia de vistas derivadas/reportes; **no** es transición de lifecycle documental.
- **Implicancias:** jobs y UI de mora escuchan el primer evento; materializaciones el segundo.
- **Documentos afectados:** [`01-domain/EVENTS_AND_AUTOMATIONS.md`](../01-domain/EVENTS_AND_AUTOMATIONS.md) §3.3b, [`01-domain/BUSINESS_RULES.md`](../01-domain/BUSINESS_RULES.md) ([BR-CERT-PAYMENT-001]), [`03-finance/ACCOUNTS_RECEIVABLE.md`](../03-finance/ACCOUNTS_RECEIVABLE.md), [`02-modules/CERTIFICATIONS.md`](../02-modules/CERTIFICATIONS.md), [`06-reports/REPORT_CATALOG.md`](../06-reports/REPORT_CATALOG.md), [`04-formulas/CERTIFICATION_FORMULAS.md`](../04-formulas/CERTIFICATION_FORMULAS.md).

---

### D-032 — BankReconciliation: máquina de estados formal

- **Fecha:** 2026-05-07
- **Estado:** ACTIVA
- **Decidido por:** Owner
- **Contexto:** “OPEN/CLOSED” informal no alineaba permisos ni eventos.
- **Decisión:** estados `DRAFT` \| `IN_PROGRESS` \| `CLOSED` \| `CANCELLED` con reglas documentadas en [`STATE_MACHINES.md`](../01-domain/STATE_MACHINES.md) §24. Sesión **`CLOSED`** no permite editar matches sin reapertura formal o nueva sesión; anulación vía `CANCELLED`.
- **Implicancias:** eventos `bank_reconciliation.*` alineados a transiciones; conciliación como entidad gobernada.
- **Documentos afectados:** [`01-domain/STATE_MACHINES.md`](../01-domain/STATE_MACHINES.md) §24, [`02-modules/BANK_RECONCILIATION.md`](../02-modules/BANK_RECONCILIATION.md), [`01-domain/EVENTS_AND_AUTOMATIONS.md`](../01-domain/EVENTS_AND_AUTOMATIONS.md), [`03-finance/ACCOUNT_MOVEMENTS.md`](../03-finance/ACCOUNT_MOVEMENTS.md).

---

### D-033 — SubcontractCertification `REJECTED`: versión terminal; corrección = nuevo documento

- **Fecha:** 2026-05-07
- **Estado:** ACTIVA
- **Decidido por:** Owner
- **Contexto:** reabrir el mismo certificado borra trazabilidad de rechazo.
- **Decisión:** `REJECTED` es **terminal** para esa versión. No hay transición a `DRAFT` en el mismo documento. La corrección es un **nuevo** `SubcontractCertification` con **`replaces_certification_id`** (o equivalente) al rechazado.
- **Implicancias:** UX y numeración de certificados de subcontrato reflejan revisiones encadenadas.
- **Documentos afectados:** [`01-domain/BUSINESS_RULES.md`](../01-domain/BUSINESS_RULES.md) ([BR-SUB-005]), [`01-domain/STATE_MACHINES.md`](../01-domain/STATE_MACHINES.md) §19, [`01-domain/CORE_ENTITIES.md`](../01-domain/CORE_ENTITIES.md), [`01-domain/ENTITY_RELATIONSHIPS.md`](../01-domain/ENTITY_RELATIONSHIPS.md), [`02-modules/SUBCONTRACTS.md`](../02-modules/SUBCONTRACTS.md), [`05-workflows/PURCHASE_TO_PAY.md`](../05-workflows/PURCHASE_TO_PAY.md).

---

### D-034 — StockReservation: máquina de estados formal

- **Fecha:** 2026-05-07
- **Estado:** ACTIVA
- **Decidido por:** Owner
- **Contexto:** reservas sin estados claros mezclan disponible vs físico.
- **Decisión:** estados `ACTIVE` \| `PARTIALLY_RELEASED` \| `RELEASED` \| `CONSUMED` \| `CANCELLED` ([`STATE_MACHINES.md`](../01-domain/STATE_MACHINES.md) §25). Stock reservado **no** cuenta como disponible libre; **`CONSUMED`** vincula **`StockMovement`** ([BR-INV-008]).
- **Implicancias:** fórmulas de disponible y eventos `stock_reservation.*` alineados.
- **Documentos afectados:** [`01-domain/STATE_MACHINES.md`](../01-domain/STATE_MACHINES.md) §25, [`01-domain/BUSINESS_RULES.md`](../01-domain/BUSINESS_RULES.md) ([BR-INV-006], [BR-INV-008]), [`01-domain/EVENTS_AND_AUTOMATIONS.md`](../01-domain/EVENTS_AND_AUTOMATIONS.md), [`02-modules/INVENTORY.md`](../02-modules/INVENTORY.md), [`04-formulas/STOCK_FORMULAS.md`](../04-formulas/STOCK_FORMULAS.md).

---

### D-035 — Gastos generales empresa: núcleo AP + tesorería + GL; sin `Expense` en el corto plazo; rubro opcional

- **Fecha:** 2026-05-13
- **Estado:** ACTIVA
- **Decidido por:** Owner (vía auditoría Phase 17A)
- **Contexto:** alinear “gastos de estructura” con patrón ERP **vendor bill** (Odoo: factura proveedor vs reintegro empleado); evitar duplicar montos y estados en una tabla **`Expense`** mientras el flujo factura → C×P → pago cubra el caso.
- **Decisión:**
  1. **Núcleo obligatorio:** `SupplierInvoice` / `Payable` / `Payment` con **`projectId` null** para gastos con proveedor y ciclo estándar; **`JournalEntry`** como libro único (borrador / publicado manual), sin segundo ledger automático desde este diseño.
  2. **No** introducir entidad **`Expense`** en el corto plazo salvo requisito explícito de workflow (p. ej. reintegros, aprobaciones multi-nivel) que **no** quepa en AP + adjuntos + GL — entonces ADR + `STATE_MACHINES`.
  3. **Dimensión rubro / centro de costo (C):** primero convención en líneas (`description` / notas); si hace falta reporting estable, tabla maestra liviana o `metadata` acotado **sin** segundo asiento paralelo no documentado.
  4. **Ingresos corporativos sin proyecto:** el corte de producto **Phase 1** quedó lockeado en [**D-037**](./DECISION_LOG.md) (opción GL + tesorería); ampliaciones AR nullable u otro documento requieren nueva decisión.
- **Implicancias:** UX “gastos generales” y reportes reutilizan servicios AP/tesorería existentes; contabilidad enlaza a `/finanzas/...` para orígenes corporativos con `VIEW AP`.
- **Documentos afectados:** [`FINANCE_AND_PROJECT_OVERVIEW_ARCHITECTURE.md`](../08-architecture/FINANCE_AND_PROJECT_OVERVIEW_ARCHITECTURE.md) (Phase 17A), [`OPEN_QUESTIONS.md`](./OPEN_QUESTIONS.md) (Q-030), [`IMPLEMENTATION_ROADMAP.md`](../08-architecture/IMPLEMENTATION_ROADMAP.md) si se agenda fase explícita.

---

### D-036 — Q-001 Phase 1: membresía única por usuario+tenant (sin 0B hasta ADR)

- **Fecha:** 2026-05-14
- **Estado:** ACTIVA
- **Decidido por:** Owner (cierre operativo plan Q-001/Q-030)
- **Contexto:** el sub-problema “misma persona en empresa X e Y” requiere relajar `@@unique([userId, tenantId])` o modelo alternativo; implica migración, invitaciones y contexto de sesión.
- **Decisión:** en **Phase 1** se mantiene el modelo Prisma vigente: **como máximo una** fila `UserMembership` por par `(userId, tenantId)`; `companyId` en esa fila es el ancla de razón social cuando aplica (nullable = ámbito tenant). Cualquier **pertenencia simultánea** a dos `Company` bajo el mismo tenant queda **fuera de alcance** hasta ADR + migración explícita (variante **0B** del plan técnico).
- **Implicancias:** `resolveTenantContext` y `getMembershipByUserId` siguen el contrato de **una** membresía relevante por resolución actual de sesión; selector global de empresa no implica segunda fila de membresía sin nuevo diseño.
- **Documentos afectados:** [`OPEN_QUESTIONS.md`](./OPEN_QUESTIONS.md) (Q-001), [`MULTITENANCY.md`](../07-non-functional/MULTITENANCY.md), [`TECHNICAL_ERD.md`](../08-architecture/TECHNICAL_ERD.md), [`PRISMA_ERD_AUDIT.md`](../08-architecture/PRISMA_ERD_AUDIT.md), [`ARCHITECTURE_DECISION_RECORDS.md`](../08-architecture/ARCHITECTURE_DECISION_RECORDS.md) (ADR-Phase1-06).

---

### D-037 — Q-030 Phase 1: ingresos corporativos sin obra vía GL + tesorería (sin AR nullable)

- **Fecha:** 2026-05-14
- **Estado:** ACTIVA
- **Decidido por:** Owner (cierre operativo plan Q-001/Q-030)
- **Contexto:** `SalesInvoice` / `Receivable` / `Collection` exigen `projectId` en schema; relajar AR impacta certificaciones, aging y numeración ([Q-030](./OPEN_QUESTIONS.md)).
- **Decisión:** para **ingresos de estructura / sin obra** en Phase 1 se usa **solo** el camino **documentado** de **`JournalEntry`** (y líneas) con `projectId` null donde aplique, más movimientos de **tesorería** (`AccountMovement` / cobros manuales no ligados a `Receivable` de obra) según política interna del tenant — alineado a opción **(2)** de Q-030 y a libro único [D-035]. **No** se migra `projectId` a nullable en cadena AR en este corte. Las opciones **(1)** nullable AR y **(3)** nuevo documento quedan para decisión posterior explícita.
- **Implicancias:** Finanzas empresa y contabilidad reflejan ingresos corporativos sin crear `SalesInvoice` ficticia ni segundo ledger; riesgo operativo = disciplina de uso (documentar en módulo ventas/finanzas).
- **Documentos afectados:** [`OPEN_QUESTIONS.md`](./OPEN_QUESTIONS.md) (Q-030), [`Q030_CORPORATE_INCOME_CHECKLIST.md`](../08-architecture/Q030_CORPORATE_INCOME_CHECKLIST.md), [`SALES_AND_COLLECTIONS.md`](../02-modules/SALES_AND_COLLECTIONS.md), [`FINANCE_AND_PROJECT_OVERVIEW_ARCHITECTURE.md`](../08-architecture/FINANCE_AND_PROJECT_OVERVIEW_ARCHITECTURE.md) §16A.4 (nota de cierre), [`ARCHITECTURE_DECISION_RECORDS.md`](../08-architecture/ARCHITECTURE_DECISION_RECORDS.md) (ADR-Phase1-07).

---

### D-038 — Cronograma híbrido (Gantt + hitos)

- **Fecha:** 2026-05-27
- **Estado:** ACTIVA
- **Decidido por:** Owner (cierre Q-003)
- **Contexto:** empresas chicas operan con hitos; obras grandes requieren tareas, dependencias y barras Gantt ([Q-003](./OPEN_QUESTIONS.md)).
- **Decisión:** modelo **híbrido**: `Schedule.type` por defecto `HYBRID`; `ScheduleItem.type` = `TASK` | `MILESTONE`; vistas Gantt, calendario, kanban y tabla sobre el mismo dato.
- **Implicancias:** UI multip vista; dependencias FS en v1; calendario laboral en Fase 2.
- **Documentos afectados:** [`02-modules/PROJECT_SCHEDULING.md`](../02-modules/PROJECT_SCHEDULING.md), [`OPEN_QUESTIONS.md`](./OPEN_QUESTIONS.md) (Q-003), [`ARCHITECTURE_DECISION_RECORDS.md`](../08-architecture/ARCHITECTURE_DECISION_RECORDS.md) (ADR-007).

---

### D-039 — Cronograma y WBS: entidades separadas, vínculo N:M opcional

- **Fecha:** 2026-05-27
- **Estado:** ACTIVA
- **Decidido por:** Owner (cierre Q-004)
- **Contexto:** el tiempo de obra y el costo presupuestado no son 1:1 (tareas sin ítem, ítems sin duración clara); alineado a práctica Procore / cost codes vs schedule activities ([Q-004](./OPEN_QUESTIONS.md)).
- **Decisión:** cronograma **independiente** del WBS; tabla puente `ScheduleItemWbsLink` (N:M) con un enlace `isPrimary` por par; importación **explícita** desde presupuesto `APPROVED`/`CLOSED` (no auto-expandir todo el árbol). El WBS no se edita desde cronograma.
- **Implicancias:** métricas económicas por ítem de cronograma vía WBS enlazado; línea base de presupuesto igual que control de costos.
- **Documentos afectados:** [`02-modules/PROJECT_SCHEDULING.md`](../02-modules/PROJECT_SCHEDULING.md), [`02-modules/WBS_AND_COST_ITEMS.md`](../02-modules/WBS_AND_COST_ITEMS.md), [`OPEN_QUESTIONS.md`](./OPEN_QUESTIONS.md) (Q-004), [`01-domain/CORE_ENTITIES.md`](../01-domain/CORE_ENTITIES.md).

---

### D-040 — Imputación de gastos generales (Q-013): manual + % empresa

- **Fecha:** 2026-05-28
- **Estado:** ACTIVA
- **Decidido por:** Owner (plan Fase F)
- **Contexto:** [Q-013](./OPEN_QUESTIONS.md) bloqueaba margen neto (R-004).
- **Decisión:**
  1. **Opción 1:** tabla `project_overhead_allocations` — imputación manual por proyecto y período (`YYYY-MM`).
  2. **Opción 2:** `Company.overheadAllocationPct` aplicado sobre **costo directo devengado** del proyecto (distinto de `Budget.overheadPct` markup de venta).
  3. **Opción 3:** ver [D-041](#d-041--gg-prorrateo-automático-por-peso-de-cd-q-013-opción-3).
- **Implicancias:** `getProjectOverheadAmount` en services; R-004 expone `netMargin` cuando el rol lo permite ([D-013]).
- **Documentos afectados:** [`04-formulas/PROFITABILITY_FORMULAS.md`](../04-formulas/PROFITABILITY_FORMULAS.md), [`03-finance/PROFITABILITY_BY_PROJECT.md`](../03-finance/PROFITABILITY_BY_PROJECT.md), [`06-reports/REPORT_CATALOG.md`](../06-reports/REPORT_CATALOG.md).

---

### D-041 — GG: prorrateo automático por peso de CD (Q-013 opción 3)

- **Fecha:** 2026-05-29
- **Estado:** ACTIVA
- **Decidido por:** Owner (plan Fase F)
- **Decisión:** `Company.overheadAllocationMode` (`MANUAL` | `AUTO_WEIGHT`). En `AUTO_WEIGHT`, el pool mensual son facturas AP corporativas emitidas (ARS); cada obra recibe `pool × (CD obra / CD total empresa)` del período. Modos excluyentes: en automático no hay imputaciones manuales ni % empresa.
- **Implicancias:** `overhead-auto-weight.service.ts`, UI en `/finanzas/gastos-generales`, margen neto R-004 en ARS.
- **Documentos afectados:** igual que D-040.

---

### D-043 — GG AUTO_WEIGHT: cierre de período y snapshots (extiende D-041)

- **Fecha:** 2026-05-31
- **Estado:** ACTIVA
- **Decidido por:** Owner (auditoría UX gastos generales)
- **Contexto:** D-041 calcula prorrateo al leer; un proyecto nuevo alteraba retrospectivamente la imputación de períodos ya cerrados en la práctica.
- **Decisión:**
  1. Por cada `(companyId, period YYYY-MM)` en modo `AUTO_WEIGHT`, estado **OPEN** (preview dinámico) o **FROZEN** (snapshots persistidos).
  2. **Cerrar período** persiste `overhead_period_closes` + `overhead_auto_period_snapshots` por proyecto; margen neto (R-004) usa snapshots en períodos FROZEN.
  3. **Reabrir período** (solo `EDIT AP`) elimina snapshots y vuelve a OPEN; no recálculo silencioso.
  4. Al cerrar, el denominador de CD **excluye proyectos DRAFT** (solo ACTIVE y ON_HOLD).
- **Implicancias:** `overhead-period-freeze.service.ts`, UI en `/finanzas/gastos-generales`; operación AP corporativa sigue en `/finanzas/facturas-proveedor`.
- **Documentos afectados:** igual que D-040/D-041; [`PERMISSIONS_ROUTE_MATRIX.md`](../08-architecture/PERMISSIONS_ROUTE_MATRIX.md).

---

### D-042 — Ciclo de vida de proyecto: cancelación no destructiva, guards y reactivación

- **Fecha:** 2026-05-29
- **Estado:** ACTIVA
- **Decidido por:** Owner
- **Contexto:** cancelación accidental sin vuelta atrás; operaciones financieras posibles en obra `DRAFT`; UI sin confirmación en transiciones de ciclo de vida.
- **Decisión:**
  1. Cancelar proyecto **no elimina** presupuestos ni documentos financieros ([BR-PROJ-004]).
  2. Cancelar desde `ACTIVE`/`ON_HOLD`: solo **OWNER**/**ADMIN** ([PERM-007]); motivo obligatorio; bloqueo si hay documentos operativos abiertos ([BR-PROJ-005]).
  3. Cancelar desde `DRAFT`: roles con `EDIT PROJECTS`.
  4. Reactivar `CANCELLED` → estado previo (`status_before_cancellation`); solo **OWNER**/**ADMIN**; motivo obligatorio ([BR-PROJ-006]).
  5. Mutaciones operativas/financieras de obra solo con proyecto `ACTIVE`; presupuesto/WBS permitido en `DRAFT` y `ACTIVE`.
  6. UI: diálogos de confirmación en activar, pausar, reanudar, completar, cancelar y reactivar.
- **Implicancias:** campos `statusBeforeCancellation`, `cancellationReason`, `cancelledAt` en `Project`; guard central `assertProjectAllowsOperationalMutation`; evento `project.reactivated`.
- **Documentos afectados:** [`01-domain/STATE_MACHINES.md`](../01-domain/STATE_MACHINES.md) §2, [`01-domain/BUSINESS_RULES.md`](../01-domain/BUSINESS_RULES.md) ([BR-PROJ-004]–[BR-PROJ-006]), [`01-domain/EVENTS_AND_AUTOMATIONS.md`](../01-domain/EVENTS_AND_AUTOMATIONS.md), [`01-domain/CORE_ENTITIES.md`](../01-domain/CORE_ENTITIES.md), [`02-modules/PROJECTS.md`](../02-modules/PROJECTS.md), [`00-product/PERMISSIONS_MATRIX.md`](./PERMISSIONS_MATRIX.md) ([PERM-007]).

---

### D-044 — Solicitud de compra, cotizaciones y flujo de OC

- **Fecha:** 2026-06-01
- **Estado:** ACTIVA
- **Decidido por:** Owner (plan compras + auditoría)
- **Decisión:**
  1. Entidades `PurchaseRequest`, `ProcurementQuote` y settings `CompanyProcurementSettings` (1:1 `Company`).
  2. OC: `DRAFT` → `SUBMITTED` → `APPROVED` → `CONFIRMED` → recepciones; migración `ISSUED` → `CONFIRMED`.
  3. `committed_amount` solo al confirmar al proveedor ([D-006]).
  4. Fase 1: una OC activa por solicitud; cotizaciones mínimas configurables.
  5. Permisos: `PURCHASE_REQUESTS` (PM/capataz EDIT); compras aprueba/confirma OC.
- **Implicancias:** services en `packages/services/src/procurement/*`, UI en `/solicitudes-compra`, gate AP [BR-APR-005].
- **Documentos afectados:** [`02-modules/PURCHASE_REQUESTS.md`](../02-modules/PURCHASE_REQUESTS.md), [`01-domain/STATE_MACHINES.md`](../01-domain/STATE_MACHINES.md) §7, [`00-product/PERMISSIONS_MATRIX.md`](./PERMISSIONS_MATRIX.md).

---

### D-045 — Avance real del cronograma sincronizado desde libro de obra

- **Fecha:** 2026-06-02
- **Estado:** ACTIVA
- **Decidido por:** Owner (plan cronograma + avances integrados)
- **Decisión:**
  1. `ScheduleItem.progressPct` (**avance real** en cronograma) se actualiza **automáticamente al aprobar** un `JobsiteLog`, no al enviar ni al guardar borrador.
  2. La fuente es el WBS **primario** (`ScheduleItemWbsLink.isPrimary = true`) del ítem de cronograma.
  3. El % proviene del acumulado aprobado de `physicalPct` incremental por parte; si no hay % físico, fallback cantidad ejecutada / `budgetQty` del ítem de costo.
  4. Si el acumulado supera 100 %, no se sincroniza ese WBS (datos legacy / Q-005b).
  5. Al llegar a 100 % con estado `IN_PROGRESS`, la tarea pasa a `COMPLETED` (transición documentada en §27).
  6. El **avance certificado** y el **avance por cantidad operativa** siguen siendo dimensiones de lectura separadas ([BR-SCH-002]); el PM puede editar fechas y dependencias; el avance real manual queda como excepción operativa.
- **Implicancias:** `syncScheduleProgressFromJobsiteLog` en `packages/services`; auditoría `SCHEDULE_PROGRESS_SYNCED_FROM_JOBSITE_LOG`.
- **Documentos afectados:** [`01-domain/BUSINESS_RULES.md`](../01-domain/BUSINESS_RULES.md) ([BR-SCH-004]), [`05-workflows/PROGRESS_AND_SCHEDULE_PROCEDURE.md`](../05-workflows/PROGRESS_AND_SCHEDULE_PROCEDURE.md), [`02-modules/PROJECT_SCHEDULING.md`](../02-modules/PROJECT_SCHEDULING.md), [`02-modules/JOBSITE_LOG.md`](../02-modules/JOBSITE_LOG.md).

---

### D-046 — Import WBS sin fechas por defecto y rollup de contenedores

- **Fecha:** 2026-06-02
- **Estado:** ACTIVA
- **Decidido por:** Owner (plan Gantt / armar cronograma desde cero)
- **Decisión:**
  1. Importar WBS al cronograma crea **estructura sin fechas** por defecto (`placeholderDates` opt-in).
  2. Si el usuario activa *fechas estimadas de borrador*, se reparte el rango del proyecto entre **hermanos** WBS (secuencial por `sortOrder`); **no** respeta auto-programación FS en v1.
  3. Ítems contenedor (con hijos activos) tienen fechas **derivadas** (min/max de hojas descendientes no canceladas) vía rollup; no son editables manualmente.
  4. KPI de avance y atraso del cronograma ponderan solo **hojas** (ítems sin hijos activos), no contenedores.
- **Implicancias:** `computeContainerRollup` / `rollupScheduleContainersForProject` en services; Gantt sidebar lista toda la estructura.
- **Documentos afectados:** [`02-modules/PROJECT_SCHEDULING.md`](../02-modules/PROJECT_SCHEDULING.md).

---

### D-047 — APU: persistencia unitaria; entrada opcional por total de partida

- **Fecha:** 2026-07-16
- **Estado:** ACTIVA
- **Decidido por:** Owner
- **Contexto:** Al cargar APU, materiales/MO suelen venir como totales de obra (p. ej. global $1.250.000) o consumos absolutos (500 bolsas), mientras el ítem tiene cantidad contractual (900 m²). Si se cargan esos valores como si fueran por unidad, el sistema multiplica otra vez por la cantidad del ítem y distorsiona el costo.
- **Decisión:**
  1. Las líneas APU (`CostAnalysisLine`) se **persisten siempre unitarias** (por 1 unidad del `CostItem`): `unitCostDirect = Σ (coefficient × unitCost)`; `totalCostDirect = unitCostDirect × CostItem.quantity`.
  2. La UI ofrece dos **modos de entrada** (no dos modelos de datos): **Por unidad** (default) y **Total partida**.
  3. En **Total partida**, al confirmar se prorratea el importe de obra de forma **money-safe** frente a `Decimal(18,4)`: `coefficient_stored = 1`, `unitCost_stored = (coefficient_input × unitCost_input) / CostItem.quantity`. Reverse al editar en ese modo: `coefficient_input = 1`, `unitCost_input = unitCost_stored × quantity`.
  4. Si `CostItem.quantity ≤ 0`, el modo Total partida no aplica.
- **Implicancias:** sin cambio de schema; conversión en UI/helper de dominio antes de create/update. Reportes y baseline siguen leyendo unitario × qty. No usar `coefficient / quantity` para globales (p. ej. 1/900) porque el redondeo a 4 decimales distorsiona el dinero.
- **Documentos afectados:** [`04-formulas/BUDGET_FORMULAS.md`](../04-formulas/BUDGET_FORMULAS.md), [`02-modules/WBS_AND_COST_ITEMS.md`](../02-modules/WBS_AND_COST_ITEMS.md), [`guides/GUIA_OPERATIVA_PROYECTO.md`](../guides/GUIA_OPERATIVA_PROYECTO.md).

---

### D-048 — Finanzas: facturas documentales separadas del ledger; pagos sin listado independiente

- **Fecha:** 2026-07-17
- **Estado:** ACTIVA
- **Decidido por:** Owner
- **Decisión:**
  1. **Facturas y gastos** conserva una vista propia porque representa documentos y obligaciones antes del movimiento de caja; el alta corporativa se abre en un diálogo desde el listado.
  2. **Transacciones** conserva una vista propia como ledger consolidado de movimientos confirmados.
  3. No existe un listado independiente **Pagos a proveedores**: los pagos se consultan en Transacciones mediante filtros de origen/tipo.
  4. El detalle de un `Payment` permanece como vista contextual para trazabilidad, anulación y contabilidad, accesible desde CxP, auditoría o el movimiento relacionado.
- **Implicancias:** se retiran `/finanzas/pagos-proveedor` (listado) y `/finanzas/facturas-proveedor/nueva`; se mantienen `/finanzas/pagos-proveedor/[paymentId]` y el flujo de pago desde Cuentas por pagar.
- **Documentos afectados:** [`02-modules/EXPENSES_AND_PAYMENTS.md`](../02-modules/EXPENSES_AND_PAYMENTS.md), [`08-architecture/PERMISSIONS_ROUTE_MATRIX.md`](../08-architecture/PERMISSIONS_ROUTE_MATRIX.md), [`08-architecture/OPERATIONAL_SMOKE_CHECKLIST_BY_ROLE.md`](../08-architecture/OPERATIONAL_SMOKE_CHECKLIST_BY_ROLE.md).

---

### D-049 — Ingreso corporativo enriquecido (contraparte + comprobante externo); AR formal diferido

- **Fecha:** 2026-07-17
- **Estado:** ACTIVA
- **Decidido por:** Owner
- **Contexto:** el alta `TREASURY_INFLOW` solo pedía cuenta/fecha/monto/descripción; no alcanzaba para registrar cobros de facturación oficial hecha por fuera. [D-037](./DECISION_LOG.md) mantiene ingresos sin obra fuera de la cadena AR.
- **Decisión:**
  1. Fase 1 (ahora): `AccountMovement` de ingreso corporativo (`sourceType = MANUAL_ADJUSTMENT`) admite opcionales `counterpartyContactId` (Contact del directorio, típicamente CLIENT) y `externalInvoiceRef` (N° de comprobante oficial emitido fuera de Bloqer, p. ej. ARCA).
  2. No crea `SalesInvoice` / `Receivable` / `Collection` corporativos; sigue la opción **(2)** de Q-030 / [D-037](./DECISION_LOG.md).
  3. Fase 2 (planificada, requiere decisión explícita): AR corporativo con `projectId` nullable + UI bajo `/finanzas`, con extensión futura a emisión legal ARCA; `externalInvoiceRef` actúa de puente para lo cargado manualmente.
- **Implicancias:** UI “Ingreso / cobro” en Transacciones; ledger y export muestran contraparte y comprobante; sin enum nuevo de `sourceType`.
- **Documentos afectados:** [`03-finance/ACCOUNT_MOVEMENTS.md`](../03-finance/ACCOUNT_MOVEMENTS.md), [`02-modules/SALES_AND_COLLECTIONS.md`](../02-modules/SALES_AND_COLLECTIONS.md), [`08-architecture/Q030_CORPORATE_INCOME_CHECKLIST.md`](../08-architecture/Q030_CORPORATE_INCOME_CHECKLIST.md).

---

### D-050 — Procedimientos de OC: WBS obligatorio, cotizaciones comparables, notificaciones y rechazo

- **Fecha:** 2026-07-21
- **Estado:** ACTIVA
- **Decidido por:** Owner (revisión de procedimientos de compra)
- **Contexto:** alinear el ciclo solicitud → cotización → OC → aprobación → confirmación → recepción/factura con trazabilidad presupuestaria y sin atrasos por falta de alerta. Extiende [D-044](./DECISION_LOG.md#d-044--solicitud-de-compra-cotizaciones-y-flujo-de-oc) y [D-006](./DECISION_LOG.md#d-006--compras-impacto-al-confirmar-oc-o-al-cargarse-si-no-hay-oc).
- **Decisión:**
  1. **WBS obligatorio** en toda línea de `PurchaseRequest` y `PurchaseOrder` de proyecto: cada línea imputa a un nodo WBS `ITEM` de un presupuesto `APPROVED`/`CLOSED` del mismo proyecto. No hay compra de obra “sin partida”.
  2. **Gastos generales / indirectos de obra** se modelan como **partida(s) WBS presupuestable(s)** (nodo `ITEM` del árbol), no como línea sin `wbs_node_id`. El overhead de empresa (sin obra) sigue fuera de este flujo ([D-035], [D-040]).
  3. **Costo referencial visible** al elegir partida: mostrar costo unitario presupuestario (baseline APU / snapshot) y **saldo disponible** de la partida (presupuestado − comprometido − real, según fórmulas de costo) antes de enviar/confirmar.
  4. **Cotizaciones comparables por precio y plazo:** `ProcurementQuote` incluye **plazo de entrega (`leadTimeDays` o equivalente)** además de `validUntil`; la UI de comparación muestra desglose por línea, referencia de presupuesto y plazo.
  5. **OC directa** captura el mismo `budgetUnitCostSnapshot` (y aplica [BR-PUR-009]) que la vía por solicitud; no se permite baseline vacío solo por venir de OC directa si hay WBS con APU.
  6. **Notificaciones:** in-app (existente) + **email automático** en cambios de estado relevantes (SC enviada; OC pendiente de aprobación; OC aprobada / rechazada-devuelta / confirmada → solicitante y actores según rol) + **recordatorio por antigüedad/SLA** con escalamiento a OWNER/ADMIN. Solo email sin in-app/SLA no alcanza.
  7. **Rechazo / devolución de OC:** desde `SUBMITTED`, el aprobador puede **devolver a `DRAFT`** con **motivo obligatorio** (evento auditado); el creador corrige y vuelve a enviar. No se “desaprueba” un `APPROVED` ya confirmado: se anula el documento según reglas vigentes.
  8. **Numeración ([Q-002](./OPEN_QUESTIONS.md#q-002--numeración-de-comprobantes)):** en Fase 1, `PurchaseRequest`, `PurchaseOrder` y recepciones de compra se numeran **por empresa** (correlativo por tipo dentro de `company_id` + `tenant_id`). Configurable por tipo queda diferido.
- **Implicancias:** reglas [BR-PUR-007] (redefinida), [BR-PUR-011]–[BR-PUR-016]; máquina de OC ya contempla `SUBMITTED` → `DRAFT` por rechazo; implementación de UI/email/SLA y campos de cotización quedan como trabajo posterior a esta alineación documental.
- **Documentos afectados:** [`02-modules/PROCUREMENT.md`](../02-modules/PROCUREMENT.md), [`02-modules/PURCHASE_REQUESTS.md`](../02-modules/PURCHASE_REQUESTS.md), [`02-modules/PURCHASE_ORDERS_AND_RECEIPTS.md`](../02-modules/PURCHASE_ORDERS_AND_RECEIPTS.md), [`01-domain/APPROVAL_WORKFLOWS.md`](../01-domain/APPROVAL_WORKFLOWS.md), [`01-domain/BUSINESS_RULES.md`](../01-domain/BUSINESS_RULES.md), [`01-domain/STATE_MACHINES.md`](../01-domain/STATE_MACHINES.md), [`01-domain/EVENTS_AND_AUTOMATIONS.md`](../01-domain/EVENTS_AND_AUTOMATIONS.md), [`05-workflows/REGISTER_PURCHASE.md`](../05-workflows/REGISTER_PURCHASE.md), [`00-product/OPEN_QUESTIONS.md`](./OPEN_QUESTIONS.md) (Q-002).

---

## Decisiones SUPERSEDED

_(ninguna por ahora)_

---

## Cómo agregar una decisión nueva

1. Tomar el siguiente ID disponible (`D-035`, `D-036`...).
2. Completar el formato del header.
3. Listar **todos** los documentos afectados.
4. Enlazar la decisión desde los documentos afectados con un comentario `> Ver [D-NNN]`.
5. **Nunca** borrar decisiones; cambiar estado a `SUPERSEDED` y agregar la nueva.
