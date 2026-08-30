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
  1. **`APPROVED`:** presupuesto aprobado **internamente**. Quedan **bloqueados** montos, WBS, cantidades, precios unitarios, fórmulas comerciales, margen, impuestos y estructura económica. **Sí** se permiten ediciones **no estructurales** (notas internas, adjuntos, responsable, tags, metadata no económica). Cualquier cambio económico o de alcance presupuestario requiere **nuevo proceso formal** (típicamente Adenda + Budget complementario o política de nueva versión). **Excepción controlada [D-088]:** con kill-switch de tenant **y** flag de obra ON, se permite edición **completa** de `APPROVED` (partidas + economía, auditada); `CLOSED` no aplica.
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
- **Estado:** ACTIVA (enmendada 2026-07-24; UI 2026-07-26)
- **Decidido por:** Owner
- **Contexto:** Al cargar APU, materiales/MO suelen venir como totales de obra (p. ej. global $1.250.000) o consumos absolutos (500 bolsas), mientras el ítem tiene cantidad contractual (900 m²). Si se cargan esos valores como si fueran por unidad, el sistema multiplica otra vez por la cantidad del ítem y distorsiona el costo. La conversión money-safe original (`coefficient = 1`) destruía la cantidad física y rompía necesidades de materiales/OC.
- **Decisión:**
  1. Las líneas APU contribuyen **por 1 unidad** del `CostItem` en dinero: `unitCostDirect = Σ totalCost`; `totalCostDirect = unitCostDirect × CostItem.quantity`. `totalCost` de línea es el aporte unitario **autoritativo** (2 dp half-up, [D-053]).
  2. **UI (camino feliz):** solo **Por unidad** | **Total partida** (default). Sin sub-toggle Monto global. Tooltips en hover aclaran cada modo.
  3. **Total partida** = cantidad de recurso (p. ej. 500 un × $6.000): persiste `partidaQuantity = cant`, `unitCost = precio_recurso`, `coefficient = cant / Qty`, `totalCost = roundMoney((cant × precio) / Qty)`, `isLumpSum = false`.
  4. **Importes sin compra:** unidad canónica **`gl` (Global)** + cant. recurso (1 o N) + precio = monto. Se persiste como **resource** (`isLumpSum = false`). Materials board: `needQty = 0` si `isLumpSum` **o** `unit = gl`. **No** marcar `isLumpSum` solo por `gl` (rompería recompute al cambiar Qty del ítem).
  5. **Por unidad:** `partidaQuantity = null`, `isLumpSum = false`; `coefficient` y `unitCost` como se cargan; necesidad = `coefficient × Qty` (salvo `gl`).
  6. **Legacy `isLumpSum` (Monto global UI):** dominio money-safe (`coef=1`, `unitCost = monto/Qty`) se conserva al leer; al editar/guardar desde UI se convierte a resource + `unit=gl`.
  7. Si `CostItem.quantity ≤ 0`, el modo Total partida no aplica. Al cambiar `Qty` con `partidaQuantity` set: recomputar coef/`totalCost` (resource). Lump legacy: `recomputeLumpForItemQuantity`.
- **Implicancias:** schema `partidaQuantity` + `isLumpSum`; helper `isGlobalUnit`. Modal APU: Datos del ítem → costo por categoría → Insumos (alta arriba del listado).
- **Documentos afectados:** [`04-formulas/BUDGET_FORMULAS.md`](../04-formulas/BUDGET_FORMULAS.md), [`02-modules/WBS_AND_COST_ITEMS.md`](../02-modules/WBS_AND_COST_ITEMS.md), [`GUIA_OPERATIVA_BLOQER_V2.md`](../GUIA_OPERATIVA_BLOQER_V2.md), [D-057](#d-057--partida-certificable-vs-insumo-apu), [D-058](#d-058--apu-muestra-costo-venta-en-tabla-edt).
- **Amend (2026-07-26):** UI sin Monto global; Global (`gl`) = no comprable; `isLumpSum` solo legacy.

---

### D-048 — Finanzas: facturas documentales separadas del ledger; pagos sin listado independiente

- **Fecha:** 2026-07-17
- **Estado:** ACTIVA
- **Decidido por:** Owner
- **Decisión:**
  1. **Facturas y gastos** conserva una vista propia porque representa documentos y obligaciones antes del movimiento de caja; el alta corporativa se abre en un diálogo desde el listado.
  2. **Transacciones** conserva una vista propia como ledger consolidado de movimientos confirmados de **caja operativa** (cobros, pagos, ingresos/egresos con terceros). Las **transferencias internas** entre cuentas propias **no** se listan ahí; viven en Tesorería → Transferencias / Movimientos.
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
- **Implicancias:** UI “Ingreso / cobro” en Transacciones; el alta guarda contraparte y comprobante en `AccountMovement`; el ledger UI prioriza descripción → documento origen (sin columna Contraparte fija); sin enum nuevo de `sourceType`.
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

### D-051 — AR corporativo: `projectId` nullable en cadena SalesInvoice / Receivable / Collection (Q-030 opción 1)

- **Fecha:** 2026-07-21
- **Estado:** ACTIVA
- **Decidido por:** Owner
- **Contexto:** el tab “Ingreso / cobro” ([D-049]) solo movía tesorería sin vencimiento ni CxC. Casos reales (capacitaciones, venta de materiales, servicios de estructura) requieren factura + cuenta por cobrar a nivel empresa, simétrico al AP corporativo ([D-009], Phase 16B).
- **Decisión:**
  1. Cierra la **Fase 2** de [D-049](./DECISION_LOG.md) y la opción **(1)** de [Q-030](./OPEN_QUESTIONS.md): `projectId` **nullable** en `SalesInvoice`, `Receivable` y `Collection`.
  2. Flujo corporativo vía Registrar transacción → `AR_INCOME` (`registerArIncome`): factura con líneas + impuestos manuales + vencimiento → CxC; cobro opcional (`collectNow`).
  3. Se mantiene `TREASURY_INFLOW` para ingresos a caja **sin** CxC (aportes, préstamos, reintegros).
  4. `externalInvoiceRef` en `SalesInvoice` como puente a facturación oficial externa / ARCA futuro.
  5. Emisión legal ARCA **fuera de alcance** de esta decisión.
- **Implicancias:** aging y listado `/finanzas/cuentas-por-cobrar` incluyen filas “Empresa”; numeración de facturas sigue por `(tenantId, companyId)`; reportes por obra excluyen `projectId` null.
- **Documentos afectados:** [`03-finance/ACCOUNTS_RECEIVABLE.md`](../03-finance/ACCOUNTS_RECEIVABLE.md), [`02-modules/SALES_AND_COLLECTIONS.md`](../02-modules/SALES_AND_COLLECTIONS.md), [`01-domain/BUSINESS_RULES.md`](../01-domain/BUSINESS_RULES.md), [`01-domain/STATE_MACHINES.md`](../01-domain/STATE_MACHINES.md), [`01-domain/CORE_ENTITIES.md`](../01-domain/CORE_ENTITIES.md), [`08-architecture/Q030_CORPORATE_INCOME_CHECKLIST.md`](../08-architecture/Q030_CORPORATE_INCOME_CHECKLIST.md), [`08-architecture/ARCHITECTURE_DECISION_RECORDS.md`](../08-architecture/ARCHITECTURE_DECISION_RECORDS.md), [`GUIA_OPERATIVA_BLOQER_V2.md`](../GUIA_OPERATIVA_BLOQER_V2.md), [`GUIA_OPERATIVA_BLOQER_V2.md`](../GUIA_OPERATIVA_BLOQER_V2.md).

---

### D-052 — AP proyecto: pago inmediato inline, adjuntos en el alta y chequeo de fondos en pagos

- **Fecha:** 2026-07-22
- **Estado:** ACTIVA
- **Decidido por:** Owner
- **Contexto:** a nivel empresa ya existía el alta rápida con “Pagar ahora” (cuenta de tesorería + fecha). A nivel proyecto el alta de factura de proveedor era solo documental (borrador → emitir → pagar después). Además, los pagos podían sobregirar una cuenta en silencio, a diferencia de las transferencias internas ([BR-TRZ-004]).
- **Decisión:**
  1. El alta de factura de proveedor a nivel **proyecto** ofrece **“Emitir y pagar ahora”** inline (checkbox + cuenta de tesorería + fecha), simétrico al flujo corporativo.
  2. El pago inmediato **siempre** crea `SupplierInvoice → Payable → Payment → AccountMovement` (el Payable nace saldado si se paga el total). No hay patrón “gasto directo sin CxP”.
  3. El bloque “Pagar ahora” a nivel proyecto se muestra **solo** si el usuario tiene permiso `EDIT` sobre `TREASURY` (segregación de funciones; igual que empresa).
  4. Adjuntos (foto/copia de factura) en el **alta** (create-then-upload) y en el detalle; adjuntos habilitados también en facturas de venta (`SALES_INVOICE`).
  5. Todo **pago** (`createPayment` y pago inline) **bloquea** si la cuenta quedaría con saldo negativo, consistente con transferencias internas ([BR-TRZ-004]).
  6. “Cobrar ahora” inline en facturas de venta **de proyecto** queda **diferido**; el AR corporativo ([D-051]) se mantiene. → **Levantado por [D-077](./DECISION_LOG.md).**
- **Implicancias:** sin migración de schema (`projectId` ya nullable); la lógica de pago se unifica en un helper compartido; los gaps de cost code / método de pago / retenciones quedan en [OPEN_QUESTIONS.md](./OPEN_QUESTIONS.md) (Q-053+).
- **Documentos afectados:** [`02-modules/EXPENSES_AND_PAYMENTS.md`](../02-modules/EXPENSES_AND_PAYMENTS.md), [`02-modules/SALES_AND_COLLECTIONS.md`](../02-modules/SALES_AND_COLLECTIONS.md), [`00-product/OPEN_QUESTIONS.md`](./OPEN_QUESTIONS.md).

---

### D-053 — Precisión monetaria: 2 decimales half-up en dinero operativo

- **Fecha:** 2026-07-22
- **Estado:** ACTIVA
- **Decidido por:** Owner
- **Contexto:** Los montos se persistían hasta 4 dp (`Decimal(18,4)`) sin quantize de negocio; DTOs usaban `.toString()` y la UI a veces mostraba 2 dp. Eso generaba saldos imposibles de cerrar al pagar/cobrar y divergencia docs vs runtime (FX/`amount_ars`).
- **Decisión:**
  1. **Dinero operativo** (líneas/totales de documento, CxP/CxC, pagos/cobranzas, movimientos, opening balances, `amount_ars`, costos monetarios): redondeo **half-up a 2 decimales** al calcular y antes de persistir. Display/DTO/CSV/PDF/email: siempre 2 dp.
  2. **No-money:** `fx_rate` hasta **6** dp; cantidades y % impuestos/overhead hasta **4**; APU coef/unitCost según [D-047] en **4** (totales money derivados a 2).
  3. Columnas Prisma `Decimal(18,4)` / `(18,6)` = **capacidad de storage**; la escala de negocio la impone el kernel (`@bloqer/utils` + services). **Sin migración** a `(18,2)`.
  4. Algoritmo de línea: `lineSubtotal = roundMoney(qty×price)`; `lineTax = roundMoney(subtotal×rate/100)`; `lineTotal = roundMoney(subtotal+tax)`; header = suma de líneas (sin re-redondear la suma).
  5. **Pagar/cobrar todo:** el server aplica el **saldo almacenado** (`payFullBalance` / equivalente); la UI solo muestra 2 dp. No redondear en cliente y reaplicar.
  6. Datos **confirmados/emitidos** no se reescriben (inmutabilidad). Escrituras nuevas ya nacen a 2 dp. Polvo histórico: cierre vía epsilon de obligación solo cuando el residual es polvo sub-centavo de datos viejos; no write-off de centavos reales en pagos parciales.
  7. Validación Zod de money: preprocess **round-to-2** (edits históricos no rompen); inputs money `step=0.01`.
  8. **Amend (2026-08-25):** display de cantidades operativas y precios unitarios en UI: **2 dp + separador de miles es-AR** (`1.234.567,89`). El storage de qty/PU puede seguir en 4 dp; FX se muestra a 6. Input canónico: `DecimalInput`.
- **Implicancias:** helpers canónicos `roundMoney` / `serializeMoney` / `formatMoneyAmount` / `formatGroupedDecimal`; prohibido `parseFloat` en paths de dinero y `.toString()` crudo en DTOs money.
- **Documentos afectados:** [`03-finance/MONEY_MODEL.md`](../03-finance/MONEY_MODEL.md), [`08-architecture/MONEY_AND_DECIMAL_STRATEGY.md`](../08-architecture/MONEY_AND_DECIMAL_STRATEGY.md), [`04-formulas/CURRENCY_CONVERSION_FORMULAS.md`](../04-formulas/CURRENCY_CONVERSION_FORMULAS.md), [`08-architecture/AGENT_GUARDRAILS.md`](../08-architecture/AGENT_GUARDRAILS.md), [`08-architecture/CODING_STANDARDS.md`](../08-architecture/CODING_STANDARDS.md), [`AGENTS.md`](../AGENTS.md).

---

### D-054 — Campana in-app, polling y CC OWNER/ADMIN

- **Fecha:** 2026-07-22
- **Estado:** ACTIVA
- **Decidido por:** Owner
- **Contexto:** La campana solo enlazaba al inbox; el badge era snapshot SSR sin refresh; algunos eventos 8A notificaban a un único usuario; OWNER/ADMIN no siempre recibían copia. Web Push del browser se consideró prematuro.
- **Decisión:**
  1. **Push in-app únicamente:** dropdown en la campana con las **últimas 5** notificaciones no archivadas; badge solo si `unreadCount > 0`; pie “Ver todas” → `/notificaciones`.
  2. **Polling** cada **30s** vía `GET /api/notifications/bell` mientras la pestaña está visible (pausa en background); refresh al abrir el dropdown. Sin Web Push / SSE / WebSocket en esta iteración.
  3. **Leído por usuario:** una fila `Notification` por destinatario; marcar leída no afecta otras copias.
  4. **Audiencia:** `resolveNotificationAudience` — destinatarios primarios y/o por permiso, con **CC siempre a OWNER/ADMIN** activos (salvo exclusiones explícitas del actor). Sin routing por obra (no hay `ProjectMembership`). **Excepción anti-ruido:** `CERTIFICATION_APPROVED` = `createdBy` ∪ OWNER/ADMIN (no fan-out por `VIEW CERTIFICATIONS` hasta asignación a obra).
  5. **Sin migración Prisma** en esta iteración. Diferidos: preferencias/mute, Web Push, tipos nuevos (cobros, transferencias internas), realtime push.
  6. **Alertas AR/AP vencidas:** el runner 8B **materializa** `status → OVERDUE` (si estaba OPEN/PARTIAL) y luego notifica (día calendario UTC; dedupe 7 días).
- **Implicancias:** endurece fan-out de alertas operativas, procurement y eventos 8A; puede aumentar volumen in-app (y email en procurement) hacia OWNER/ADMIN; listados AR/AP con filtro OVERDUE quedan alineados al cron/runner.
- **Documentos afectados:** [`02-modules/NOTIFICATIONS.md`](../02-modules/NOTIFICATIONS.md), [`08-architecture/NOTIFICATIONS_ARCHITECTURE.md`](../08-architecture/NOTIFICATIONS_ARCHITECTURE.md), [`08-architecture/DEPLOYMENT_SMOKE_TEST.md`](../08-architecture/DEPLOYMENT_SMOKE_TEST.md).

---

### D-055 — WBS en líneas de factura de proveedor de proyecto y consumo JL

- **Fecha:** 2026-07-23
- **Estado:** ACTIVA
- **Decidido por:** Owner
- **Contexto:** Cierre de [Q-053](./OPEN_QUESTIONS.md). Facturas de proyecto sin OC y consumos de libro de obra no imputaban WBS; control de costos / R-MAT-01 quedaban ciegos. Parte del plan operativo de materiales ([`PLAN_MEJORAS_OPERATIVAS_PROYECTO.md`](../PLAN_MEJORAS_OPERATIVAS_PROYECTO.md)).
- **Decisión:**
  1. `SupplierInvoiceLine.wbsNodeId` (nullable en DB). **Obligatorio en service** cuando `SupplierInvoice.projectId` no es null (mismo espíritu que [D-050] para SC/OC). Facturas corporativas (`projectId` null) **sin** WBS.
  2. Facturas generadas desde OC copian `wbsNodeId` de la línea de OC.
  3. Control de costos: si las líneas de factura tienen WBS, imputar `accrued`/`paid` por línea; si no, mantener prorrateo vía OC (legacy).
  4. `JobsiteLogMaterialUsage.wbsNodeId` opcional. Al aprobar el parte: usar WBS de la línea de material; si falta y hay **exactamente una** partida de progreso en el log, usarla; si hay varias partidas de progreso y el material no trae WBS → **CONFLICT** (no crear consumo sin partida).
  5. `StockMovement` CONSUMPTION e IN de recepción copian `wbsNodeId` cuando está disponible.
- **Implicancias:** migración Prisma; validators/UI de factura y libro de obra; board de materiales / R-MAT-01 reciben consumos JL con WBS.
- **Documentos afectados:** [`OPEN_QUESTIONS.md`](./OPEN_QUESTIONS.md) Q-053, [`PLAN_MEJORAS_OPERATIVAS_PROYECTO.md`](../PLAN_MEJORAS_OPERATIVAS_PROYECTO.md), módulos AP / JOBSITE_LOG / cost control.

---

### D-056 — Company tools vs project tools en finanzas (RBAC)

- **Fecha:** 2026-07-24
- **Estado:** ACTIVA
- **Decidido por:** Owner
- **Contexto:** Usuarios con roles operativos (PROCUREMENT, SALES, PROJECT_MANAGER, etc.) veían hub `/finanzas`, tesorería y saldos de empresa por unión OR de `VIEW TREASURY`/`AR`/`AP`. Se buscó un modelo alineado a Procore (company tools ≠ project tools) y segregación caja vs controller.
- **Decisión:**
  1. **Company finance** (`/finanzas`, `/tesoreria`, `/contabilidad`, listados CxC/CxP/GG corporativos, saldos): solo `OWNER`, `ADMIN`, `FINANCE`, `TREASURER`, y `VIEWER` (lectura auditor).
  2. **`FINANCE`** = controller (caja + AR/AP + **GL/impuestos** `APPROVE`). **`TREASURER`** = caja/bancos/cobros/pagos (`APPROVE` tesorería; `EDIT` AR/AP; `VIEW` contabilidad; sin `APPROVE` GL/impuestos).
  3. Nuevo rol **`PROJECT_FINANCE`**: contador de obra — AR/AP/gastos de **proyecto**; sin company hub ni tesorería/GL de empresa.
  4. `PROJECT_MANAGER`, `PROCUREMENT`, `SALES` (y `PROJECT_FINANCE`): finanzas vía **proyecto** + módulos operativos; sin `VIEW TREASURY` / `VIEW ACCOUNTING` de empresa.
  5. GG corporativo y CxC/CxP **sin proyecto** quedan en company tools (`FINANCE` / `TREASURER` / admin).
  6. Techos “su proyecto” siguen sin `ProjectMembership` (deuda conocida); este cambio es company-tool vs project-tool.
- **Implicancias:** enum Prisma `PROJECT_FINANCE` + `TREASURER`; recorte `matrix.ts`; helpers `canViewCompany*`; gates nav/páginas; `BANK_ACCOUNTS` / `INTERNAL_TRANSFERS` no colapsan solo a `TREASURY`.
- **Documentos afectados:** [`USER_ROLES.md`](./USER_ROLES.md), [`PERMISSIONS_MATRIX.md`](./PERMISSIONS_MATRIX.md), [`08-architecture/PERMISSIONS_ROUTE_MATRIX.md`](../08-architecture/PERMISSIONS_ROUTE_MATRIX.md), [`08-architecture/ARCHITECTURE_DECISION_RECORDS.md`](../08-architecture/ARCHITECTURE_DECISION_RECORDS.md).
- **Nota:** la primera redacción de D-056 difería `TREASURER` (YAGNI); se incorporó el mismo día a pedido del owner para listado/matriz y segregación caja vs controller.

---

### D-057 — Partida certificable vs insumo APU

- **Fecha:** 2026-07-24
- **Estado:** ACTIVA
- **Decidido por:** Owner
- **Contexto:** Usuarios modelaban materiales (hierros, mallas) como hijos WBS bajo una partida medible (p. ej. zapata ml × 390), perdiendo unidad/cantidad en el padre y generando doble multiplicación o partidas certificables falsas.
- **Decisión:**
  1. **Capítulo** (`GROUP`): sin unidad/cantidad operativa; solo rollup de totales.
  2. **Partida certificable/vendible** (`ITEM` hoja): lleva `CostItem` (unidad, cantidad, APU) y es el nodo de certificación, OC/SC e imputación.
  3. **Insumos** (materiales, MO, equipos, subcontratos de composición): `CostAnalysisLine` bajo la partida — **nunca** nodos WBS hijos.
  4. Subdividir un `ITEM` convierte al padre en `GROUP` (migrar o descartar APU); sirve para partir **alcance de obra**, no para desglosar BOM.
- **Implicancias:** copy en UI de subdivide/import; guía operativa; [D-047](#d-047--apu-persistencia-unitaria-entrada-opcional-por-total-de-partida) para carga de cantidades de recurso.
- **Documentos afectados:** [`02-modules/WBS_AND_COST_ITEMS.md`](../02-modules/WBS_AND_COST_ITEMS.md), [`GUIA_OPERATIVA_BLOQER_V2.md`](../GUIA_OPERATIVA_BLOQER_V2.md).

---

### D-058 — APU muestra costo; venta en tabla EDT

- **Fecha:** 2026-07-24
- **Estado:** ACTIVA
- **Decidido por:** Owner
- **Contexto:** El modal APU mezclaba PU/total de venta con el desglose de costo, confundiendo dónde se edita cada capa.
- **Decisión:**
  1. Modal APU: unidad, cantidad, costo directo unitario, costo directo total, desglose MAT/MO/EQ/SUB. Sin PU venta ni total venta.
  2. Tabla EDT: Costo|Venta × Compacto|Desglose; toggle **Unitario** (aditivo) e **Incidencia** independientes. Los **totales siempre se muestran**; Unitario agrega columnas `/u` al lado (no reemplaza). Desglose por categoría solo en base Costo.
  3. Etiquetas de dinero en EDT/APU: **Costo directo** / **Costo dir. /u** (no “CD total”).
- **Implicancias:** UX de `cost-item-apu-dialog` y toolbar `wbs-tree`.
- **Documentos afectados:** [`02-modules/WBS_AND_COST_ITEMS.md`](../02-modules/WBS_AND_COST_ITEMS.md), [`GUIA_OPERATIVA_BLOQER_V2.md`](../GUIA_OPERATIVA_BLOQER_V2.md).
- **Amend (2026-07-24):** Unitario dejó de ser exclusivo vs Total; totales permanentes + unitario opcional.

---

### D-059 — Filas de detalle APU en EDT (UI-only)

- **Fecha:** 2026-07-24
- **Estado:** ACTIVA
- **Decidido por:** Owner
- **Contexto:** El cómputo correcto vive en APU bajo la partida hoja ([D-047]/[D-057]), pero el Excel de obra muestra insumos como filas verdes bajo la partida. Sin vista en EDT, el usuario siente que debe crear hijos WBS `4.1.1` (anti-patrón).
- **Decisión:**
  1. La EDT puede **expandir** una hoja con líneas APU visibles (MAT/LAB/EQ/SUB) y mostrar filas de detalle **solo lectura** bajo la partida. No crean `WbsNode`, no tienen código WBS, no tienen acciones de estructura.
  2. Dinero de línea en detalle: `partidaMoney = totalCost × CostItem.quantity` (única fuente). Cant. recurso es columna aparte (`partidaQuantity` o `coef×qty`); solo `isLumpSum` muestra etiqueta “global”.
  3. Estado de expand APU (`apuExpandedIds`) es **independiente** del expand de GROUPs. “Expandir/Contraer todo” solo afecta GROUPs WBS.
  4. Mutación de composición: solo modal APU. Click en fila detalle abre el APU de la partida padre.
  5. Totales / TOTAL GENERAL / export CSV·XLSX·PDF: **sin** filas APU (solo WBS). Board de materiales sigue siendo solo `category = MATERIAL`.
  6. Certificaciones, OC/SC, cronograma siguen imputando al `wbsNodeId` de la partida hoja.
- **Implicancias:** UX `wbs-tree`; helpers de presentación; docs operativas. Sin migración Prisma.
- **Documentos afectados:** [`02-modules/WBS_AND_COST_ITEMS.md`](../02-modules/WBS_AND_COST_ITEMS.md), [`GUIA_OPERATIVA_BLOQER_V2.md`](../GUIA_OPERATIVA_BLOQER_V2.md).

---

### D-060 — Columna Incidencia % en EDT (independiente)

- **Fecha:** 2026-07-24
- **Estado:** ACTIVA
- **Decidido por:** Owner
- **Contexto:** Hace falta ver el peso de cada capítulo/partida sobre el presupuesto sin mezclarlo con desglose MAT/MO ni con unitario/total.
- **Decisión:**
  1. Toggle **Incidencia** en la toolbar EDT, **independiente** de Costo|Venta × Compacto|Desglose × Unitario.
  2. Columna al final (antes de acciones): `% = total_fila / TOTAL_GENERAL × 100`.
  3. Base Costo → usa `totalCostDirect` (costo directo); base Venta → usa `totalSalePrice`. Siempre totales de fila (nunca PU), también con Unitario activo.
  4. GROUPs usan el roll-up de hijos; hojas usan su CD/venta; filas detalle APU → "—"; TOTAL GENERAL → 100% (si el total > 0).
  5. Export CSV/XLSX/PDF respeta el modo EDT activo (incl. incidencia) vía query `base`, `scale`, `detail`, `incidence`.
- **Implicancias:** `wbs-view-mode`, `wbs-tree`, export presupuesto.
- **Documentos afectados:** [`02-modules/WBS_AND_COST_ITEMS.md`](../02-modules/WBS_AND_COST_ITEMS.md).

---

### D-061 — Contabilidad Phase 11E: plantilla AR, auto-DRAFT soft, anti-doble-conteo

- **Fecha:** 2026-07-24
- **Estado:** ACTIVA
- **Decidido por:** Owner
- **Contexto:** El GL 11A–11D existía solo con sugerencias manuales. Hacía falta automatizar borradores sin auto-postear ni romper cobros/pagos de roles sin EDIT ACCOUNTING.
- **Decisión:**
  1. **Auto-crear `JournalEntry` en `DRAFT` post-commit** vía `ensureDraftJournal*` (soft): no falla la operación operativa; no exige `EDIT ACCOUNTING`; si el módulo ACCOUNTING está off o no hay regla → audit `journal_entry.auto_draft_skipped`.
  2. **Nunca auto-`POST`** en esta etapa.
  3. **Anti-doble-conteo:** no generar asiento `TREASURY_*` si `AccountMovement.sourceType ∈ {COLLECTION, PAYMENT, OPENING_BALANCE}`; el canónico es cobro/pago/factura.
  4. **Accrual** sobre `invoice.totalAmount` (mismo valor que CxC/CxP), 2 líneas; IVA/retenciones solo cuentas del plan (sin motor fiscal).
  5. **Cancel sync:** al anular origen, auto-cancelar DRAFT vinculado; si hay POSTED sin reverse → bloquear anulación del origen.
  6. **Plantilla CoA AR** (~40 cuentas + reglas default) aplicable por empresa, **idempotente por código** (reaplicar no duplica).
  7. **Unique parcial** DB: un solo asiento no-`CANCELLED` por `(tenantId, companyId, sourceType, sourceId)`.
  8. Stock consumo **sin auto-DRAFT** hasta costing (D-007).
- **Implicancias:** services accounting + hooks en create Collection/Payment/Invoice/Transfer/corporate inflow; UI plantilla, reverse, sumas y saldos.
- **Documentos afectados:** [`02-modules/ACCOUNTING.md`](../02-modules/ACCOUNTING.md), [`08-architecture/ACCOUNTING_LEDGER_ARCHITECTURE.md`](../08-architecture/ACCOUNTING_LEDGER_ARCHITECTURE.md), [`01-domain/STATE_MACHINES.md`](../01-domain/STATE_MACHINES.md).

---

### D-062 — Contabilidad Phase 11F: reportes gerenciales, estados y exports

- **Fecha:** 2026-07-24
- **Estado:** ACTIVA
- **Decidido por:** Owner
- **Contexto:** Tras 11E (auto-DRAFT + trial balance básico) faltaban libros, estados gerenciales y exports alineados al stack de reportes, sin inventar ejercicio fiscal ni RT 54.
- **Decisión:**
  1. Reportes **gerenciales on-the-fly** solo con líneas de asientos `POSTED`. No sustituyen estados oficiales, AFIP ni ajuste por inflación.
  2. **Saldo natural:** `ASSET`/`EXPENSE` = Debe − Haber; `LIABILITY`/`EQUITY`/`INCOME` = Haber − Debe. Aplica a sumas y saldos, mayor (saldo corrido) y estados.
  3. **Sumas y saldos / libro diario / mayor / EERR:** filtro `dateFrom`/`dateTo` (inclusive, `entryDate`). Default UI: mes corriente.
  4. **ESP (situación patrimonial):** corte `asOfDate` (`entryDate ≤ asOfDate`). Patrimonio incluye línea sintética **“Resultado del ejercicio (no cerrado)”** = resultado INCOME−EXPENSE acumulado al corte (sin cierre de ejercicio ni cuenta de cierre).
  5. **Multi-moneda:** bloques por moneda; sin consolidación FX.
  6. **Exports** CSV/PDF; XLSX en sumas, diario, ESP y EERR. Rutas `/api/reports/contabilidad/*` con `VIEW ACCOUNTING` + módulo ACCOUNTING.
  7. **Sin tablas Prisma nuevas**, sin numeración correlativa de libro, sin cierre de período GL.
- **Implicancias:** services `accounting-reports` + export; UI libros/estados; subnav; hub KPIs; disclaimer gerencial.
- **Documentos afectados:** [`02-modules/ACCOUNTING.md`](../02-modules/ACCOUNTING.md), [`08-architecture/ACCOUNTING_LEDGER_ARCHITECTURE.md`](../08-architecture/ACCOUNTING_LEDGER_ARCHITECTURE.md), [`06-reports/REPORT_CATALOG.md`](../06-reports/REPORT_CATALOG.md), [`08-architecture/PERMISSIONS_ROUTE_MATRIX.md`](../08-architecture/PERMISSIONS_ROUTE_MATRIX.md).

---

### D-063 — Contabilidad: lock de montos en DRAFT con origen + aviso anti-spam

- **Fecha:** 2026-07-25
- **Estado:** ACTIVA
- **Decidido por:** Owner
- **Contexto:** Auto-DRAFT (D-061) ya crea borradores desde operaciones, pero la edición permitía cambiar montos (desalineado vs documento) y no había señal in-app de cola de revisión sin spam.
- **Decisión:**
  1. Mantener **auto-DRAFT** y **nunca auto-POST** (D-061).
  2. Asiento **sourced** (`sourceType !== MANUAL` y `sourceId` set) en `DRAFT`: **no** editar `debit`/`credit`/`currency` ni agregar/quitar líneas. **Sí** editar `description`, `reference`, `entryDate` y `accountId` / descripción de línea (corregir mapeo). Enforce en service layer (no solo UI).
  3. Asientos `MANUAL`: edición completa como hoy.
  4. Notificación in-app `ACCOUNTING_DRAFTS_PENDING` a audiencia con `EDIT ACCOUNTING` (OWNER/ADMIN/FINANCE), módulo ACCOUNTING on; **dedupe 24h** por `(tenant, type, recipient, company)`; soft-fail (nunca tumba la operación). Sin email en esta iteración.
  5. `actionUrl` → `/contabilidad/asientos?status=DRAFT` (con `empresa` si aplica). `LinkedEntityType.OTHER` + `linkedEntityId = companyId`.
- **Implicancias:** `updateJournalEntry` + UI form; helper notif + hook post-`ensureFromRule`; migración enum `NotificationType`.
- **Documentos afectados:** [`02-modules/ACCOUNTING.md`](../02-modules/ACCOUNTING.md), [`08-architecture/ACCOUNTING_LEDGER_ARCHITECTURE.md`](../08-architecture/ACCOUNTING_LEDGER_ARCHITECTURE.md), [`08-architecture/NOTIFICATIONS_ARCHITECTURE.md`](../08-architecture/NOTIFICATIONS_ARCHITECTURE.md), [`08-architecture/PERMISSIONS_ROUTE_MATRIX.md`](../08-architecture/PERMISSIONS_ROUTE_MATRIX.md).

---

### D-064 — Invitación por email al tenant (Q-015)

- **Fecha:** 2026-07-25
- **Estado:** ACTIVA
- **Decidido por:** Owner
- **Contexto:** Q-015 pedía definir cómo un usuario se une a un tenant. Phase 10C ya implementó invitaciones; faltaba cerrar el log de producto. El self-signup de primer tenant (Phase 14A) es independiente.
- **Decisión:**
  1. Unirse a un tenant existente = **invitación por email** (`TenantInvitation` PENDING + token sha256 + aceptación con sesión cuyo email coincide).
  2. **No** auto-registro con código de tenant.
  3. **No** solicitud pública de unión con aprobación del OWNER (join-request).
  4. Quien invita (tenant OWNER/ADMIN o platform superadmin) elige roles; crear la invitación *es* la aprobación.
- **Implicancias:** onboarding muestra invites PENDING y bloquea crear otro tenant si hay invite; credentials email/password (ADR-Auth-Credentials-01) no cambian este modelo.
- **Documentos afectados:** [`OPEN_QUESTIONS.md`](./OPEN_QUESTIONS.md) Q-015, [`02-modules/USERS_AND_PERMISSIONS.md`](../02-modules/USERS_AND_PERMISSIONS.md), [`08-architecture/SECURITY_ARCHITECTURE.md`](../08-architecture/SECURITY_ARCHITECTURE.md), [`08-architecture/AUTH_ARCHITECTURE.md`](../08-architecture/AUTH_ARCHITECTURE.md).

---

### D-065 — Exposición esperada canónica en EDT y costos ([BR-COS-002])

- **Fecha:** 2026-07-26
- **Estado:** ACTIVA
- **Decidido por:** Owner
- **Contexto:** El service de control de costos usaba `expectedCostExposure = max(committed, received, accrued)`, divergente de [`COST_FORMULAS.md`](../04-formulas/COST_FORMULAS.md), [BR-COS-002], la guía operativa y D-021. Eso hacía ilegible el tablero frente a Procore / control de obra.
- **Decisión:**
  1. **`open_committed_amount`** = `max(0, committed − accrued_linked_to_commitments)`.
  2. **`expected_cost_exposure`** = `accrued + open_committed` (**no** `max(...)`; **no** sumar committed+accrued bruto).
  3. **`accrued_linked`** incluye facturas ISSUED con vínculo a compromiso (OC header y/o `SupplierInvoiceLine.purchaseOrderLineId` [D-066]) y certificaciones de subcontrato APPROVED. Facturas directas de proyecto **no** reducen open_committed.
  4. La capa **Recibido** permanece informativa (físico); **no** entra en la exposición.
  5. Invalidar notas de SESSION_HANDOFF / RELEVAMIENTO R-06 que documentaban `max(...)` como mitigación canónica.
- **Implicancias:** `cost-control.service` + helper `computeCostExposureLayers`; tooltips UI; PDF/CSV heredan el campo corregido.
- **Documentos afectados:** [`COST_FORMULAS.md`](../04-formulas/COST_FORMULAS.md), [`BUSINESS_RULES.md`](../01-domain/BUSINESS_RULES.md) BR-COS-002, [`GUIA_OPERATIVA_BLOQER_V2.md`](../GUIA_OPERATIVA_BLOQER_V2.md), [`SESSION_HANDOFF.md`](../SESSION_HANDOFF.md).

---

### D-066 — `SupplierInvoiceLine.purchaseOrderLineId` (trazabilidad OC → factura)

- **Fecha:** 2026-07-26
- **Estado:** ACTIVA
- **Decidido por:** Owner
- **Contexto:** Solo existía `SupplierInvoice.purchaseOrderId` a nivel header; el reporting prorrateaba por pesos de líneas OC. Faltaba click-path y anti doble conteo por vínculo real línea a línea (alineado a Procore commitments → invoices).
- **Decisión:**
  1. Agregar `SupplierInvoiceLine.purchaseOrderLineId` **nullable** (facturas directas / legacy).
  2. Al crear factura desde OC (“Traer líneas” / draft from PO), **persistir** el FK + `wbsNodeId` de la línea OC.
  3. En service: si la factura tiene `purchaseOrderId` y la línea nace del draft OC, el FK es **requerido** para esas líneas; alta manual puede omitirlo.
  4. Cost control: preferir imputación accrued/paid por `purchaseOrderLine.wbsNodeId` cuando el FK existe; fallback al prorrateo header.
  5. **No** cambia [D-057]: el eje de costo sigue siendo la partida EDT (`wbsNodeId`), no el APU.
- **Implicancias:** migración Prisma; validators AP; `supplier-invoice-from-po*`; drilldown EDT lista facturas/pagos con links.
- **Documentos afectados:** [`PURCHASE_ORDERS_AND_RECEIPTS.md`](../02-modules/PURCHASE_ORDERS_AND_RECEIPTS.md), [`PROCUREMENT.md`](../02-modules/PROCUREMENT.md), schema Prisma.

---

### D-067 — Tolerancias de recepción y matching 3 vías (P-PROC-01/02)

- **Fecha:** 2026-07-26
- **Estado:** ACTIVA
- **Decidido por:** Owner
- **Contexto:** BR-PUR-006 pedía tolerancia de sobrecantidad configurable (0–5%) pero la recepción bloqueaba siempre. BR-PUR-012 pedía matching OC↔recepción↔factura; solo había avisos de monto header.
- **Decisión:**
  1. `CompanyProcurementSettings.overReceiptTolerancePct` (default **0**, máximo **5**): la recepción puede superar la cantidad de OC hasta ese %; fuera de tolerancia → **bloqueo**.
  2. `CompanyProcurementSettings.invoiceMatchTolerancePct` (default **0**, máximo **25**): si factura (monto o qty por línea vía [D-066]) supera recibido + tolerancia → **aviso** en detalle OC/factura; **no bloquea** emitir en esta fase.
  3. Panel de facturación OC muestra avisos por línea (ordenado / recibido / facturado).
  4. Justificación obligatoria / aprobación AP por matching fuera de tolerancia queda para fase posterior (sigue [BR-PUR-012] documentado).
- **Implicancias:** settings UI `/configuracion/politicas`; `purchase-receipt-guards`; `three-way-match-pure`; billing summary.
- **Documentos afectados:** [`BUSINESS_RULES.md`](../01-domain/BUSINESS_RULES.md) BR-PUR-006/012, [`SESSION_HANDOFF.md`](../SESSION_HANDOFF.md) P-PROC-01/02, guía operativa.

---

### D-068 — `costAnalysisLineId` opcional en líneas OC/SC (hint APU)

- **Fecha:** 2026-07-26
- **Estado:** ACTIVA
- **Decidido por:** Owner
- **Contexto:** El usuario quiere elegir el insumo APU (material) bajo la partida al armar OC, sin convertir el APU en cost code ([D-057]).
- **Decisión:**
  1. `PurchaseOrderLine.costAnalysisLineId` y `PurchaseRequestLine.costAnalysisLineId` **nullable**.
  2. Solo válido si el APU pertenece al `CostItem` de la partida `wbsNodeId` elegida.
  3. Prefill de descripción / unidad / precio / `productId` es UX; el **eje de imputación de $** sigue siendo `wbsNodeId`.
  4. Baseline de varianza prefiere el APU explícito cuando está seteado.
- **Implicancias:** editor OC con columna “Insumo APU”; `listProcurementWbsOptions` incluye `apuLines`.
- **Documentos afectados:** [`WBS_AND_COST_ITEMS.md`](../02-modules/WBS_AND_COST_ITEMS.md), [`PURCHASE_ORDERS_AND_RECEIPTS.md`](../02-modules/PURCHASE_ORDERS_AND_RECEIPTS.md).

---

### D-069 — Pago de CxP: solo finanzas/tesorería + notificaciones in-app (Q-056)

- **Fecha:** 2026-07-26
- **Estado:** ACTIVA
- **Decidido por:** Owner
- **Contexto:** Compras podía debitar cuentas de empresa con solo `EDIT AP`. El PM no elige banco; hace falta segregación tipo payment run y avisos cuando hay algo listo para pagar / cuando se pagó.
- **Decisión:**
  1. **Quién paga ([Q-056] opción 2):** `canRegisterApPayment` = company-finance + `EDIT AP`, **o** `EDIT TREASURY`. Aplica a `createPayment`, `cancelPayment` y “Emitir y pagar ahora”. PROCUREMENT/PM siguen emitiendo facturas/CxP pero **no** eligen cuenta bancaria.
  2. **Notificación `PAYABLE_READY_TO_PAY`:** al emitir factura de **proyecto** (payable OPEN), a audiencia de pago + CC OWNER/ADMIN. Menciona OC si está vinculada. Canal configurable por empresa ([D-070]).
  3. **Notificación `PAYMENT_CONFIRMED`:** al confirmar pago, a `EDIT PROCUREMENT` + CC OWNER/ADMIN. Canal configurable por empresa ([D-070]).
- **Implicancias:** migración enum `NotificationType`; UI oculta “Registrar pago” / pay-now sin permiso; [`OPEN_QUESTIONS.md`](./OPEN_QUESTIONS.md) Q-056 resuelta.
- **Documentos afectados:** [`PERMISSIONS_MATRIX.md`](./PERMISSIONS_MATRIX.md) (nota), [`SESSION_HANDOFF.md`](../SESSION_HANDOFF.md).

---

### D-070 — Canal de avisos de pago AP: in-app o in-app+email

- **Fecha:** 2026-07-26
- **Estado:** ACTIVA
- **Decidido por:** Owner
- **Contexto:** Con solo in-app ([D-069]), finanzas/compras fuera de la app no se enteran y pueden atrasar obra. Hace falta poder elegir email también.
- **Decisión:**
  1. Campo `CompanyProcurementSettings.apPaymentNotificationChannel`: `IN_APP` | `IN_APP_AND_EMAIL`.
  2. **Default:** `IN_APP_AND_EMAIL` (recomendado para no atrasar pagos).
  3. Aplica a `PAYABLE_READY_TO_PAY` y `PAYMENT_CONFIRMED`. Email vía `sendNotificationEmailAsSystem` (best-effort; si Resend no está configurado, queda solo in-app).
  4. UI en `/configuracion/politicas`.
- **Implicancias:** no cambia quién recibe (audiencia [D-069]); solo el canal.
- **Documentos afectados:** [`OPEN_QUESTIONS.md`](./OPEN_QUESTIONS.md) Q-056, [`PERMISSIONS_MATRIX.md`](./PERMISSIONS_MATRIX.md) §9.3b.

---

### D-071 — Logo de tenant (sidebar + PDF)

- **Fecha:** 2026-08-07
- **Estado:** ACTIVA
- **Decidido por:** Owner
- **Contexto:** Las empresas necesitan identidad visual propia en la plataforma (sidebar) y en exportaciones PDF, sin mezclar marcas entre tenants.
- **Decisión:**
  1. El logo es **atributo del Tenant** (`logoStorageKey` / mime), no de Company.
  2. **Quién edita:** OWNER y ADMIN vía `EDIT TENANT_SETTINGS` (igual que nombre / timezone / contacto) en Configuración → General.
  3. **Dónde se ve en UI:** sidebars de app tenant (menú empresa + workspace de obra). Login, onboarding y consola `/platform` siguen con marca Bloqer.
  4. **Fallback UI:** sin logo subido → logo Bloqer. **PDF:** con logo → encabezado; sin logo → solo texto (nunca logo Bloqer en PDF del cliente).
  5. **Aislamiento:** clave R2 bajo `{tenantId}/branding/…`; lectura/escritura/export solo con `ctx.tenantId` / sesión — nunca aceptar `logoKey`/`logoUrl` del cliente en export.
- **Implicancias:** migración Prisma; upload R2; proxy autenticado para sidebar; `resolvePdfReportBranding` incluye data URI scoped.
- **Documentos afectados:** [`CORE_ENTITIES.md`](../01-domain/CORE_ENTITIES.md), [`EXPORT_FORMATS.md`](../06-reports/EXPORT_FORMATS.md), [`REPORTING_ARCHITECTURE.md`](../08-architecture/REPORTING_ARCHITECTURE.md), [`FILE_STORAGE_ARCHITECTURE.md`](../08-architecture/FILE_STORAGE_ARCHITECTURE.md), [`GUIA_OPERATIVA_BLOQER_V2.md`](../GUIA_OPERATIVA_BLOQER_V2.md) §1.3.

---

### D-072 — Cobranza de CxC: solo Collection acredita banco + aviso a finanzas empresa

- **Fecha:** 2026-08-07
- **Estado:** ACTIVA
- **Decidido por:** Owner
- **Contexto:** Audit de flujo financiero de obra: se pedía que certificación o cobro “acrediten banco”, o al menos avisar a roles de finanza **empresa** (no `PROJECT_FINANCE`) para aplicar el cobro.
- **Decisión:**
  1. **Quién acredita tesorería:** únicamente **`Collection` confirmada** (elige `TreasuryAccount` → `AccountMovement` INFLOW). Certificación ISSUED/APPROVED y factura de venta ISSUED **no** mueven caja/banco.
  2. **Notificación `RECEIVABLE_READY_TO_COLLECT`:** al emitir factura de venta de **proyecto** con CxC aún con saldo (incluye alta “registrar venta” sin cobro total). CTA → registrar cobranza.
  3. **Audiencia:** `OWNER` ∪ `ADMIN` ∪ `FINANCE` ∪ `TREASURER` (+ CC OWNER/ADMIN vía `resolveNotificationAudience`). **No** fan-out a `PROJECT_FINANCE` ni VIEWER.
  4. **RBAC de cobranza:** sin cambio — PM / `PROJECT_FINANCE` con `EDIT AR` **pueden** seguir registrando cobranzas de obra (asimetría consciente vs D-069 de pagos AP).
  5. **UI naming:** copy de usuario usa **EDT** (no “WBS”); código/Prisma siguen `wbs*`.
- **Implicancias:** enum `NotificationType`; soft-fail notify; email best-effort.
- **Documentos afectados:** [`NOTIFICATIONS_ARCHITECTURE.md`](../08-architecture/NOTIFICATIONS_ARCHITECTURE.md), [`PERMISSIONS_MATRIX.md`](./PERMISSIONS_MATRIX.md) §9.3b, [`GUIA_OPERATIVA_BLOQER_V2.md`](../GUIA_OPERATIVA_BLOQER_V2.md), [`GLOSSARY.md`](./GLOSSARY.md).

---

### D-073 — Costo financiero del presupuesto: tasa anual × días/365 (Q-011 opción 2)

- **Fecha:** 2026-08-07
- **Estado:** ACTIVA
- **Decidido por:** Owner (implementación alineada a `BUDGET_FORMULAS.md`)
- **Contexto:** `BudgetSettings.financialCostPct` y `financialDaysAvg` existían; el motor aplicaba solo un % plano sobre (directo + GG), ignorando días.
- **Decisión:**
  1. Cierra [Q-011](./OPEN_QUESTIONS.md) con **opción 2**: tasa y días **por presupuesto** (`BudgetSettings`).
  2. Fórmula Fase 1: \(CF = base \times r_{fin} \times d_{prom}/365\) donde `base` = costo directo + GG a nivel ítem (misma cascada de venta).
  3. Si `financialDaysAvg = 0`: se mantiene el **% plano** legacy (compatibilidad con presupuestos que nunca cargaron días).
  4. UI expone tasa anual % y días promedio; el preview muestra el % efectivo cuando hay días.
- **Implicancias:** al guardar settings con días &gt; 0 se recalculan ítems; no hay migración de datos (días 0 = sin cambio de montos).
- **Documentos afectados:** [`BUDGET_FORMULAS.md`](../04-formulas/BUDGET_FORMULAS.md), [`OPEN_QUESTIONS.md`](./OPEN_QUESTIONS.md) Q-011.

---

### D-074 — Método de liquidación y referencia en Collection / Payment (Q-054)

- **Fecha:** 2026-08-07
- **Estado:** ACTIVA
- **Decidido por:** Owner (continuación backlog tesorería)
- **Contexto:** cobros y pagos solo tenían `notes`; faltaba canal de liquidación y referencia bancaria para conciliación ([Q-007]).
- **Decisión:**
  1. Cierra [Q-054](./OPEN_QUESTIONS.md).
  2. Enum `TreasurySettlementMethod`: `CASH | BANK_TRANSFER | CHECK | CARD | OTHER`.
  3. Campos opcionales nullable en `Collection` y `Payment`: `paymentMethod`, `reference` (máx. 120 en validators).
  4. Filas legacy quedan null; no backfill.
  5. UI (ES-AR): Efectivo / Transferencia / Cheque / Tarjeta / Otro + referencia opcional en formularios de cobro/pago y en collectNow/payNow.
- **Implicancias:** migración Prisma; no cambia saldos ni movimientos; facilita matching futuro en bank reconciliation.
- **Documentos afectados:** [`CORE_ENTITIES.md`](../01-domain/CORE_ENTITIES.md), [`TREASURY.md`](../02-modules/TREASURY.md), [`OPEN_QUESTIONS.md`](./OPEN_QUESTIONS.md) Q-054.

---

### D-075 — Conciliación bancaria Fase 1 manual (Q-007 opción 1)

- **Fecha:** 2026-08-07
- **Estado:** ACTIVA
- **Decidido por:** Owner (continuación backlog tesorería)
- **Contexto:** no existía modelo/UI de conciliación; `AccountMovementStatus` no incluía `RECONCILED`; Q-007 pedía confirmar importación vs manual.
- **Decisión:**
  1. Cierra [Q-007](./OPEN_QUESTIONS.md) con **opción 1**: Fase 1 100% manual; CSV/OFX diferido.
  2. Entidades: `BankReconciliation` (`DRAFT` → `IN_PROGRESS` → `CLOSED` | `CANCELLED` — [D-032]), `BankStatementLine` (crédito/débito + monto), `BankReconciliationMatch` (1:1 línea↔movimiento).
  3. Match marca `AccountMovement` → `RECONCILED`; desconciliar / cancelar sesión vuelve a `CONFIRMED` ([BR-TRZ-002]).
  4. Saldos y reportes de tesorería incluyen `CONFIRMED` **y** `RECONCILED`.
  5. Cierre exige extracto que cuadre (inicial + créditos − débitos = final) y todas las líneas emparejadas.
  6. Una sola sesión abierta (`DRAFT`/`IN_PROGRESS`) por cuenta.
- **Fuera de alcance ahora:** import CSV/OFX; crear movimiento faltante desde diferencia; reapertura formal de sesión `CLOSED` (solo cancelación excepcional).
- **Documentos afectados:** [`BANK_RECONCILIATION.md`](../02-modules/BANK_RECONCILIATION.md), [`OPEN_QUESTIONS.md`](./OPEN_QUESTIONS.md) Q-007, [`PENDING_ARCHITECTURE_ITEMS.md`](../08-architecture/PENDING_ARCHITECTURE_ITEMS.md) P-TRZ-05.

---

### D-076 — Formato CSV de extracto bancario (Q-007 Fase 2 mínima)

- **Fecha:** 2026-08-07
- **Estado:** ACTIVA
- **Decidido por:** Owner (continuación conciliación)
- **Contexto:** tras [D-075] hacía falta un formato de importación mínimo sin OFX ni API bancaria.
- **Decisión:**
  1. Completa la parte CSV de [Q-007](./OPEN_QUESTIONS.md); OFX e integración directa siguen diferidos.
  2. CSV de texto (UTF-8, BOM opcional), separador `,` o `;` auto-detectado.
  3. Encabezados (EN/ES): `date|fecha`, `description|descripcion`, `amount|monto|importe`, `direction|direccion|tipo`; opcional `reference|referencia`.
  4. Monto siempre positivo; dirección `CREDIT`/`DEBIT` (aliases crédito/débito, C/D, ingreso/egreso).
  5. Fechas `YYYY-MM-DD` o `DD/MM/YYYY`. Máx. 500 filas por import.
  6. Filas fuera del período de la sesión se omiten (conteo en respuesta); no se crean matches automáticos.
- **Implicancias:** UI en `/tesoreria/conciliacion/[id]`; parser puro en services con tests.
- **Documentos afectados:** [`BANK_RECONCILIATION.md`](../02-modules/BANK_RECONCILIATION.md), [`OPEN_QUESTIONS.md`](./OPEN_QUESTIONS.md) Q-007.

---

### D-077 — Cobrar ahora inline en facturas de venta de proyecto (Q-055)

- **Fecha:** 2026-08-08
- **Estado:** ACTIVA
- **Decidido por:** Owner (continuación paridad AP/AR)
- **Contexto:** [D-052] difería el cobro inmediato en alta manual de factura de venta de obra; el service `registerArSale` ya soportaba `collectNow`.
- **Decisión:**
  1. Cierra [Q-055](./OPEN_QUESTIONS.md).
  2. El alta de factura de venta **manual de proyecto** ofrece **“Emitir y cobrar ahora”** (checkbox + cuenta + fecha + método/referencia), simétrico a “Emitir y pagar ahora” de AP ([D-052]).
  3. El bloque se muestra solo si el módulo `TREASURY` está activo y el usuario tiene `EDIT TREASURY` (misma segregación que el cobro en `registerArSale`).
  4. Con cobro: `registerArSale` emite factura + CxC + Collection + movimiento. Sin cobro: sigue el borrador vía `createSalesInvoice`.
  5. Factura desde **certificación** no cambia (sigue borrador → emitir → cobrar aparte / anticipo aparte).
- **Implicancias:** sin migración; reutiliza validators `collectNow` / `registerArSaleSchema`.
- **Documentos afectados:** [`SALES_AND_COLLECTIONS.md`](../02-modules/SALES_AND_COLLECTIONS.md), [`OPEN_QUESTIONS.md`](./OPEN_QUESTIONS.md) Q-055, [D-052](./DECISION_LOG.md) punto 6.

---

### D-078 — Cierre de período financiero (tesorería + GL)

- **Fecha:** 2026-08-08
- **Estado:** ACTIVA
- **Decidido por:** Owner (continuación backlog: F-49 / D-014)
- **Contexto:** Existía [D-014] y docs de `Period`, pero no había modelo ni enforcement. El freeze de GG (`OverheadPeriodClose`) es otro producto. El ledger listaba “GL period close” como pendiente.
- **Decisión:**
  1. Entidad `Period` por `(tenantId, companyId, periodKey YYYY-MM)` con `startDate`/`endDate` UTC, estado `OPEN|CLOSED`.
  2. Cerrar/reabrir: solo `OWNER`/`ADMIN` vía permiso `PERIOD_CLOSE` ([BR-PER-001]); reapertura exige motivo + audit `period.closed` / `period.reopened`.
  3. Bloqueo transversal (`assertFinancialPeriodOpen`):
     - `AccountMovement.movementDate` (equivalente operativo a `date_accounting` en docs).
     - `JournalEntry.entryDate` (crear, editar, postear, anular borrador, revertir).
  4. UI: `/contabilidad/cierres`.
  5. Sin solapar con cierre AUTO_WEIGHT de GG ([D-043]).
- **Implicancias:** migración `periods`; filas sin `companyId` en tesorería no aplican el lock (edge legacy).
- **Documentos afectados:** [`PERIOD_CLOSE_AND_LOCKS.md`](../03-finance/PERIOD_CLOSE_AND_LOCKS.md), [`CLOSE_PERIOD.md`](../05-workflows/CLOSE_PERIOD.md), [`ACCOUNTING_LEDGER_ARCHITECTURE.md`](../08-architecture/ACCOUNTING_LEDGER_ARCHITECTURE.md), [`ACCOUNTING.md`](../02-modules/ACCOUNTING.md).

---

### D-079 — Importación OFX/QFX de extracto bancario

- **Fecha:** 2026-08-08
- **Estado:** ACTIVA
- **Decidido por:** Owner (continuación post [D-076])
- **Contexto:** CSV cubría import mínimo; muchos bancos exportan OFX/QFX.
- **Decisión:**
  1. Import OFX 1.x / QFX (SGML) en sesión `DRAFT`/`IN_PROGRESS`: bloques `<STMTTRN>` con `DTPOSTED`, `TRNAMT`, `NAME`/`MEMO`, `FITID`/`CHECKNUM`.
  2. `TRNAMT` positivo → CREDIT; negativo → DEBIT; monto absoluto a 2 dp.
  3. Mismas reglas que CSV: máx. 500 filas; fuera de período se omiten; sin match automático.
  4. API bancaria directa queda fuera de fases 0–5 ([D-080] / `INTEGRATIONS_FUTURE`).
- **Implicancias:** parser puro + `importBankStatementLinesFromOfx`; UI en workspace de conciliación.
- **Documentos afectados:** [`BANK_RECONCILIATION.md`](../02-modules/BANK_RECONCILIATION.md), [`OPEN_QUESTIONS.md`](./OPEN_QUESTIONS.md) Q-007, [`PENDING_ARCHITECTURE_ITEMS.md`](../08-architecture/PENDING_ARCHITECTURE_ITEMS.md) P-TRZ-05.

---

### D-080 — Reapertura formal de conciliación bancaria CLOSED

- **Fecha:** 2026-08-08
- **Estado:** ACTIVA
- **Decidido por:** Owner (cierre P-TRZ-05 operativo)
- **Contexto:** [D-032]/[D-075] pedían reapertura formal; solo existía cancelar sesión.
- **Decisión:**
  1. Transición `CLOSED` → `IN_PROGRESS` con **motivo obligatorio** (≥3 chars) y audit `bank_reconciliation.reopened`.
  2. Se conservan matches y movimientos `RECONCILED`; el operador puede desconciliar/editar de nuevo.
  3. Bloqueado si ya hay otra sesión `DRAFT`/`IN_PROGRESS` en la misma cuenta.
  4. **API bancaria directa** queda **fuera** de las fases de implementación 0–5 — ver [`INTEGRATIONS_FUTURE.md`](../07-non-functional/INTEGRATIONS_FUTURE.md). CSV+OFX cubren el alcance de extractos.
- **Documentos afectados:** [`STATE_MACHINES.md`](../01-domain/STATE_MACHINES.md) §24, [`BANK_RECONCILIATION.md`](../02-modules/BANK_RECONCILIATION.md), [`PENDING_ARCHITECTURE_ITEMS.md`](../08-architecture/PENDING_ARCHITECTURE_ITEMS.md) P-TRZ-05.

---

### D-081 — Cierre Phase 3: ERD cobros/pagos, saldos y deferrals FX/overdraft

- **Fecha:** 2026-08-08
- **Estado:** ACTIVA
- **Decidido por:** Owner (plan cierre Phases 3→4→5)
- **Contexto:** Ítems `P-ERD-01/02/06` y `P-TRZ-02/03/04` abiertos bloqueaban el sign-off de Phase 3.
- **Decisión:**
  1. **P-ERD-01:** `Collection` 1:1 con un `Receivable` y `Payment` 1:1 con un `Payable`. **Sin** tablas `*_application`. Parcialidad = múltiples documentos sobre el mismo receivable/payable ([D-010]).
  2. **P-ERD-02:** Saldos **mantenidos** en servicio (`paidAmount` / `originalAmount`); `balanceDue` derivado. `OVERDUE` on-read + alertas ([P-TRZ-01]); no columna `balance` persistida separada.
  3. **P-ERD-06:** `BankStatementLine` ya modelada como entidad (tabla) — cierre.
  4. **P-TRZ-04:** UI genérica `/tesoreria/cuentas/[id]/ajuste` con `MANUAL_ADJUSTMENT` INFLOW/OUTFLOW + `assertFinancialPeriodOpen` + auto-DRAFT GL.
  5. **Fuera de cierre Phase 3:** FX cobro/pago ([P-TRZ-02]) y `allowOverdraft` ([P-TRZ-03]) — misma moneda + saldo no negativo. API bancaria ya fuera ([D-080]).
- **Documentos afectados:** [`PENDING_ARCHITECTURE_ITEMS.md`](../08-architecture/PENDING_ARCHITECTURE_ITEMS.md), [`PHASE_3_FINANCE_TREASURY.md`](../08-architecture/PHASE_3_FINANCE_TREASURY.md), [`TREASURY.md`](../02-modules/TREASURY.md).

---

### D-082 — BR-SUB-005: `replacesCertificationId` + índices Phase 4

- **Fecha:** 2026-08-08
- **Estado:** ACTIVA
- **Decidido por:** Owner (cierre Phase 4)
- **Contexto:** [D-033]/[BR-SUB-005] pedían sucesión tras `REJECTED`; el campo no estaba en Prisma. Índices multitenant listados en `INDEXING_STRATEGY` faltaban en listados pesados.
- **Decisión:**
  1. `SubcontractCertification.replacesCertificationId` (self-FK `SubcontractCertSuccession`); al crear, si se informa, el predecesor debe ser `REJECTED` del mismo subcontrato.
  2. UI: desde certificado rechazado → “Nueva versión” (`?replaces=`).
  3. Índices: `Receivable(tenantId, projectId, dueDate)`, `Payable(tenantId, supplierContactId, dueDate)`, `Certification(tenantId, projectId, periodStart)`, `StockMovement(tenantId, wbsNodeId)` y `(tenantId, projectId, wbsNodeId)`.
- **Documentos afectados:** [`PHASE_4_REPORTING.md`](../08-architecture/PHASE_4_REPORTING.md), [`SUBCONTRACTS.md`](../02-modules/SUBCONTRACTS.md), [`INDEXING_STRATEGY.md`](../08-architecture/INDEXING_STRATEGY.md).

---

### D-083 — Diferimientos de alcance Phase 4 (inventario valuado / reservas / reportes nice-to-have)

- **Fecha:** 2026-08-08
- **Estado:** ACTIVA
- **Decidido por:** Owner (anti-scope infinito cierre Phase 4)
- **Contexto:** Criterios de aceptación Phase 4 no requieren FIFO pleno ni reservas de stock ni todo el catálogo R-xxx.
- **Decisión (fuera del cierre Phase 4):**
  | Diferido | Motivo |
  |---|---|
  | Valuación stock FIFO / capas de costo ([D-007]) | Motor grande; `unitCost`/`totalCost` en movimiento alcanza piloto |
  | `StockReservation` ([D-034]) | Módulo completo; no bloquea OC→stock→consumo actual |
  | R-010 / R-011 | Nice-to-have del catálogo; no criterio de aceptación Phase 4 |
  | R-014 “valorizado” pleno | Depende de D-007 |
  R-014 qty-only y R-020 quedan como entregados / parcial documentado.
- **Documentos afectados:** [`PHASE_4_REPORTING.md`](../08-architecture/PHASE_4_REPORTING.md), [`REPORT_CATALOG.md`](../06-reports/REPORT_CATALOG.md), [`INVENTORY.md`](../02-modules/INVENTORY.md).

---

### D-084 — Letra de factura A/B/C/E + condición frente al IVA (sin motor AFIP)

- **Fecha:** 2026-08-10
- **Estado:** ACTIVA
- **Decidido por:** Owner
- **Contexto:** El dominio ya citaba `SalesInvoice.type` A/B/C/E y condición IVA en Directorio, pero no estaban persistidos. Se necesita tipificar comprobantes argentinos sin construir motor fiscal ni emisión ARCA ([D-011], [D-051]).
- **Decisión:**
  1. Persistir `ivaCondition` en `Company` (emisor) y `Contact` (cliente/proveedor): `RESPONSIBLE_INSCRIPTO` | `MONOTAX` | `EXEMPT` | `FINAL_CONSUMER` | `NOT_CATEGORIZED` | `FOREIGN`.
  2. Persistir `invoiceLetter` (`A`|`B`|`C`|`E`) en `SalesInvoice` y `SupplierInvoice` (implementación de compra).
  3. Si la operación es AR (`Company.country = AR` o contraparte `country = AR`), la letra es **requerida al emitir**; en `DRAFT` puede faltar. Históricos existentes quedan con `null`.
  4. El sistema **sugiere** la letra con matriz emisor×receptor (editable). No bloquea overrides. No hay integración AFIP/CAE.
  5. El cálculo de montos sigue siendo `taxRate` por línea + `roundMoney` ([D-011]/[D-053]); la letra solo guía UX (defaults/warnings).
  6. Fuera de alcance: Factura M/T, FCE MiPyME, numeración por PV, tabla `DocumentType` / `TaxLine` normalizada (P-ERD-05).
- **Implicancias:** UI de contacto, configuración de empresa, formularios AR/AP y validación en `issue*`. Helper puro `suggestInvoiceLetter` en `@bloqer/domain`.
- **Documentos afectados:** [`CORE_ENTITIES.md`](../01-domain/CORE_ENTITIES.md), [`MASTER_DATA.md`](../01-domain/MASTER_DATA.md), [`DIRECTORY.md`](../02-modules/DIRECTORY.md), [`SALES_AND_COLLECTIONS.md`](../02-modules/SALES_AND_COLLECTIONS.md), [`EXPENSES_AND_PAYMENTS.md`](../02-modules/EXPENSES_AND_PAYMENTS.md), [`TAXES_AND_WITHHOLDINGS.md`](../03-finance/TAXES_AND_WITHHOLDINGS.md).

---

### D-085 — Alícuotas IVA operativas + asiento con IVA discriminado (sin TaxLine / AFIP)

- **Fecha:** 2026-08-10
- **Estado:** ACTIVA
- **Decidido por:** Owner (pedido de cerrar gaps post [D-084])
- **Contexto:** Tras [D-084], el asiento automático de facturas usaba solo `totalAmount` (2 líneas) y la UI no ofrecía presets 10,5%/27%. CoA ya tenía `1.1.20` IVA Crédito y `2.1.10` IVA Débito sin uso.
- **Decisión:**
  1. Presets de alícuota en dominio: `0`, `10.5`, `21`, `27` (UX + hints de obra vivienda). Sigue siendo carga manual por línea ([D-011]); **no** hay motor que elija 10,5% automáticamente.
  2. Al emitir / sugerir asiento de `SalesInvoice` / `SupplierInvoice` con `taxAmount > 0` y cuentas IVA activas: asiento **3 líneas** (neto + IVA + CxC/CxP). Si no hay cuenta IVA o tax=0 → fallback 2 líneas con total.
  3. Consistencia letra↔IVA: **bloqueo** al emitir si letra C/E con `taxAmount > 0`; **warnings** UX si A/B con IVA 0 (certificación puede quedar en 0% a conciencia).
  4. Fuera de alcance: tablas `TaxType`/`TaxLine` (P-ERD-05), libro IVA / posición fiscal AFIP. (Precio IVA incluido → [D-086].)
- **Implicancias:** `ensureDraftJournalFrom*Invoice`, `suggestJournalFrom*Invoice`, formularios de alícuota, guards de emisión.
- **Documentos afectados:** [`TAXES_AND_WITHHOLDINGS.md`](../03-finance/TAXES_AND_WITHHOLDINGS.md), [`ACCOUNTING_LEDGER_ARCHITECTURE.md`](../08-architecture/ACCOUNTING_LEDGER_ARCHITECTURE.md), [`MASTER_DATA.md`](../01-domain/MASTER_DATA.md).

---

### D-086 — Factura B: precio unitario con IVA incluido (sin tablas nuevas)

- **Fecha:** 2026-08-10
- **Estado:** ACTIVA
- **Decidido por:** Owner (recomendación aceptada post [D-085])
- **Contexto:** En la práctica argentina, Factura B se carga con **precio final** (IVA incluido). Con [D-084]/[D-085] el `unitPrice` persistido era siempre neto y la alícuota se sumaba, lo que duplicaba IVA si el operador pegaba el total del ticket.
- **Decisión:**
  1. Flag de entrada `pricesIncludeTax` (opcional, default `false`) en create/update/register de facturas AR/AP. **No** se persiste en DB.
  2. Si `true`: `lineTotal = round(qty × unitPriceGross)`; neto = `round(total / (1 + rate/100))`; IVA = `total − neto`; se persiste `unitPrice` **neto** + componentes de línea ([D-053]).
  3. UX: checkbox “El precio unitario incluye IVA”; default **on** al sugerir/elegir letra B en altas; en edición DRAFT default **off** (precios ya netos) con hint.
  4. Certificación / OC: sin cambio de default (suelen traer neto o 0% a conciencia); el operador puede activar el flag si reingresa precios brutos.
  5. Fuera de alcance: persistir el flag, TaxLine, AFIP.
- **Implicancias:** `@bloqer/utils` `calcLineAmountsFromGrossInclusive`; `resolveInvoiceLineMoney` en services; formularios AR/AP y registro de transacciones.
- **Documentos afectados:** [`TAX_FORMULAS.md`](../04-formulas/TAX_FORMULAS.md), [`TAXES_AND_WITHHOLDINGS.md`](../03-finance/TAXES_AND_WITHHOLDINGS.md).

---

### D-087 — Pendientes empresa + obra; notificaciones solo campana

- **Fecha:** 2026-08-19
- **Estado:** ACTIVA
- **Decidido por:** Owner
- **Contexto:** `/pendientes` era solo de empresa; el empty state “Volver a mi obra” usaba la cookie de última obra (ambiguo con N proyectos). Poner la bandeja solo en el proyecto obligaría a un aprobador (p. ej. OWNER con OC en varias obras) a entrar a cada una. Las notificaciones son personales (`recipientUserId`) y [D-054] ya definió la campana como acceso principal.
- **Decisión:**
  1. **Bandeja personal de empresa** `/pendientes` se mantiene (General + bottom nav Field). Misma proyección `getMyFieldPendingItems`; fuentes filtradas por rol/módulo. El admin no tiene que entrar a una obra para ver lo suyo.
  2. **Bandeja de obra** `/proyectos/[id]/pendientes` en el sidebar del proyecto (sección Resumen, junto a Resumen). Mismo service con `projectId` fijo; sin chips “Todas las obras”.
  3. **Empty state:** una sola obra o filtro/lock de proyecto → “Volver a {código}”; N obras + cookie → “Ir a {código}”; N obras sin cookie → “Ver proyectos”. Nunca “mi obra” si hay más de una.
  4. **Notificaciones:** sin ítem en el sidebar de empresa ni de obra. Acceso: campana del header → “Ver todas” → `/notificaciones` (bandeja **del usuario**, no de la empresa). En mobile, enlace en **Más** (General).
- **Implicancias:** patrón Procore (My Open Items company + project). `VIEW NOTIFICATIONS` sigue sin gatear la bandeja personal.
- **Documentos afectados:** [`NOTIFICATIONS.md`](../02-modules/NOTIFICATIONS.md), [`NOTIFICATIONS_ARCHITECTURE.md`](../08-architecture/NOTIFICATIONS_ARCHITECTURE.md), [`PERMISSIONS_ROUTE_MATRIX.md`](../08-architecture/PERMISSIONS_ROUTE_MATRIX.md), [`PERMISSIONS_MATRIX.md`](./PERMISSIONS_MATRIX.md), [`AUDITORIA_MOBILE_BLOQER_V2.md`](../AUDITORIA_MOBILE_BLOQER_V2.md), [`OPERATIONAL_SMOKE_CHECKLIST_BY_ROLE.md`](../08-architecture/OPERATIONAL_SMOKE_CHECKLIST_BY_ROLE.md), [`PLAN_MEJORAS_CORTO_PLAZO_BLOQER_V2.md`](../PLAN_MEJORAS_CORTO_PLAZO_BLOQER_V2.md).

---

### D-088 — Edición excepcional de presupuesto `APPROVED` (kill-switch tenant + flag por obra)

- **Fecha:** 2026-08-24
- **Estado:** ACTIVA
- **Decidido por:** Owner
- **Contexto:** Clientes necesitan operar (gastos, OC, certificaciones) contra un presupuesto ya `APPROVED` mientras los costos/APU de ítems se definen semanas o meses después. [D-005] / [BR-BUD-006] congelan la economía en `APPROVED`; [BR-CERT-001] exige `APPROVED`/`CLOSED` para certificar; [BR-BUD-005] exige APU para aprobar. Sin excepción controlada, el producto empuja a aprobar “de mentira” o a no operar.
- **Decisión:**
  1. **Default OFF.** Por defecto un `Budget` en `APPROVED` **no** admite mutación de partidas ni económica (igual que [D-005]).
  2. **Dos capas (AND):** (a) `Tenant.allowApprovedBudgetEconomicEdits` (kill-switch, default `false`); (b) `Project.allowApprovedBudgetEconomicEdits` (por obra, default `false`). Solo si **ambos** están ON se permite **edición completa** del presupuesto `APPROVED` de esa obra: agregar / quitar / reordenar partidas WBS, cantidades, PU, APU, `BudgetSettings` y márgenes. **También** si el presupuesto es la base del cronograma (el lock de estructura EDT no aplica mientras el override esté ON). Default de ambos flags: `false`.
  3. **`CLOSED` no entra.** El cómputo contractual cerrado sigue solo vía Adenda + budget hijo ([BR-BUD-002], [D-005]). El toggle no desbloquea `CLOSED`.
  4. **Quién enciende/apaga flags:** solo `OWNER` / `ADMIN` (política peligrosa; alineado a [PERM-007] / cierre de período). **Quién edita** con el desbloqueo activo: quien tenga `EDIT BUDGETS` (p. ej. PM). El PM **nunca** enciende el flag.
  5. **Auditoría:** cada mutación económica bajo override queda en `AuditLog` con marca `approvedEditOverride: true`. Cambios de flags: eventos `tenant.approved_budget_edits_policy.changed` y `project.approved_budget_edits.changed`.
  6. **Snapshots al aprobar:** al pasar a `APPROVED` se congelan `approvedSnapshotTotalCost` / `approvedSnapshotTotalSalePrice` en el `Budget` (totales al momento de aprobación); los totales vivos pueden divergir mientras el override esté activo.
  7. **Integridad:** no borrar nodos WBS con vínculos operativos (cert/OC/PR/factura/stock/JL/subcontrato/cronograma); no bajar `CostItem.quantity` por debajo de qty certificada acumulada (`ISSUED`/`APPROVED`). Certificaciones emitidas ya snapshottean PU/qty; no se reescriben.
  8. **Flujo operativo esperado:** aprobar con APU provisorio → operar → completar costos → apagar flag de la obra (y opcionalmente pasar a `CLOSED`). Apagar el kill-switch de tenant congela todas las obras sin borrar flags por proyecto.
- **Implicancias:** enmienda la lectura estricta de [D-005] punto 1 / [BR-BUD-006] solo bajo ambos flags; no relaja [BR-BUD-005] ni [BR-BUD-002].
- **Documentos afectados:** [`BUSINESS_RULES.md`](../01-domain/BUSINESS_RULES.md) ([BR-BUD-006]), [`STATE_MACHINES.md`](../01-domain/STATE_MACHINES.md) § Budget, [`BUDGETS.md`](../02-modules/BUDGETS.md), [`PERMISSIONS_MATRIX.md`](./PERMISSIONS_MATRIX.md), [`EVENTS_AND_AUTOMATIONS.md`](../01-domain/EVENTS_AND_AUTOMATIONS.md), [D-005] (complementario).

---

### D-089 — Payee de gasto AP: proveedor o empleado; subcontrato ≠ OC

- **Fecha:** 2026-08-25
- **Estado:** ACTIVA
- **Decidido por:** Owner
- **Contexto:** el alta de gasto corporativo/obra reutiliza `SupplierInvoice` y solo listaba rol `SUPPLIER`. Un contacto `EMPLOYEE` no podía ser payee: sueldos (como costo) y reintegros no quedaban mapeados al directorio. Forzar rol Proveedor al empleado funciona (patrón QuickBooks 1099) pero ensucia el listado de OC. En paralelo, a nivel obra no todo pasa por OC: hay compras, subcontratos y gastos directos. Bloqer no liquida nómina ([PRODUCT_SCOPE](./PRODUCT_SCOPE.md) §6).
- **Decisión:**
  1. **`SupplierInvoice.supplierContactId` es el payee** (a quién se le paga). El campo conserva el nombre histórico; la semántica es contraparte AP, no “solo proveedor de materiales”.
  2. **Tres caminos de egreso, no uno:**
     - **OC / cotización / factura ligada a OC:** Contact con rol `SUPPLIER` ([BR-SUP-001]). Compra de insumos/servicios de suministro.
     - **Subcontrato:** Contact con rol `SUBCONTRACTOR`. Flujo propio: `Subcontract` → certificación `APPROVED` → factura AP borrador → emitir → CxP → pago ([D-015], [BR-SUB-003]). **No** se paga un paquete de obra con OC ni eligiendo al subcontratista en el gasto genérico.
     - **Gasto directo (sin OC):** Contact con rol `SUPPLIER` **o** `EMPLOYEE`. Cubre alquiler, servicios, sueldo como costo, reintegro, factura chica de obra bajo umbral ([D-006]). Empresa = `projectId` null; obra = factura de proyecto con WBS ([D-055]).
  3. **No** exigir rol `SUPPLIER` a un empleado solo para pagarle. Un empleado en blanco / reintegro lleva `EMPLOYEE`. Un monotributista que emite factura lleva `SUPPLIER` (y `EMPLOYEE` si además es personal interno). Quien vende materiales y ejecuta paquetes: `SUPPLIER` + `SUBCONTRACTOR`.
  4. **No** introducir entidad `Expense` ni nómina ([D-035] se mantiene). El reporte de gastos/sueldos por empleado se arma después agrupando AP cuyo payee tiene rol `EMPLOYEE`; no incluye aportes ni recibos.
- **Implicaciones:** picker y `assertApInvoicePayee` en gasto/factura sin OC; OC y quotes sin cambio; factura auto de certificación de subcontrato sigue usando el contacto subcontratista (sin exigir `SUPPLIER`).
- **Documentos afectados:** [`OPEN_QUESTIONS.md`](./OPEN_QUESTIONS.md) (Q-058), [`DIRECTORY.md`](../02-modules/DIRECTORY.md), [`EXPENSES_AND_PAYMENTS.md`](../02-modules/EXPENSES_AND_PAYMENTS.md), [`SUBCONTRACTS.md`](../02-modules/SUBCONTRACTS.md), [`SUPPLIERS.md`](../02-modules/SUPPLIERS.md), [`BUSINESS_RULES.md`](../01-domain/BUSINESS_RULES.md) (BR-AP-001), [`GUIA_OPERATIVA_BLOQER_V2.md`](../GUIA_OPERATIVA_BLOQER_V2.md).

---

### D-090 — Centro de ayuda in-app (FAQ / wiki de procesos)

- **Fecha:** 2026-08-25
- **Estado:** ACTIVA
- **Decidido por:** Owner
- **Contexto:** Los operadores preguntan procedimientos básicos (“¿cómo se carga un proveedor?”) aunque ya estén en la guía operativa. La guía es un manual lineal; hace falta un buscador in-app por **objetivo** (no un dump del PDF) y un vínculo de mantenimiento obligatorio para agentes.
- **Decisión:**
  1. **Centro de ayuda** en `/ayuda` (listado + buscador) y `/ayuda/[slug]` (ficha). Catálogo **estático en código** (`apps/web/features/help/`), sin CMS ni edición por tenant. Copy en español (Argentina); slugs/campos técnicos en inglés.
  2. **Acceso:** cualquier usuario con membresía activa (mismo patrón que `/notificaciones`: autenticado, **sin** `can()` extra). Los deep links a pantallas destino **siguen** RBAC.
  3. **Navegación:** pie fijo **Ayuda** en sidebar de empresa y de obra; ícono `?` en el header; en mobile, enlace en **Más**. **No** va bajo Configuración (gateada a OWNER/ADMIN).
  4. **Fuente de verdad:** la guía operativa describe *qué hace el sistema hoy*; las fichas son **recetas cortas** (dónde, quién, pasos con labels de UI, efectos, errores frecuentes). Si hay duda, gana el código + la guía.
  5. **Mantenimiento:** todo PR que cambie rutas, menús, etiquetas o flujos operativos/financieros visibles **debe** actualizar `GUIA_OPERATIVA_BLOQER_V2.md` **y** el catálogo de ayuda en el mismo PR ([AGENT_GUARDRAILS](../08-architecture/AGENT_GUARDRAILS.md), skill `operational-help-docs`).
  6. **Fuera de alcance (v1):** command palette `Ctrl+K`, chatbot, contextual help en todos los empty states (solo Directorio y hubs AP de dolor alto).
- **Implicancias:** matriz de rutas; docs de agentes/skills; empty states accionables con link a fichas.
- **Documentos afectados:** [`GUIA_OPERATIVA_BLOQER_V2.md`](../GUIA_OPERATIVA_BLOQER_V2.md), [`PERMISSIONS_ROUTE_MATRIX.md`](../08-architecture/PERMISSIONS_ROUTE_MATRIX.md), [`HELP_CENTER.md`](../08-architecture/HELP_CENTER.md), [`AGENT_GUARDRAILS.md`](../08-architecture/AGENT_GUARDRAILS.md), [`AGENTS.md`](../AGENTS.md), [`README.md`](../README.md).

---

### D-091 — Equipo de obra (roster) + notificaciones de libro de obra

- **Fecha:** 2026-08-26
- **Estado:** ACTIVA
- **Decidido por:** Owner
- **Contexto:** Nadie recibía aviso de un parte pendiente de aprobación; solo “devolver” creaba in-app sin email. No hay `ProjectMembership` / R-USR-007; fan-out tenant-wide a todos los PM sería ruido. Hace falta un roster por obra para campana/mail sin fingir RBAC “solo su proyecto”.
- **Decisión:**
  1. Tabla **`ProjectTeamMember`** (`tenantId`, `projectId`, `userId`, `kind` etiqueta `PROJECT_MANAGER` \| `SITE_FOREMAN` \| `OTHER`). **No** se llama `ProjectMembership` y **no** cambia `can()` ni listados / `/pendientes`.
  2. UI: card **Equipo de obra** al final de **Configuración** del proyecto (`/proyectos/[id]/editar`); editable con `EDIT PROJECTS`. En el **Resumen**, aviso si no hay PM activo en el roster (con enlace a Configuración si el actor puede editar). Picker de membresías ACTIVE del tenant (no reusar Configuración → Equipo).
  3. Auto-alta al crear obra si el actor es `PROJECT_MANAGER` o `SITE_FOREMAN`. OWNER/ADMIN no se auto-agregan (ya reciben CC [D-054]). Obras existentes: roster vacío → avisos SUBMITTED solo a OWNER/ADMIN.
  4. **Notificaciones libro de obra (in-app + email automático, best-effort):**
     - `JOBSITE_LOG_SUBMITTED` → OWNER/ADMIN ∪ miembros del roster que `canSuperviseJobsiteLog`, menos el actor.
     - `JOBSITE_LOG_RETURNED` → `createdBy` ∪ OWNER/ADMIN, menos el actor (+ email; antes solo in-app).
     - `JOBSITE_LOG_APPROVED` → `createdBy` ∪ OWNER/ADMIN, menos el actor.
  5. Fuera de alcance: filtrar `/pendientes` o `listProjects` por roster; roles distintos por obra (R-USR-007); SLA de partes viejos; mute / Web Push.
- **Implicancias:** migración Prisma; `jobsite-log-notifications.service`; guía §8.1 / ayuda; Q-032 puede reutilizar el roster más adelante.
- **Documentos afectados:** [`NOTIFICATIONS.md`](../02-modules/NOTIFICATIONS.md), [`NOTIFICATIONS_ARCHITECTURE.md`](../08-architecture/NOTIFICATIONS_ARCHITECTURE.md), [`EVENTS_AND_AUTOMATIONS.md`](../01-domain/EVENTS_AND_AUTOMATIONS.md), [`PROJECTS.md`](../02-modules/PROJECTS.md), [`JOBSITE_LOG.md`](../02-modules/JOBSITE_LOG.md), [`TECHNICAL_ERD.md`](../08-architecture/TECHNICAL_ERD.md), [`PENDING_ARCHITECTURE_ITEMS.md`](../08-architecture/PENDING_ARCHITECTURE_ITEMS.md), [`GUIA_OPERATIVA_BLOQER_V2.md`](../GUIA_OPERATIVA_BLOQER_V2.md).

---

### D-092 — Anclaje automático a la única empresa del tenant (hasta selector)

- **Fecha:** 2026-08-26
- **Estado:** ACTIVA
- **Decidido por:** Owner
- **Contexto:** `Project.companyId` y `UserMembership.companyId` son nullable. Sin selector de empresa, invitaciones y altas de obra copiaban `ctx.companyId` (a menudo null en membresías globales) y compras/facturas fallaban con “El proyecto no tiene empresa asignada”. En operación actual cada tenant es **una** razón social.
- **Decisión:** hasta que exista selector de empresa (Q-001 / variante 0B), si el tenant tiene **exactamente una** `Company` ACTIVE:
  1. La sesión (`getSessionTenantContext`) usa esa empresa cuando la membresía no tiene `companyId`.
  2. Invitaciones, altas de membresía y **crear proyecto** anclan a esa empresa si no viene una explícita.
  3. Si hay **0 o 2+** empresas ACTIVE, no se elige en silencio: queda null (haría falta selector).
- **Implicancias:** no cambia el schema ni permite pertenencia simultánea a dos sociedades ([D-036]). Finanzas multi-empresa siguen pendientes del selector. No adivinar “la primera por nombre”.
- **Documentos afectados:** [`OPEN_QUESTIONS.md`](./OPEN_QUESTIONS.md) (Q-001), [`MULTITENANCY_ARCHITECTURE.md`](../08-architecture/MULTITENANCY_ARCHITECTURE.md), [`TENANT_COMPANY_SCOPING.md`](../08-architecture/TENANT_COMPANY_SCOPING.md), [`ARCHITECTURE_DECISION_RECORDS.md`](../08-architecture/ARCHITECTURE_DECISION_RECORDS.md) (ADR-Phase1-06), [`GUIA_OPERATIVA_BLOQER_V2.md`](../GUIA_OPERATIVA_BLOQER_V2.md).

---

### D-093 — Descuento comercial % en líneas de documento (antes de IVA)

- **Fecha:** 2026-08-26
- **Estado:** ACTIVA
- **Decidido por:** Owner
- **Contexto:** Hace falta un descuento porcentual comercial en facturas de gasto, facturas de venta, OC y cotizaciones, alineado a Odoo/Xero/AFIP (descuento sobre neto, IVA sobre el restante). No copiar Procore (sin descuento en línea de OC) ni QuickBooks (solo cabecera).
- **Decisión:**
  1. Persistir **`discountPct`** `DECIMAL(8,4) NOT NULL DEFAULT 0` en `PurchaseOrderLine`, `ProcurementQuoteLine`, `SupplierInvoiceLine` y `SalesInvoiceLine`. No persistir monto de descuento (se deriva).
  2. Kernel exclusivo ([D-053]): `grossSubtotal = round(qty × unitPriceNet)` → `discountAmount = round(grossSubtotal × pct / 100)` → `lineSubtotal = round(grossSubtotal − discountAmount)` → IVA sobre `lineSubtotal`. Rango 0–100 inclusive; 100% permitido en `DRAFT`.
  3. **Cabecera «Descuento general %»** es solo UX: al pulsar **Aplicar a todas** copia el mismo % a cada línea. No hay descuento de cabecera en pesos ni prorrateo por monto.
  4. Factura B ([D-086]): extraer list net del bruto **primero**, aplicar el % sobre ese neto; persistir `unitPrice` como list net (no neto descontado) para no doble-descontar al regrabar.
  5. Copiar `discountPct` en hops cotización → OC y OC → factura. `forceZeroTax` (letra C/E) recalcula con el %. Matching 3-way sigue por cantidad.
  6. Varianza vs APU, techo de cotización y «consumir saldo de partida» usan **precio unitario efectivo** (neto descontado), no el de lista.
  7. Emitir / confirmar exige `totalAmount > 0` (una línea al 100% es válida si el documento no queda en cero).
  8. **Fuera de alcance v1:** descuento en pesos de cabecera, tesorería solo-caja, recepciones, subcontratos/certificaciones.
  9. El umbral SC vs OC directa **no** cambia: sigue en `CompanyProcurementSettings` **por empresa/tenant** (no hay monto hardcodeado).
- **Implicancias:** kernel `@bloqer/utils` (`calcExclusiveLineAmounts` / `resolveDocumentLineAmounts`); migración Prisma; UI **Desc. %** + **Descuento general %**.
- **Documentos afectados:** [`MONEY_MODEL.md`](../03-finance/MONEY_MODEL.md), [`TAX_FORMULAS.md`](../04-formulas/TAX_FORMULAS.md), [`COST_FORMULAS.md`](../04-formulas/COST_FORMULAS.md), [`TAXES_AND_WITHHOLDINGS.md`](../03-finance/TAXES_AND_WITHHOLDINGS.md), [`GUIA_OPERATIVA_BLOQER_V2.md`](../GUIA_OPERATIVA_BLOQER_V2.md).

---

### D-094 — Pendientes: follow-through de compras (cotizar / confirmar / recibir)

- **Fecha:** 2026-08-27
- **Estado:** ACTIVA
- **Decidido por:** Owner
- **Contexto:** [D-087] definió Pendientes como bandeja personal de cosas que el actor puede cerrar (aprobar/revisar). En operación de obra, después de aprobar una OC (o enviar una SC) el trabajo sigue: cotizar, confirmar al proveedor y registrar recepción. Eso vivía solo en listados/tablero; el globo no avisaba a Compras ni a Depósito. CxP ya tiene campana **Listo para pagar** ([D-069]) y no debe mezclarse en el globo.
- **Decisión:**
  1. **Pendientes amplía fuentes de compras** (misma proyección, sin tabla `Pending`):
     - `PURCHASE_REQUEST` — SC `SUBMITTED` (cotizar / elegir cotización) → quien `canManageProcurementQuotes`.
     - `PURCHASE_ORDER` — OC `SUBMITTED` (aprobar) → quien `canApprovePurchaseOrders` (sin cambio).
     - `PURCHASE_ORDER_CONFIRM` — OC `APPROVED` → quien `canEditPurchaseOrders`.
     - `PURCHASE_ORDER_RECEIPT` — OC `CONFIRMED` o `PARTIALLY_RECEIVED` → quien `canEditPurchaseReceipts` (incluye Depósito).
  2. **No entran:** SC `QUOTE_SELECTED`, OC `DRAFT`, factura / CxP / “Listo para pagar”.
  3. **Campana:** reutilizar tipos existentes. `PURCHASE_ORDER_APPROVED` fanea también a quien puede confirmar; `PURCHASE_ORDER_CONFIRMED` a quien puede recibir (copy: “Ya se puede registrar la recepción”). `PURCHASE_REQUEST_SUBMITTED` no se duplica.
  4. Complementa [D-087]: la bandeja sigue siendo personal y por permiso; deja de ser solo aprobaciones y pasa a **aprobaciones + follow-through de compras**.
- **Implicancias:** WAREHOUSE pasa a tener globo (recepciones). Un PM no ve OC a aprobar (igual que hoy) pero sí SC a cotizar, OC a confirmar y a recibir. OWNER ve más ítems en el globo.
- **Documentos afectados:** [`GUIA_OPERATIVA_BLOQER_V2.md`](../GUIA_OPERATIVA_BLOQER_V2.md), [`NOTIFICATIONS.md`](../02-modules/NOTIFICATIONS.md), [`NOTIFICATIONS_ARCHITECTURE.md`](../08-architecture/NOTIFICATIONS_ARCHITECTURE.md), help in-app (`revisar-pendientes`, SC/OC/recepción).

---

### D-095 — Committed y saldo de partida usan neto (sin IVA)

- **Fecha:** 2026-08-27
- **Estado:** ACTIVA
- **Decidido por:** Owner
- **Contexto:** El presupuesto/APU y el desvío unitario de OC ([D-093]) comparan precios **netos**. `committedCost` en control de costos y `availableSaldo` en saldo de partida acumulaban `lineTotal` (bruto con IVA), mezclando bases y sobrestimando el comprometido.
- **Decisión:**
  1. **Comprometido de OC** (`committedCost`, saldo de partida, alertas al enviar OC) usa **`lineSubtotal`** (neto, post-descuento, sin IVA).
  2. **Desvío unitario** sigue neto vs neto ([D-093]); no cambia.
  3. **IVA** se mantiene en líneas de OC/factura para pagos, asientos GL ([D-085]) y futuro Libro IVA ([Q-040]).
  4. **Subcontratos:** `SubcontractLine.lineTotal` = qty × PU (sin IVA discriminado); no cambia en este paso.
- **Implicancias:** Los reportes de comprometido pueden mostrar más saldo disponible que antes (corrección, no cambio de dinero real). UI de saldo de partida sigue siendo alerta soft ([BR-PUR-011]).
- **Documentos afectados:** [`BUSINESS_RULES.md`](../01-domain/BUSINESS_RULES.md) [BR-PUR-011], [`COST_FORMULAS.md`](../04-formulas/COST_FORMULAS.md), [`GUIA_OPERATIVA_BLOQER_V2.md`](../GUIA_OPERATIVA_BLOQER_V2.md).

---

### D-096 — Fecha requerida obligatoria en SC + buscador/estado en SC y OC

- **Fecha:** 2026-08-28
- **Estado:** ACTIVA
- **Decidido por:** Owner
- **Contexto:** Los listados de **Solicitudes de compra** y **Órdenes de compra** por proyecto sólo permitían filtrar por estado vía deep-link (`?status=`), sin buscador ni filtros visibles. En SC, la **fecha requerida** del material era opcional, dejando a cotizadores y compradores sin señal de urgencia para priorizar.
- **Decisión:**
  1. En `/proyectos/[id]/ordenes-compra` y `/proyectos/[id]/solicitudes-compra`: **buscador** (código, proveedor/solicitante, descripción, EDT) + **botones/toggle de estado** con contador por estado. El deep-link `?status=` sigue funcionando como estado inicial. Los filtros son locales; no persisten en la URL después de interactuar.
  2. En la creación de SC (`PurchaseRequestForm` / `NewPurchaseRequestDialog`): `neededByDate` pasa a **obligatorio** en formulario y en `createPurchaseRequestSchema`. Se mantiene opcional en `updatePurchaseRequestSchema` (retro-compat). SC históricas sin fecha no se retocan (no migración).
- **Implicancias:** el `createPurchaseRequestAction` rechaza payloads sin fecha (`400`). El campo Prisma sigue `DateTime?` para no romper histórico. Notificaciones y `Necesaria para` en listado siempre tienen dato desde ahora.
- **Documentos afectados:** [`BUSINESS_RULES.md`](../01-domain/BUSINESS_RULES.md) [BR-PUR-017], [`GUIA_OPERATIVA_BLOQER_V2.md`](../GUIA_OPERATIVA_BLOQER_V2.md) §9.1 · §9.2, `apps/web/features/help/lib/articles/planning-procurement.ts` (`solicitud-de-compra`, `orden-de-compra-y-afectar-edt`).

---

### D-097 — Alertas de vencimiento en compras (entrega, fecha requerida, factura)

- **Fecha:** 2026-08-28
- **Estado:** ACTIVA
- **Decidido por:** Owner
- **Contexto:** [D-094] llevó a Pendientes las tres etapas post-aprobación de compras (cotizar / confirmar / recibir). Con `neededByDate` obligatoria ([D-096]) y `expectedDeliveryDate` opcional en OC, seguía faltando señal cuando una entrega no llega, una SC vence sin OC o una OC recibida no tiene factura registrada (sin factura → sin CxP → nadie va a pagar). Referencias: Procore separa señal visual inline + tarjeta en dashboard + notificación diaria dirigida al rol que acciona; Fieldwire y Buildertrend hacen lo mismo con opt-out por empresa.
- **Decisión:**
  1. **Tres alertas nuevas** disparadas por el cron `operational-alerts` (mismo runner que ya existe, mismo dedup 7 días por tipo+entidad+recipient):
     - **`PURCHASE_ORDER_DELIVERY_OVERDUE`** — OC `CONFIRMED` o `PARTIALLY_RECEIVED` con `expectedDeliveryDate` vencida más allá del colchón por empresa. Audiencia: quien puede recepcionar (patrón `PO_RECEIPT_AUDIENCE` = `EDIT PROCUREMENT|PURCHASE_ORDERS|INVENTORY`) + CC OWNER/ADMIN. Deep-link al form de recepción. [BR-PUR-018].
     - **`PURCHASE_REQUEST_NEEDED_BY_OVERDUE`** — SC `SUBMITTED` o `QUOTE_SELECTED` con `neededByDate` vencida más allá del colchón y sin OC en `CONFIRMED/PARTIALLY_RECEIVED/RECEIVED`. Audiencia: aprobadores SC/OC (`APPROVE PURCHASE_REQUESTS|PURCHASE_ORDERS` + `EDIT PROCUREMENT`) + CC OWNER/ADMIN. [BR-PUR-019].
     - **`PURCHASE_ORDER_RECEIVED_WITHOUT_INVOICE`** — OC `PARTIALLY_RECEIVED` o `RECEIVED` con primera recepción `CONFIRMED` hace ≥ `receiptToInvoiceSlaDays` (default 5) y sin `SupplierInvoice` en `ISSUED`. Audiencia: `EDIT|APPROVE AP` + CC OWNER/ADMIN. Deep-link al detalle de OC (CTA existente "Registrar factura desde OC"). [BR-PUR-020].
  2. **Pendientes suma un source nuevo** `PURCHASE_ORDER_INVOICE` (grupo `compras`, CTA "Registrar factura"), gate por permiso `EDIT AP`. Los items de `PURCHASE_ORDER_RECEIPT` y `PURCHASE_REQUEST` traen `overdueDays: number` (0 = a término) para que la card muestre badge "Vencida N d" y los vencidos suban al tope.
  3. **Listados por proyecto** muestran badge inline `Vencida N d` junto a `Entrega prevista` (OC en `CONFIRMED/PARTIALLY_RECEIVED`) y `Necesaria para` (SC `SUBMITTED/QUOTE_SELECTED`).
  4. **Config por empresa** (`CompanyProcurementSettings`): `deliveryOverdueGraceDays` (default 0), `neededByOverdueGraceDays` (default 0), `receiptToInvoiceSlaDays` (default 5), y toggles `deliveryAlertsEnabled` / `neededByAlertsEnabled` / `receiptToInvoiceAlertsEnabled` (default `true`). El colchón sólo afecta la **emisión de la alerta**; la señal visual en Pendientes/listados es literal desde el día 1.
  5. **Canales**: campana in-app + email best-effort (patrón D-050 / BR-PUR-015). Sin nuevas tablas ni cambios en state machines.
- **Implicancias:** portal.bloqer.app necesita `prisma migrate deploy` en Neon branch `production` — sin la migración 20260828120000_d097 el runner rompe por columnas faltantes. Cron ya está autenticado con `CRON_SECRET`. No entra en `deliveryAlertsEnabled=false` que la señal visual sí se sigue mostrando (deliberado — el silencio es de campana, no del contexto operativo).
- **Documentos afectados:** [`BUSINESS_RULES.md`](../01-domain/BUSINESS_RULES.md) [BR-PUR-018] · [BR-PUR-019] · [BR-PUR-020], [`GUIA_OPERATIVA_BLOQER_V2.md`](../GUIA_OPERATIVA_BLOQER_V2.md) §9.1 · §9.2 · §11 alertas, [`02-modules/NOTIFICATIONS.md`](../02-modules/NOTIFICATIONS.md), `apps/web/features/help/lib/articles/planning-procurement.ts`.

---

### D-098 — Consolidación EDT/reportes de obra + hub de reportes empresa

- **Fecha:** 2026-08-28
- **Estado:** ACTIVA
- **Decidido por:** Owner
- **Contexto:** El hub de reportes de obra listaba **Presupuesto vs real** casi duplicado de **EDT y costos** (mismo `getProjectCostControl` + pie APU). El reporte **Compras y proveedores** calculaba `committedCost` con `lineTotal` (bruto), divergente de EDT/`lineSubtotal` ([D-095]). A nivel empresa no existía un hub consolidado multi-obra (solo pantallas operativas de finanzas/tesorería/inventario).
- **Decisión:**
  1. **Absorber** Presupuesto vs real y composición APU dentro de `/proyectos/[id]/control-costos`. Redirect permanente desde `/reportes/presupuesto-vs-real`.
  2. **Vista de columnas EDT** con presets (Financiero / Compacto / Cantidades / % Avance / Personalizado) persistidos en `localStorage` (`bloqer:edt:preset:{projectId}`). Columnas nuevas: cantidades (presup./compr./recib./consum.) y % (compra / físico / económico / exposición).
  3. **Alinear** `getProcurementDeviationReport` a `lineSubtotal` para comprometido (mismo criterio [D-095]). Renombrar card del hub obra a **Análisis de compras**.
  4. **Crear hub empresa** `/reportes` con 8 cards canónicos: Portafolio, Rentabilidad multi-obra, Aging CxC/CxP (links), Flujo caja (link), Inventario (link), GG por proyecto, Compras multi-obra. Ítem **Reportes** en menú General.
- **Implicancias:** Los números de comprometido en Análisis de compras pueden bajar (corrección neto). Bookmarks a presupuesto-vs-real siguen funcionando vía redirect. Preferencias de columnas EDT no sincronizan entre dispositivos (localStorage a propósito).
- **Documentos afectados:** [`REPORT_CATALOG.md`](../06-reports/REPORT_CATALOG.md), [`GUIA_OPERATIVA_BLOQER_V2.md`](../GUIA_OPERATIVA_BLOQER_V2.md) §1.2 · §1.4 · §13, [`COST_FORMULAS.md`](../04-formulas/COST_FORMULAS.md), `08-architecture/TENANT_REPORTS_HUB.md`, help `leer-edt-y-costos` / conceptos de reportes.

---

### D-099 — EDT partida × tipo de costo (`CostCategory`)

- **Fecha:** 2026-08-28
- **Estado:** ACTIVA
- **Decidido por:** Owner
- **Contexto:** EDT y costos imputaba SC/OC/facturas/subcontratos/consumos solo a `wbsNodeId`. El APU desglosa MAT/LAB/EQP/SUB/OTHER en presupuesto, pero el gasto real se aplastaba en un solo número por partida — no se podía responder “¿Replanteo se fue en materiales o en mano de obra?”. Materiales y subcontratos tenían tableros parciales; LAB/EQP solo vivían en el APU. Patrón industria (Procore cost code × cost type; Odoo analytic × categoría) no estaba formalizado.
- **Decisión:**
  1. **Matriz partida × `CostCategory`:** el eje de alcance sigue siendo la partida EDT ([D-057]); el eje de naturaleza es `CostCategory` (MATERIAL | LABOR | EQUIPMENT | SUBCONTRACT | OTHER). Las líneas APU **no** son cost codes ([D-068] hint se mantiene).
  2. **Persistir `costType`** en `PurchaseRequestLine`, `PurchaseOrderLine` y `SupplierInvoiceLine`. Resolución (ver `resolveLineCostType`): (a) tipo explícito del usuario; (b) categoría del insumo APU si eligió uno; (c) **categoría dominante del APU de la partida** cuando solo eligió la partida — ≥ 60% del costo directo o categoría única (`computeDominantCostTypeFromApuLines`, `loadWbsDominantCostTypes`); (d) fallback MATERIAL. Consumo stock siempre MATERIAL; subcontrato/cert siempre SUBCONTRACT.
  3. **UI OC / factura:** el select "Tipo de costo" pre-selecciona el dominante al elegir la partida (baño químico → EQP, excavación con retro → EQP). Si el usuario cambia el tipo a mano, el cambio de partida ya **no** lo pisa (`manualCostTypeKeys`).
  4. **EDT UI:** vista General (totales por partida, sin cambio de default). Expand opcional en hojas → filas hijas de solo lectura por categoría; ocultar categorías vacías. **Filtro por tipo de costo** en la barra: reemplaza las columnas $ por el bucket, oculta qty/recepción/avance libro (son atributos de partida), recalcula KPIs / totales y propaga `?costType=` al CSV / PDF (`sliceCostControlReportByCostType`). **Gráfico `CostTypeComparisonChart`** (barras horizontales Presup/Devengado/Exposición por categoría) junto a la torta APU planificada; reemplaza la torta de composición real que era redundante con las barras.
  5. **LAB / EQP v1:** tipar OC/factura (liquidaciones / alquileres / cuadrillas externas / empleado como AP). LAB en factura AP cubre **proveedor**, empleado ([D-089]) y jornal — no requiere subcontrato. SUB queda solo con módulo Subcontratos + certificación. Sin timesheets ni equipment logs (no-paridad intencional con Procore).
  6. **Análisis de compras (R-009):** deja de listar "Material presupuestado vs ejecución" (eje partida); ese eje vive solo en EDT y costos. R-009 se enfoca en **proveedor + varianza OC vs baseline APU** ([D-044]) + sin imputación EDT.
  7. **Forecast to Complete / EAC:** fuera de alcance v1; se sigue usando exposición esperada ([D-065]) + desglose por tipo. Follow-up en OPEN_QUESTIONS.
- **Implicancias:** Datos legacy backfill a MATERIAL (o categoría APU si hay hint). Tipar no cambia [BR-COS-002]; solo parte el mismo total. Libro de obra no genera $ por tipo.
- **Documentos afectados:** [`COST_FORMULAS.md`](../04-formulas/COST_FORMULAS.md), [`GUIA_OPERATIVA_BLOQER_V2.md`](../GUIA_OPERATIVA_BLOQER_V2.md) §13, [`REPORT_CATALOG.md`](../06-reports/REPORT_CATALOG.md), [`OPEN_QUESTIONS.md`](./OPEN_QUESTIONS.md), help `leer-edt-y-costos` / compras.

---

### D-100 — Parte diario de libro de obra programado (multi-obra) + fotos en PDF

- **Fecha:** 2026-08-29
- **Estado:** ACTIVA
- **Decidido por:** Owner
- **Contexto:** El export PDF del parte solo listaba nombres de adjuntos. No había envío programado del libro de obra. Un schedule tiene un solo `projectId`; hace falta multi-obra sin inventar tablas.
- **Decisión:**
  1. Key empresa `TENANT_JOBSITE_DAILY_LOGS` (**Libro de obra — parte del día**), formato **solo PDF**, módulos `PROJECTS` + `JOBSITE_LOG`.
  2. Multi-selección de hasta **20 obras ACTIVE** en `params.jobsiteProjectIds` (CSV de UUIDs).
  3. Día = fecha calendario de la corrida en timezone del envío. Partes `SUBMITTED` \| `APPROVED` (no DRAFT/CANCELLED). Un PDF por parte; sin partes → corrida `SKIPPED` (sin mail).
  4. Embeber jpeg/png/webp (máx. 12, ≤ 2.5 MB, R2) en el PDF del parte — mismo pipeline que Exportar en el detalle. HEIC/PDF quedan listados, no embebidos.
- **Implicancias:** El cron puede generar N adjuntos por key. Destinatarios externos / ZIP / HEIC conversion fuera de alcance.
- **Documentos afectados:** [`REPORT_CATALOG.md`](../06-reports/REPORT_CATALOG.md) R-015, [`SCHEDULED_REPORTS_ARCHITECTURE.md`](../08-architecture/SCHEDULED_REPORTS_ARCHITECTURE.md), [`GUIA_OPERATIVA_BLOQER_V2.md`](../GUIA_OPERATIVA_BLOQER_V2.md) §8.1 · §13.2, help export / programar envíos / parte.

---

### D-101 — Notas generales del parte: viñetas, numeración y negrita

- **Fecha:** 2026-08-29
- **Estado:** ACTIVA
- **Decidido por:** Owner
- **Contexto:** El relato del día (tareas hechas, pendientes, problemas) era un textarea plano. Hacía falta listar sin meter un editor tipo documento.
- **Decisión:**
  1. Solo en **Notas generales** del libro de obra (`JobsiteLog.generalNotes`).
  2. Barra mínima: **negrita**, **viñetas**, **numeración**. Sin fuentes, color, alineación ni adjuntos en el editor.
  3. Persistencia: HTML restringido (`p`, `br`, `strong`, `ul`, `ol`, `li`). Texto plano legado sigue válido. El detalle y el PDF renderizan listas; no se inyecta HTML sin parsear.
- **Implicancias:** Notas de filas (avance, cuadrilla, materiales, incidencias) y otros módulos siguen en texto plano. Reutilizar el editor en otro campo requiere decisión aparte.
- **Documentos afectados:** [`JOBSITE_LOG.md`](../02-modules/JOBSITE_LOG.md), [`GUIA_OPERATIVA_BLOQER_V2.md`](../GUIA_OPERATIVA_BLOQER_V2.md) §8.1, help `cargar-libro-de-obra`.

---

### D-102 — Clase financiera derivada (sin enums persistidos) + job cost explícito en alta AP

- **Fecha:** 2026-08-29
- **Estado:** ACTIVA
- **Decidido por:** Owner
- **Contexto:** El usuario pedía tipos gasto/compra/ingreso/venta y factura/recibo/NC/ND. Comparado con Procore/Sage/CMiC, el eje de obra es compromiso vs directo y obra vs G&A, no un catálogo de “tipos de transacción”. No se inventan columnas que dupliquen FKs.
- **Decisión:**
  1. **Clase** = etiqueta **derivada** (solo lectura) desde hechos existentes: `projectId`, `certificationId`, `purchaseOrderId` / línea OC, `subcontractCertificationId`, `AccountMovement.type` + `sourceType`. Helper puro en `@bloqer/domain` (`classifySalesInvoice` / `classifySupplierInvoice` / `classifyAccountMovement`). Códigos EN + labels es-AR. UI: badge **Clase** (nunca “Tipo de documento” — reservado a NC/ND futuras).
  2. **No** persistir `EconomicNature` ni `DocumentKind`. **No** tabla `DocumentType` / `MovementCategory`. Letra A/B/C/E sigue en `invoiceLetter` ([D-084]). Recibo = `Collection` / `Payment`. Anticipo cae en `SALE_PROJECT` (sin flag nuevo).
  3. Precedencia AP: `SUBCONTRACT` > `PURCHASE_COMMITTED` > `DIRECT_PROJECT` | `OVERHEAD`.
  4. Fase 1 UX: en alta/edición de factura de proveedor **de obra**, segmented **Contra orden de compra** | **Costo directo** (explícito; el backend ya distinguía vía [D-065]/[D-066]). Corporativo / Transacciones AP = Gasto general sin WBS.
  5. Fuera de alcance: NC/ND operativas, fondo de reparo ([Q-023]), split J/G por línea, ledger JC como posting.
- **Implicancias:** Listados/detalle/exports/filtros `?class=` muestran la clase. Indari se “cataloga” al listar (cero backfill SQL).
- **Documentos afectados:** [`ENTITY_RELATIONSHIPS.md`](../01-domain/ENTITY_RELATIONSHIPS.md), [`MASTER_DATA.md`](../01-domain/MASTER_DATA.md), [`ACCOUNTS_PAYABLE.md`](../03-finance/ACCOUNTS_PAYABLE.md), [`SALES_AND_COLLECTIONS.md`](../02-modules/SALES_AND_COLLECTIONS.md), [`GUIA_OPERATIVA_BLOQER_V2.md`](../GUIA_OPERATIVA_BLOQER_V2.md) §12, help `clase-de-documento-financiero` + fichas de gasto/ingreso.

---

## Decisiones SUPERSEDED

_(ninguna por ahora)_

---

## Cómo agregar una decisión nueva

1. Tomar el siguiente ID disponible (`D-103`…).
2. Completar el formato del header.
3. Listar **todos** los documentos afectados.
4. Enlazar la decisión desde los documentos afectados con un comentario `> Ver [D-NNN]`.
5. **Nunca** borrar decisiones; cambiar estado a `SUPERSEDED` y agregar la nueva.

> Cierre Phases 3→4→5 (2026-08-08): [D-081] ERD Phase 3, [D-082] BR-SUB-005 + índices, [D-083] diferimientos inventario/reportes. Phase 5: CI+tests, isolation suite, E2E `apps/web/e2e`, ASVS-lite.
