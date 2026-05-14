# Finanzas Empresa, overview por proyecto y plan de indicadores (Phase 14C–14E + **Phase 16A–17A**)

Este documento **audita el estado actual** (rutas + Prisma + servicios) y define **arquitectura objetivo** para que **Finanzas** (`/finanzas`) sea el **hub financiero de la empresa**: vista global (CxC, CxP, tesorería, contabilidad, reporting) más **gastos corporativos** imputados por **`projectId` nullable** y/o dimensiones analíticas — **sin** un segundo libro ni “proyecto ficticio” para estructura.

Reglas de implementación: **sin Prisma en `apps/web`**, datos desde **`@bloqer/services`**, **RBAC `can()`**, **tenant module gates**, **sin inventar métricas** ni fórmulas no documentadas.

Relacionado: [`TENANT_DASHBOARD_ARCHITECTURE.md`](./TENANT_DASHBOARD_ARCHITECTURE.md), [`PERMISSIONS_ROUTE_MATRIX.md`](./PERMISSIONS_ROUTE_MATRIX.md), [`03-finance/MONEY_MODEL.md`](../03-finance/MONEY_MODEL.md).

---

## Phase 16A — Finanzas Empresa: auditoría de modelo y diseño (solo documentación)

**Fecha auditoría:** 2026-05-13. **Alcance:** Prisma `packages/database/prisma/schema.prisma`, servicios `@bloqer/services` (AP, AR, tesorería, aging, hub finanzas, flujo de caja proyecto), validators `@bloqer/validators`. **Sin migración, sin `db:push`, sin cambios de código** en esta fase.

### 16A.1 Visión producto (es-AR)

**Finanzas Empresa** debe consolidar, por `companyId` dentro del tenant: CxC y CxP globales, tesorería por cuenta, resultado simple (ingresos / egresos / saldo) con reglas explícitas multimoneda, vencimientos próximos, flujo de caja proyectado, distribución por proyecto y por categoría de gasto. **La base no es una contabilidad paralela:** proyecto = **filtro** por `projectId`; empresa = **agregado** de todos los proyectos + partidas con **`projectId` null** (gastos generales, banco, impuestos, etc.).

### 16A.2 Tabla — modelos auditados vs `projectId`

| Modelo | `projectId` en schema | Notas |
|--------|------------------------|--------|
| `SalesInvoice` | `String` **obligatorio** | Cadena AR; `companyId` también en fila. |
| `Receivable` | **obligatorio** | Comentario BR-AR-003: negocio podría permitir deuda sin obra; schema aún no. |
| `Collection` | **obligatorio** | Copiado desde receivable / factura. |
| `SupplierInvoice` | **obligatorio** | AP; numeración `@@unique([tenantId, companyId, number])` por empresa. |
| `Payable` | **obligatorio** | 1:1 con factura proveedor emitida. |
| `Payment` | **obligatorio** | Amarrado a payable/factura. |
| `PurchaseOrder`, `PurchaseReceipt` | **obligatorio** | Procurement obra; independiente de “gasto general” vía factura directa. |
| `JournalEntry` | `String?` | Ya soporta asientos corporativos. |
| `JournalEntryLine` | `String?` | Imputación por línea. |
| `AccountingMappingRule` | **sin** `projectId` | Reglas por `companyId` + `eventType`; no es libro analítico por obra. |
| `AccountMovement` | **sin columna** `projectId` | Trazabilidad vía `sourceType` / `sourceId`; `companyId` opcional en fila. |
| `TreasuryAccount` | N/A | `companyId` opcional en cuenta. |
| `InternalTransfer` | N/A | Solo `companyId`. |
| `Warehouse` | `String?` | Depósito puede ser central o de obra. |
| `StockMovement` | `String?` | Costos inventario ya distinguen null. |

**Entidad `Expense` / `ExpenseCategory`:** no existe en el schema ni en el código (búsqueda 2026-05-13). No hay ledger duplicado “Expense”; el riesgo sería **introducir** una tabla genérica sin necesidad.

### 16A.3 Respuestas a las preguntas de negocio / arquitectura

1. **¿Qué modelos ya soportan `projectId` nullable?**  
   `JournalEntry`, `JournalEntryLine`, `Warehouse`, `StockMovement`, `WarehouseTransfer` (según schema), `DocumentAttachment` (en doc histórico §1.6). **No** AR/AP/Payment/Collection/SupplierInvoice/Payable.

2. **¿Qué modelos fuerzan `projectId` y hoy no pueden representar gastos generales de empresa en el mismo flujo AP estándar?**  
   `SalesInvoice`, `Receivable`, `Collection`, `SupplierInvoice`, `Payable`, `Payment`, y el núcleo de compras (`PurchaseOrder`, `PurchaseReceipt`, `Subcontract`, …). Cualquier alta vía estos modelos **requiere** un proyecto real en DB.

3. **¿Qué servicios asumen `projectId` obligatorio?**  
   - AP: `supplier-invoice.service.ts` (`resolveCompanyId(projectId)`, validación PO vs proyecto), `payable.service.ts`, `payment.service.ts` (listados filtran `where: { projectId }`).  
   - AR: `sales-invoice.service.ts`, `receivable.service.ts`, `collection.service.ts` (mismo patrón).  
   - Validators: `packages/validators/src/ap.ts`, `sales-invoice.ts` — `projectId: z.string().uuid()`.  
   - Contabilidad: `accounting.ts` ya permite `projectId` opcional/nullable en líneas/asientos.

4. **¿Qué páginas / rutas asumen finanzas “siempre en proyecto”?**  
   Mutaciones AP/AR viven bajo `apps/web/app/(app)/proyectos/[id]/...` (facturas, CxC, CxP, pagos, cobranzas). **`/finanzas`** (empresa) es **solo lectura** vía `getFinanceHubOverview`: aging **sin** `projectId` en el filtro (toda la cartera del tenant según permisos) + tesorería por compañía. **AR** sigue operando en cadena con obra; **AP** puede mezclar líneas con y sin proyecto en el aging global (Phase **16D** separa “con obra” vs “sin obra” en UI a partir de los ítems del aging).

5. **¿Hay concepto duplicado de “gasto”?**  
   No hay módulo `Expense`. **Cost control** y **project cash flow** leen hechos operativos (certificaciones, OC, AP, stock, libro de obra, etc.); **contabilidad** es libro separado por diseño (GL), no duplicado de AP si se usa como reflejo / ajuste con `sourceType`/`sourceId`.

6. **¿Forma más segura de modelar gastos generales sin romper finanzas por proyecto?**  
   - **Hoy (sin migración):** `JournalEntry` / líneas con `projectId` null + movimientos de tesorería cuyo `sourceType` no sea cobro/pago de CxC/CxP de obra (p. ej. ajustes manuales), más política interna.  
   - **Objetivo (con migración acotada, Phase 16B):** **`SupplierInvoice` / `Payable` / `Payment` con `projectId` opcional** para facturas de proveedor **corporativas** (alquiler, honorarios, servicios); `companyId` sigue siendo la ancla; listados y aging ya filtran por `companyId` opcional y omiten `projectId` en el `where` cuando no se pasa — habría que extender **DTOs** (`AgingItem.projectName` para null → “Empresa” / “Sin proyecto”) y **servicios** que hoy hacen `resolveCompanyId` solo vía proyecto.  
   - **Tesorería:** valor opcional **`projectId` nullable en `AccountMovement`** (o derivación estricta desde `sourceId` si no se desnormaliza) para reporting “por obra” vs “corporativo” sin segunda tabla de movimientos.

### 16A.4 Decisión recomendada (pendiente confirmación producto)

> **Actualización 2026-05-14:** ingresos corporativos **sin obra** en Phase 1 quedaron en **opción (2)** — [D-037](../00-product/DECISION_LOG.md), [ADR-Phase1-07](./ARCHITECTURE_DECISION_RECORDS.md). La fila “AR sin obra” de la tabla sigue siendo el **objetivo futuro** si producto elige opción (1).

| Tema | Recomendación Phase 16 |
|------|-------------------------|
| AP corporativo | **Sí**, dirección preferida: `SupplierInvoice.projectId`, `Payable.projectId`, `Payment.projectId` → **`String?`** con FK `onDelete: SetNull` o restrict según reglas; numeración ya es por empresa. |
| AR sin obra | **Diferido** salvo necesidad explícita: relajar `SalesInvoice`/`Receivable`/`Collection` impacta certificaciones y flujos de obra; auditar BR-AR-003 en `OPEN_QUESTIONS` / `DECISION_LOG` antes. |
| `AccountMovement.projectId` | **Sí, evaluar agregar** nullable para UI “tesorería por proyecto / sin proyecto” y hub empresa; alternativa más débil: inferir solo desde `sourceType`+`sourceId` (más queries, huecos si el movimiento no tiene fuente con proyecto). |
| `ExpenseCategory` | **Solo si** hace falta etiquetado estable para UI/filtros; implementar como **dimensión no contable** (tabla maestra o `metadata` JSON acotado en factura/movimiento) — **no** segundo asiento automático paralelo al GL salvo reglas documentadas. |
| Tabla `Expense` genérica | **No** en 16B–16G salvo nuevo requisito de workflow/aprobaciones que no quepa en AP+GL (entonces ADR + `STATE_MACHINES`). |

### 16A.5 Plan de implementación por fases (post-auditoría)

| Fase | Contenido |
|------|-----------|
| **16B** | **Hecho (2026-05-13):** ver §Phase 16B — migración + servicios + validators + aging AP + documentos; **sin** UI global de alta corporativa (→ 16C). |
| **16C** | **Hecho (2026-05-13):** UI bajo `/finanzas/facturas-proveedor/**`, `/finanzas/cuentas-por-pagar/**`, `/finanzas/pagos-proveedor/[paymentId]`; servicios `listCompany*` / `getCompany*` con **`VIEW AP` only**; hub con enlaces; adjuntos corporativos. Ver §Phase 16C. |
| **16D** | **Hecho (2026-05-13):** hub `/finanzas` tablero empresa — `getFinanceHubOverview` + `FinanceHubView`: multimoneda, split AP aging, accesos rápidos, tesorería, enlace contabilidad; nav shell Finanzas con `VIEW TREASURY` / `VIEW ACCOUNTING`. |
| **16E** | **Hecho (2026-05-13):** subnav bajo `/finanzas` + polish UI hub + copy (“Facturas y gastos”, “Pagos pendientes”, “Empresa / gastos generales”). Ver §Phase 16E. |
| **16F** | **Integración proyecto:** filtros “solo obra” / “mixto”; reportes distribución por proyecto y por categoría; alinear `getProjectCashFlowReport` / cost control con movimientos que expongan dimensión corporativa donde aplique. |
| **16G** | **Indicadores** en `/dashboard` y/o hub: deuda próxima, cobros próximos, cash forecast — solo métricas ya definibles desde datos existentes o desde 16B; nuevas métricas → doc de fórmulas / `OPEN_QUESTIONS`. |

### 16A.6 Criterios de aceptación Phase 16A (cumplidos en doc)

- [x] Auditoría explícita de schema y capa de servicios para las entidades pedidas.  
- [x] Decisión documentada: nullable `projectId` en **AP** como dirección preferida para gastos generales; **AR** diferido; **`AccountMovement`** a evaluar.  
- [x] Recomendación: **no** tabla `Expense` genérica; categorías solo como dimensión de reporting si hace falta.  
- [x] Plan faseado 16B–16G.  

---

## Phase 16B — AP corporativo + `AccountMovement.projectId` (implementado 2026-05-13)

### 16B.1 Objetivo

Permitir **facturas proveedor / C×P / pagos** con **`projectId` null** (gastos generales de empresa) sin proyecto ficticio. **AR sin cambios.** Sin tabla `Expense`, sin auto-post contable nuevo.

### 16B.2 Schema y migración

- Migración: `packages/database/prisma/migrations/20260513200000_phase_16b_ap_company_project_optional/migration.sql`.
- `SupplierInvoice.projectId`, `Payable.projectId`, `Payment.projectId` → **`String?`**, relación `Project?` con **`ON DELETE SET NULL`** (reemplaza `RESTRICT` previo en FK de proyecto).
- `AccountMovement.projectId` → **`String?`** + FK opcional a `Project` (`ON DELETE SET NULL`) + índice `(tenantId, projectId)`. Uso previsto: **reporting / clasificación manual**; los movimientos generados por **PAYMENT** / **COLLECTION** siguen con `projectId` null en esta fase (no duplicar imputación respecto de la fuente operativa).

### 16B.3 Servicios y reglas

| Área | Cambio |
|------|--------|
| `supplier-invoice.service` | Alta con `projectId` opcional; sin OC si no hay proyecto; `resolveCompanyIdForAp`; coherencia **proyecto ↔ `ctx.companyId`** cuando ambos existen; PO solo con proyecto. Lecturas/mutaciones con **`projectScopeId`** opcional para rutas `/proyectos/[id]/...`. |
| `payable` / `payment` | `Payment.projectId` copia `payable.projectId` (puede ser null). **Alcance proyecto:** `getPayableById` / `getPaymentById` / `createPayment` / `cancelPayment` con `projectScopeId` opcional. |
| `aging.service` (AP) | `AgingItem.projectId` **nullable**; `projectName` = nombre de obra o constante exportada **`AGING_AP_COMPANY_PROJECT_LABEL`** (*Empresa (general)*). |
| `document.service` | Adjuntos a factura proveedor **corporativa**: `projectId` del documento null; `initiateUploadSchema.projectId` opcional; validación de factura sin proyecto vs. ruta con proyecto. |
| `journal-entry-source-link.service` | Enlace a factura en proyecto si `inv.projectId` no es null; **Phase 17D:** corporativo → `/finanzas/facturas-proveedor/[id]` con `VIEW AP`; pago corporativo → `/finanzas/pagos-proveedor/[id]`. |

### 16B.4 Validators y rutas proyecto

- `createSupplierInvoiceSchema`: `projectId` opcional/nullable; la **Server Action** `createSupplierInvoiceAction` **fuerza** `projectId` desde la ruta `/proyectos/[id]/...` para que el flujo obra no regrese.

### 16B.5 UI mínima

- Tabla aging global: celda proyecto con fallback.
- Listas bajo proyecto: enlaces siguen usando el `id` de la URL (no `invoice.projectId` en el tipo de ítem).

### 16B.6 Auditoría post-implementación (2026-05-13)

| Tema | Resultado |
|------|------------|
| Listados por proyecto (`list*ByProject`) | `where: { projectId }` estricto — **no** incluyen filas `projectId` null. |
| Aging AP global | `getPayableAgingReport` sin filtro `projectId` incluye **obra + corporativas**; DTO con `AGING_AP_COMPANY_PROJECT_LABEL`. |
| Overview finanzas proyecto | Usa `listPayablesByProject` / `listSupplierInvoicesByProject` + aging con `{ projectId }` — **no** mezcla corporativas. |
| `document.service` | `projectId` null solo con `SUPPLIER_INVOICE` corporativa (servicio); **Zod** `initiateUploadSchema` exige proyecto si `linkedEntityType` ≠ `SUPPLIER_INVOICE`. |
| Lecturas/mutaciones bajo `/proyectos/[id]/...` | **Endurecido:** `getSupplierInvoiceById` / `getPayableById` / `getPaymentById` aceptan `projectScopeId` opcional; páginas y acciones de proyecto lo pasan. **Mutaciones** `update` / `issue` / `cancel` factura y `createPayment` / `cancelPayment` validan coherencia con el proyecto de la ruta. Evita deep links cruzados y facturas corporativas en shell de obra. |
| `journal-entry-source-link` | Sin `href` a `/proyectos/null/...`; corporativo → `href` bajo `/finanzas/...` (Phase 17D). |
| `createSupplierInvoice` | Si `ctx.companyId` y proyecto con `companyId`, deben coincidir. |
| Migración SQL | `DROP CONSTRAINT` + `DROP NOT NULL` + `ADD CONSTRAINT` — riesgo bajo si nombres de FK coinciden con init; **no** usa `db:push`. |

---

## Phase 16C — UI AP empresa bajo `/finanzas` (implementado 2026-05-13)

### 16C.1 Alcance

- **Rutas:** `GET /finanzas/facturas-proveedor`, `/nueva`, `/[invoiceId]`; `GET /finanzas/cuentas-por-pagar`, `/[payableId]`, `/[payableId]/pagar`; `GET /finanzas/pagos-proveedor/[paymentId]`.
- **Representación de “gastos generales”:** mismas entidades **SupplierInvoice → Payable → Payment** con `projectId` null (sin tabla `Expense`).
- **Aislamiento:** servicios `listCompanySupplierInvoices`, `getCompanySupplierInvoiceById`, `listCompanyPayables`, `getCompanyPayableById`, `getCompanyPaymentById` exigen **`VIEW AP`** (`canViewCompanyAp`) y filas con **`projectId === null`** (más `ctx.companyId` cuando aplica). Las rutas proyecto siguen con `projectScopeId` / `list*ByProject`.
- **Hub:** `getFinanceHubOverview` agrega enlaces de reporte a facturas/C×P empresa y “gastos generales”. **Phase 16D** amplía el mismo servicio a tablero multimoneda + split AP obra/corporativo (aging) + accesos rápidos + bloque contabilidad (solo enlace).
- **Adjuntos:** `EntityDocumentsPanel` con `scope: { kind: "company-finanzas-supplier-invoice" }` + `DocumentForm` con `projectId` null; acciones server `attachment-actions.ts` revalidan `/finanzas/facturas-proveedor/...`.
- **Contabilidad:** sin auto-post; botón “Generar asiento” en pago empresa reutiliza `suggestJournalFromPayment` como en proyecto.

### 16C.2 Fuera de alcance (historial)

- ~~Gráficos / KPI dashboard financiero empresa~~ — cubierto en **16D** (v1 tablero sin Recharts obligatorio).
- Filtros avanzados (proveedor en listado) más allá de estado/fechas simples por query.

---

## Phase 16D — Hub `/finanzas` tablero empresa (2026-05-13)

### 16D.1 Alcance

- **Servicio:** `packages/services/src/finance/finance-hub-overview.service.ts` — DTO con `FinanceHubCurrencySnapshot` por moneda (totales abiertos, vencido vs al día, ratios), `apWithProjectInsight` vs `apCorporateInsight` (filtro por `projectId` en ítems del **mismo** `getPayableAgingReport` global), `quickActions`, `alerts` (incl. nota multimoneda), `accountingSection` (enlace a `/contabilidad` si módulo + `VIEW ACCOUNTING`). Sin schema nuevo, sin entidad `Expense`, sin contabilización automática.
- **UI:** `apps/web/features/finance/finance-hub-view.tsx` + copy en `apps/web/app/(app)/finanzas/page.tsx`.
- **Nav:** `apps/web/lib/nav-config.ts` — ítem **Finanzas** si `VIEW AR` **o** `VIEW AP` **o** `VIEW TREASURY` **o** `VIEW ACCOUNTING`, con módulo tenant habilitado en la rama correspondiente.
- **Permisos:** `canSeeAnything` no usa `VIEW PROJECTS` como atajo global; AP corporativo en UI/servicios `*Company*` sigue **`VIEW AP`** (sin cambio 16C).

### 16D.2 Fuera de alcance

- Entidad **Expense** dedicada, cashflow proyectado complejo, reportes GL avanzados, imputación automática, `projectId` nullable en cadena AR.

---

## Phase 16E — UX + subnav Finanzas (2026-05-13)

### 16E.1 Alcance

- **Subnav:** `apps/web/app/(app)/finanzas/layout.tsx` + `apps/web/features/finance/finance-subnav.tsx` + `finance-subnav-links.ts` — `getFinanceSubnavLinks(ctx)` con `getTenantModuleGate` + `can()`; solo rutas reales (Resumen, CxC aging, facturas y gastos, pagos pendientes, aging proveedores, Tesorería, Contabilidad). Enlaces a `/tesoreria` y `/contabilidad` salen del segmento `/finanzas` pero siguen en la barra cuando el rol califica.
- **Hub:** refinamiento visual de `FinanceHubView` (jerarquía, cards, empty states, barra vencido vs al día con tokens, accesos rápidos en card).
- **Copy:** “Facturas y gastos”, “Pagos pendientes”, “Empresa / gastos generales”; páginas listado/aging alineadas en títulos y textos cortos.
- **Sin** schema, **sin** `Expense`, **sin** automatismos contables; **sin** cambios al contrato DTO de `getFinanceHubOverview` (solo strings de labels en servicio donde aplica).

### 16E.2 Fuera de alcance

- Rutas nuevas solo para subnav; **sin** “Gastos generales” como URL inventada (Phase **17B** agrega `/finanzas/gastos-generales` como **asistente** explícito; no cambia el modelo).

---

## Phase 17A — Auditoría diseño: transacciones empresa / gastos generales (2026-05-13)

**Alcance:** consolidar hallazgos Prisma + servicios para “gastos de estructura / corporativos” alineados a ERP tipo **vendor bill** (factura proveedor → obligación → pago → GL opcional), sin introducir un segundo ledger ni tabla **`Expense`** en el corto plazo. **Ingresos corporativos sin obra** quedan como decisión de producto aparte — ver [`OPEN_QUESTIONS.md`](../00-product/OPEN_QUESTIONS.md) **Q-030** y [D-035](../00-product/DECISION_LOG.md).

### 17A.1 Hallazgos Prisma (resumen)

| Capa | Modelo | Rol para gastos generales |
|------|--------|---------------------------|
| Documento | `SupplierInvoice` + líneas | `projectId` **null** = corporativo (Phase 16B). |
| Obligación | `Payable` | 1:1 con factura emitida; `projectId` opcional. |
| Pago | `Payment` | Copia `projectId` del payable; genera tesorería. |
| Tesorería | `AccountMovement` | `sourceType = PAYMENT`, `sourceId = payment.id`; filtro “solo empresa” vía pago con `projectId` null (Phase **17C**). |
| Contabilidad | `JournalEntry` / líneas | Origen `SUPPLIER_INVOICE` / `PAYMENT`; sin auto-post (Phase 11C). |
| Adjuntos | `DocumentAttachment` | Corporativo permitido para `SUPPLIER_INVOICE` sin proyecto. |

**Hueco explícito — ingreso empresa sin proyecto:** cadena **AR** (`SalesInvoice` / `Receivable` / `Collection`) sigue con **`projectId` obligatorio** en schema (BR-AR-003). No se resuelve con “Expense”; opciones futuras: AR nullable + migración, documento de ingreso distinto, o solo GL + `TREASURY_INFLOW` — **Q-030**.

**Egreso tesorería sin factura / sin AP:** `MANUAL_ADJUSTMENT` existe en enumeración; **no** hay flujo UI/servicio general de alta libre equivalente a extracto bancario sin `Payment` en esta fase.

**Rubro / categoría:** líneas tienen `description` e impuestos; no hay `categoryId` maestro en línea. Dimensión analítica **C** (opcional): convención en texto → luego tabla/metadata acotado coordinado con mapeo GL — ver [D-035](../00-product/DECISION_LOG.md).

### 17A.2 Hallazgos servicios (representativo)

- **AP corporativo:** `listCompanySupplierInvoices`, `createSupplierInvoice` con `projectId` null, `listCompanyPayables`, `createPayment` con `projectScopeId` — ya cubren factura → C×P → pago.
- **Tesorería:** `getAccountMovementReport` extendido con filtro opcional **pagos AP corporativos** (Phase **17C**).
- **Contabilidad:** `getJournalEntrySourceLink` — enlace **`href`** a `/finanzas/facturas-proveedor/[id]` y `/finanzas/pagos-proveedor/[id]` cuando el origen es corporativo y el rol tiene **`VIEW AP`** (Phase **17D**); evita `/proyectos/null/...`.
- **Hub:** `getFinanceHubOverview` + **`getCompanyFinanceOperationsSummary`** (Phase **17E**): conteos y saldos **por moneda** (sin sumar monedas distintas).

### 17A.3 Decisión B + C (lockeada en producto)

| Opción | Veredicto |
|--------|-----------|
| **A — Tabla `Expense`** | **No** como primer paso: duplicaría montos frente a AP + tesorería + GL; reservar solo si hay workflow que no quepa en AP. |
| **B — AP + tesorería + contabilidad** | **Sí** como núcleo para gastos con proveedor (vendor bill). |
| **C — Dimensión liviana** | **Probable** para rubro / centro de costo analítico **sin** segundo asiento automático. |

**Referencia:** [D-035](../00-product/DECISION_LOG.md).

### 17A.4 Plan 17B–17E (implementación)

| Fase | Entregable |
|------|------------|
| **17B** | Rutas `/finanzas/gastos-generales` + `/nueva`: asistente de pasos reutilizando alta de factura corporativa, emisión y C×P existentes. |
| **17C** | Filtro `corporateApPayments` en reporte de movimientos + CSV/email. |
| **17D** | `journal-entry-source-link` — `href` finanzas para factura/pago corporativo. |
| **17E** | `company-finance-operations-summary.service` + card en hub `/finanzas`. |

---

## 1. Auditoría — respuestas directas (histórico Phase 14C–14E)

### 1.1 ¿Qué rutas existen hoy dentro de proyecto?

Bajo `apps/web/app/(app)/proyectos/**` (App Router), además de `/proyectos` y `/proyectos/nuevo`, el árbol **`/proyectos/[id]/...`** incluye (resumen por área):

| Área | Rutas principales |
|------|-------------------|
| Resumen / datos | `/proyectos/[id]`, `/proyectos/[id]/editar` |
| Presupuestos | `/presupuestos`, `/nuevo`, `/[budgetId]`, `/[budgetId]/editar` |
| Certificaciones | `/certificaciones`, `/nueva`, `/[certId]`, `/[certId]/editar` |
| Facturación venta (AR) | `/facturas`, `/nueva`, `/[invoiceId]`, `/[invoiceId]/editar` |
| CxC / cobranzas | `/cuentas-por-cobrar`, `/[receivableId]`, `/[receivableId]/cobrar`, `/cobranzas`, `/nueva`, `/[collectionId]` |
| AP / compras | `/facturas-proveedor`, `/nueva`, `/[supplierInvoiceId]`, `/[supplierInvoiceId]/editar`, `/cuentas-por-pagar`, `/[payableId]`, `/[payableId]/pagar`, `/pagos`, `/[paymentId]`, `/ordenes-compra`, `/nueva`, `/[poId]`, `/[poId]/editar`, `/[poId]/recepciones/nueva`, `/recepciones`, `/[receiptId]` |
| Costos / flujo / hub finanzas obra | `/control-costos`, `/control-costos/[wbsNodeId]`, `/flujo-caja`, **`/finanzas`** (segmento bajo `[id]`, es decir `/proyectos/[id]/finanzas`) |
| Operativa | `/subcontratos`, `/nuevo`, `/[subcontractId]`, `/editar`, certificaciones de subcontrato, `/libro-obra`, `/nuevo`, `/[logId]`, `/[logId]/editar`, `/inventario`, `/consumos/nuevo`, `/documentos`, `/nuevo`, `/[documentId]` |

La **ficha** `/proyectos/[id]` conserva atajos en botones; la **navegación principal entre secciones** es la subnav del layout. Rutas como OC, recepciones, consumos, detalle de facturas siguen enlazadas desde listas o CTAs internos.

### 1.2 ¿Qué rutas faltan para una experiencia “completa”?

- **Indicadores / gráficos avanzados** en hub empresa (cashflow proyectado complejo, GL drill-down masivo) — fuera de **16D**; ver §16D.2.
- **Entidad `Expense` dedicada** — no prevista; ver 1.5 y §7.

### 1.3 ¿Existe `/proyectos/[id]/finanzas`?

**Sí (Phase 14E).** Página `apps/web/app/(app)/proyectos/[id]/finanzas/page.tsx` y servicio **`getProjectFinanceOverview(ctx, projectId)`** en `packages/services/src/project-finance/project-finance-overview.service.ts`. Orquesta aging AR/AP con filtro `projectId` cuando el rol tiene `VIEW AR` / `VIEW AP`; si el acceso es solo vía `canViewArProjectArea` / `canViewApProjectArea` (p. ej. `VIEW PROJECTS` sin `VIEW AR`), agrega saldos por moneda desde los listados por proyecto **sin** mezclar monedas en un solo total. No llama a `getProjectCostControl` completo.

### 1.4 ¿Existe una visión global financiera “real” en `/finanzas`?

**Sí (Phase 14C+; tablero Phase 16D).** La página usa **`getFinanceHubOverview(ctx)`** (`packages/services/src/finance/finance-hub-overview.service.ts`): aging AR/AP global (`getReceivableAgingReport` / `getPayableAgingReport`) con **desglose por moneda** y **split AP** con obra vs corporativo en ítems de aging; tesorería con **`getTreasurySummaryByCompany`**; **accesos rápidos** y **alertas** (p. ej. multimoneda); bloque **contabilidad** solo como enlace si módulo + `VIEW ACCOUNTING`. **No** duplica fórmulas de cost-control ni project-cash-flow; **no** agrega KPIs contables calculados.

### 1.5 ¿Cómo se registran hoy gastos “sin proyecto”?

- **AR (factura → C×C → cobro):** el modelo sigue amarrado a **obra** (`projectId` requerido en cadena AR típica). **Fuera de alcance** Phase 16 salvo decisión BR-AR-003.
- **AP (factura proveedor → C×P → pago):** desde **Phase 16B** `SupplierInvoice` / `Payable` / `Payment` admiten **`projectId` null** (gastos generales). **Phase 16C** expone UI bajo **`/finanzas/...`** con flujo completo (alta, emisión, C×P, pago, adjuntos) sin tabla `Expense`.
- **Tesorería:** `AccountMovement` puede tener `projectId` opcional (16B); el vínculo operativo sigue siendo **`sourceType` + `sourceId`** donde aplique.
- **Contabilidad:** `JournalEntry` / líneas con `projectId` opcional; asiento manual sigue siendo alternativa para gastos de estructura.

Conclusión operativa: **gasto general sin obra** en AP se registra como **factura de proveedor corporativa** (`projectId` null) y su **C×P / pago**; AR y otras cadenas siguen las reglas históricas del doc hasta relajarlas explícitamente.

### 1.6 ¿Qué modelos ya aceptan `projectId` opcional?

(Referencia Prisma en `packages/database/prisma/schema.prisma`; lista no exhaustiva de los relevantes para finanzas/stock/docs.)

| Modelo | `projectId` |
|--------|-------------|
| `JournalEntry` | `String?` |
| `JournalEntryLine` | `String?` |
| `Warehouse` | `String?` |
| `StockMovement` | `String?` |
| `WarehouseTransfer` | `String?` |
| `DocumentAttachment` | `String?` |

### 1.7 ¿Qué modelos requieren `projectId` obligatorio?

Entre los de ciclo financiero operativo típico:

| Modelo | Notas |
|--------|--------|
| `Budget`, `Certification`, `SalesInvoice`, `Receivable`, `Collection` | Cadena AR amarrada a obra |
| `SupplierInvoice`, `Payable`, `Payment`, `PurchaseOrder`, `PurchaseReceipt` | **AP:** `SupplierInvoice` / `Payable` / `Payment` → `projectId` **opcional** (16B); **compras** (`PurchaseOrder` / recepciones) siguen **obra**. Cadena **AR** sigue amarrada a obra en el schema actual. |
| `Subcontract`, `SubcontractCertification`, `JobsiteLog` | Alcance obra |

Comentario en schema (`Receivable`): *“product concepts may allow debt without a project”* — **a nivel negocio** se discutió; **a nivel schema** sigue **requerido**; relajar implicaría migración + revisión BR (ver 1.9).

### 1.8 ¿Qué se puede consolidar empresa vs proyecto **sin** schema nuevo?

| Necesidad | Fuente existente | Filtro / agregación |
|-----------|------------------|---------------------|
| Aging CxC / CxP global | `getReceivableAgingReport` / `getPayableAgingReport` | Ya soportan `AgingFilters` (`companyId`, `projectId`, …) |
| Flujo de caja **por proyecto** | `getProjectCashFlowReport` | Ya por `projectId` |
| Control de costos **por proyecto** | `getProjectCostControl`, `getWbsItemCostDetail` | Ya por `projectId` |
| Tesorería saldo por cuenta | `getTreasurySummaryByCompany`, reportes en `treasury-reports` | Por `companyId` / tenant; **no** hay agregado por proyecto en una sola columna en `AccountMovement` |
| Mayor / asientos | `journal-entry`, listados | Filtrar por `projectId` null vs no null para “corporativo” vs obra |
| Dashboard tenant (14B) | `getTenantDashboard` | Ya compone KPIs sin duplicar cost-control |
| Hub finanzas empresa (14C+ / 16D) | `getFinanceHubOverview` | Aging AR/AP + tesorería; split AP obra/corporativo (16D) |

### 1.9 ¿Qué requiere decisión de producto o schema nuevo?

| Tema | Motivo |
|------|--------|
| **C×P / factura proveedor sin `projectId`** | Hoy `projectId` obligatorio; permitir null = migración + reglas de numeración, permisos, aging, reportes, UI |
| **Receivable / factura venta sin proyecto** | Misma situación; comentario BR-AR-003 ya advierte |
| **`AccountMovement.projectId`** | No existe; hoy el rastro a obra es indirecto (collection/payment). Para “tesorería por proyecto” en sentido de saldo **por obra** haría falta modelo/enriquecimiento o convención de `sourceType` |
| **Módulo `Expenses` dedicado** | Si el producto quiere categorías, aprobaciones, adjuntos y reporting de gasto estructura sin pasar por GL manual |
| **FX y totales multimoneda** | Consolidación “una cifra” en dashboard global |

---

## 2. Visión empresa (objetivo)

La **empresa** (`companyId` dentro del tenant) debe poder verse como:

1. **AR** — todas las facturas/cobranzas **de todos los proyectos**; ítems “sin proyecto” solo si en el futuro el schema/reglas lo permiten (hoy no en C×C estándar).
2. **AP** — igual para facturas proveedor/pagos.
3. **Tesorería** — posición y movimientos a **nivel cuenta**; parte de los movimientos **no** tiene proyecto explícito en fila; la narrativa puede ser “operativo global + vínculos cuando existan”.
4. **Contabilidad** — plan de cuentas y asientos **por empresa**; líneas/asientos con `projectId` null = actividad no imputada a obra.
5. **Gastos generales** — **sin** entidad `Expense`: uso previsto de **AP + tesorería + contabilidad** con imputación coherente; hoy el camino realista sin migración es **journal entries** (y política interna) + movimientos de caja no ligados a cobro/pago de C×P de obra.

**Implementación (Phase 14C+ / 16D):** ver `getFinanceHubOverview` + `FinanceHubView` en `apps/web/features/finance/`.

---

## 3. Visión proyecto (objetivo)

**Phase 14E (v1):** la ruta **`/proyectos/[id]/finanzas`** implementa un **hub de solo lectura** con CTAs hacia mutaciones ya existentes (`getProjectFinanceOverview`). Resumen:

| Bloque | Servicio / ruta existente | Notas |
|--------|---------------------------|--------|
| CxC / cobranzas | `getReceivableAgingReport({ projectId })` o agregado desde `listReceivablesByProject`; rutas `[id]/cuentas-por-cobrar`, `cobranzas` | Sin mezclar monedas |
| CxP / pagos | `getPayableAgingReport({ projectId })` o `listPayablesByProject`; facturas proveedor | Sin mezclar monedas |
| Flujo de caja proyecto | Enlace a `/flujo-caja`; `getProjectCashFlowReport` no se duplica en el hub | |
| Presupuesto vs real | `listBudgetsByProject` para último aprobado/cerrado; enlaces a `/presupuestos` y `/control-costos` | No se invoca `getProjectCostControl` en el overview |
| Certificaciones / compras / subcontratos | Fuera del alcance de la v1 del hub financiero | Siguen en subnav / rutas dedicadas |
| Inventario en obra | Fuera del alcance de la v1 del hub financiero | `/inventario`, consumos |

**Tesorería “por proyecto”:** limitada por modelo: cobros/pagos llevan `projectId`, pero el movimiento en cuenta no; un overview puede **listar** cobros/pagos del proyecto y **enlazar** a cuenta, sin inventar saldo “por proyecto” en tesorería global sin reglas nuevas.

---

## 4. Gasto general (decisión inicial Phase 14C)

- **No** crear entidad `Expense` ni módulo nuevo en esta fase.
- **Registrar** gastos de estructura preferentemente vía:
  - **Asientos** (`JournalEntry` / líneas) con `projectId` null cuando corresponda; y/o
  - **Movimientos de tesorería** que no provengan de un payable/receivable de obra (según evolución del producto).
- **Cuándo tendría sentido un módulo `Expenses`:** aprobaciones multi-nivel, políticas por categoría, integración obligatoria con AP o con proyecto, reporting fiscal fuera del alcance del GL minimal, o volumen que haga insostenible el flujo solo contable.

---

## 5. Indicadores por módulo — patrón y ubicación del código

### 5.1 Opción A — `packages/services/src/<module>/<module>-insights.service.ts`

| Ventajas | Desventajas |
|----------|-------------|
| Alineado al dominio (AR, AP, tesorería); fácil de encontrar junto al módulo | Vistas “hub” que cruzan AR+AP+tesorería importan varios archivos |

### 5.2 Opción B — `packages/services/src/insights/` central

| Ventajas | Desventajas |
|----------|-------------|
| Un solo lugar para dashboards multi-módulo | Riesgo de **cajón de sastre**; dependencias cruzadas y archivos muy grandes |

### 5.3 Recomendación

- **Por defecto:** indicadores **específicos de un módulo** en **`<module>/<module>-insights.service.ts`** (o nombre equivalente ya existente en ese paquete).
- **Agregados multi-módulo acotados** (como el hub `/finanzas`): carpeta **`finance/`** con un servicio dedicado (**`finance-hub-overview.service.ts`**) que **solo orquesta** llamadas a servicios ya existentes — mismo criterio que `getTenantDashboard` vive en `dashboard/` y no en `insights/`.
- **Evitar** un directorio `insights/` monolítico salvo que en el futuro se extraigan **solo** DTOs compartidos (`insights/types.ts`) sin lógica pesada.

**Responsabilidad de cualquier `*-insights` / hub:** solo lecturas agregadas, DTOs estables, `getTenantModuleGate` donde corresponda, **sin** reimplementar cost-control / project-cash-flow / reglas AR-AP.

---

## 6. Navegación interna de proyecto (workspace)

### 6.1 Layout (Phase 14D + 15A)

- **`apps/web/app/(app)/proyectos/[id]/layout.tsx`** — envuelve **todas** las rutas bajo `[id]`; valida **`getProjectShellInfo(id, ctx)`** y **`getTenantModuleGate(ctx)`** en paralelo (mismos errores que antes).
- **Errores:** `ServiceError` **`NOT_FOUND`** → `notFound()`; **`FORBIDDEN`** → `redirect("/dashboard")` (mismo criterio que otras rutas app).
- **Phase 15A — shell UI:** bajo `/proyectos/[id]/**`, **`AppNavColumn`** reemplaza el **`Sidebar`** global por **`ProjectWorkspaceSidebar`**: bloque “Volver a proyectos” + nombre + badge de estado + código (datos vía **`GET /api/projects/[id]/shell`** → `getProjectShellInfo`, sin ampliar el DTO). El gate de módulos en cliente usa el **snapshot** serializado en **`apps/web/app/(app)/layout.tsx`** (`OVERVIEW_MODULES` → flags booleanos) y **`tenantGateFromSnapshot`** (default-on si falta clave, alineado a `getTenantModuleGate`).
- **Contenido principal:** título / estado / cliente / fechas / acciones de ciclo de vida siguen en las páginas (p. ej. resumen en `proyectos/[id]/page.tsx`); no hay barra horizontal de pestañas.

### 6.2 Ítems visibles y agrupación (`buildProjectWorkspaceNavSections`)

Las mismas reglas que la antigua lista plana: cada enlace solo si el **módulo tenant** está habilitado (`gate.isEnabled`) **y** el rol cumple el permiso / helper indicado. No se muestran secciones vacías.

| Sección UI | Enlaces (mismo criterio que tabla siguiente) |
|------------|-----------------------------------------------|
| Resumen | Resumen |
| Planificación | Presupuesto, Control de costos, Flujo de caja, Finanzas del proyecto (`/finanzas`, label **Finanzas del proyecto**) |
| Operación | Libro de obra, Certificaciones, Inventario, Documentos |
| Compras y contratos | Compras, Subcontratos, Facturas proveedor, Cuentas por pagar, Pagos |
| Comercial / Cobranzas | Facturas, Cuentas por cobrar, Cobranzas |
| Administración | Configuración |

| Label | Ruta | Módulo gate (tenant) | Permiso / helper |
|-------|------|----------------------|------------------|
| Resumen | `/proyectos/[id]` | — | `VIEW PROJECTS` |
| **Finanzas del proyecto (hub)** | **`/proyectos/[id]/finanzas`** | `PROJECTS` + (AR / AP / TREASURY / BUDGETS según bloque o flujo) | `canShowProjectFinanzasNavLink` — ver servicio |
| Presupuesto | `/proyectos/[id]/presupuestos` | `BUDGETS` | `VIEW BUDGETS` **o** `VIEW PROJECTS` (alineado a `canViewBudgetsArea` en servicios de presupuesto) |
| Control de costos | `/proyectos/[id]/control-costos` | `PROJECTS` + `BUDGETS` | `canViewProjectCostControlReport` (`VIEW PROJECTS` **o** `VIEW BUDGETS`) |
| Libro de obra | `/proyectos/[id]/libro-obra` | `JOBSITE_LOG` | `VIEW JOBSITE_LOG` **o** `VIEW PROJECTS` |
| Certificaciones | `/proyectos/[id]/certificaciones` | `CERTIFICATIONS` | `VIEW CERTIFICATIONS` |
| Compras | `/proyectos/[id]/ordenes-compra` | `PROCUREMENT` | `canViewProcurementProjectArea` (`VIEW PROCUREMENT` **o** `VIEW PROJECTS`) |
| Subcontratos | `/proyectos/[id]/subcontratos` | `SUBCONTRACTS` | `VIEW SUBCONTRACTS` **o** `VIEW PROJECTS` |
| Inventario | `/proyectos/[id]/inventario` | `INVENTORY` | `VIEW INVENTORY` |
| Documentos | `/proyectos/[id]/documentos` | `PROJECTS` | `VIEW PROJECTS` |
| Facturas | `/proyectos/[id]/facturas` | `AR` | `canViewArProjectArea` |
| Cuentas por cobrar | `/proyectos/[id]/cuentas-por-cobrar` | `AR` | `canViewArProjectArea` |
| Cobranzas | `/proyectos/[id]/cobranzas` | `AR` | `canViewArProjectArea` |
| Facturas proveedor | `/proyectos/[id]/facturas-proveedor` | `AP` | `canViewApProjectArea` |
| Cuentas por pagar | `/proyectos/[id]/cuentas-por-pagar` | `AP` | `canViewApProjectArea` |
| Pagos | `/proyectos/[id]/pagos` | `AP` | `canViewApProjectArea` |
| Flujo de caja | `/proyectos/[id]/flujo-caja` | `PROJECTS` | `canViewProjectCashFlowReport` (`VIEW PROJECTS` **o** `VIEW AR` **o** `VIEW AP` **o** `VIEW TREASURY`) — coherente con `getProjectCashFlowReport` |
| Configuración | `/proyectos/[id]/editar` | `PROJECTS` | `EDIT PROJECTS` |

**Rutas existentes no incluidas en el nav del workspace** (siguen por enlaces contextuales o menús internos): recepciones, consumos, detalles de facturas/OC/certificados, etc.

### 6.3 Ocultas / futuras (no link en nav hasta nueva página)

| Label aspiracional | Ruta | Notas |
|--------------------|------|--------|
| Cronograma | **`/proyectos/[id]/cronograma`** | Sin página. |
| Reportes (proyecto) | **`/proyectos/[id]/reportes`** | Sin página; hoy reportes clave = **Flujo de caja** y **Control de costos** con rutas propias. |
| WBS dedicado | ruta propia | Hoy WBS vive en **Presupuesto** y **Control de costos**; no se duplica link con la misma URL que presupuesto. |

### 6.4 Hub financiero del proyecto (Phase 14E)

- **Ruta:** `/proyectos/[id]/finanzas`.
- **Servicio:** `getProjectFinanceOverview(ctx, projectId, options?)` — valida tenant con `getProjectShellInfo`; **una** llamada a `getTenantModuleGate(ctx)` salvo que se pase `options.gate` (Phase **15B** comparte el gate con `getProjectOverviewDashboard`).
- **AR:** si módulo `AR` activo y `canViewArProjectArea` → totales y vencido **por moneda** (`getReceivableAgingReport({ projectId })` si `VIEW AR`, si no agregación sobre `listReceivablesByProject`); conteo facturas venta `ISSUED` vía `listInvoicesByProject`.
- **AP:** análogo con `getPayableAgingReport` / `listPayablesByProject` / `listSupplierInvoicesByProject`.
- **Flujo de caja:** card con enlace a `/flujo-caja` si `PROJECTS` activo y `canViewProjectCashFlowReport`; notas de contexto tesorería (sin inventar saldos bancarios por proyecto).
- **Presupuesto / costos:** si `PROJECTS` + `BUDGETS` activos — enlaces y, si `canViewBudgetsArea`, último presupuesto aprobado/cerrado vía `listBudgetsByProject` (sin ejecutar control de costos completo).
- **UI:** `ProjectFinanceOverviewView` en `apps/web/features/projects/project-finance-overview-view.tsx`.
- **Limitaciones:** sin entidad **Expense**; gastos generales fuera de obra siguen fuera de este hub; **no** se mezclan monedas en un único total.

### 6.5 Componentes (workspace)

- **`apps/web/components/layout/app-nav-column.tsx`** — cliente: si pathname `/proyectos/[id]/**` y usuario con tenant → **`ProjectWorkspaceSidebar`**; si no → **`Sidebar`** global.
- **`apps/web/components/layout/project-workspace-sidebar.tsx`** — cliente; secciones desde **`buildProjectWorkspaceNavSections`**; **Resumen** usa `NavItem` con `matchExact` (solo activo en la raíz del proyecto).
- **`apps/web/features/projects/tenant-gate-from-snapshot.ts`** — **`tenantGateFromSnapshot`** reconstruye `TenantModuleGate` en cliente.
- **`apps/web/app/api/projects/[id]/shell/route.ts`** — JSON del shell vía `getProjectShellInfo` (misma AuthZ que el layout).
- **`packages/services/src/project/project-workspace-nav.ts`** — **`buildProjectWorkspaceNavSections(projectId, gate, roles)`** (import en app vía `@bloqer/services/project-workspace-nav`).

### 6.6 Resumen ejecutivo del proyecto (Phase 15B)

- **Ruta:** `/proyectos/[id]` (raíz del workspace).
- **Servicio:** `getProjectOverviewDashboard(ctx, projectId)` en **`packages/services/src/project/project-overview-dashboard.service.ts`** — DTO estable para UI; sin Prisma en `apps/web`.
- **Datos:** reutiliza **`getProjectFinanceOverview(ctx, projectId, { gate })`** para C×C/C×P coherente con el hub; presupuesto vía **`listBudgetsByProject`**; facturado vs cobrado con **`listInvoicesByProject`** (total `ISSUED`) + **`listCollectionsByProject`** (`CONFIRMED`), **sin conversión de moneda** entre divisas; conteos con `prisma.count` / listas existentes según módulo y `can()`.
- **UI:** `ProjectOverviewView` y piezas en **`apps/web/features/projects/overview/`**.

---

## 7. Pendientes explícitos (backlog)

- [x] `getProjectFinanceOverview` en `packages/services/src/project-finance/project-finance-overview.service.ts`.
- [x] Rediseño `/finanzas` overview global (servicio + UI) — **v3 (Phase 16E)** subnav + polish visual + copy.
- [x] `layout.tsx` bajo `[id]` + navegación de proyecto (Phase **14D** subnav horizontal → **15A** sidebar workspace).
- [x] `/proyectos/[id]/finanzas` (página + servicio orquestador) — **Phase 14E**.
- [x] Resumen `/proyectos/[id]` — **Phase 15B** (`getProjectOverviewDashboard` + `ProjectOverviewView`).
- [x] **Phase 16B — schema + servicios:** `SupplierInvoice` / `Payable` / `Payment` con `projectId` nullable; `AccountMovement.projectId` nullable; aging AP + documentos corporativos; migración versionada.
- [x] **Phase 16C:** UI `/finanzas/facturas-proveedor/**`, `/finanzas/cuentas-por-pagar/**`, `/finanzas/pagos-proveedor/[paymentId]` + enlaces en hub + `canViewCompanyAp`.
- [ ] **Phase 16 — producto:** AR sin obra (`SalesInvoice` / `Receivable` / `Collection`) — **fuera de alcance** salvo decisión BR-AR-003.
- [ ] Rellenar `projectId` en movimientos tesorería desde fuente solo si producto define reglas anti-duplicación.

---

## 8. Referencias de código auditadas

| Área | Path principal |
|------|----------------|
| Resumen proyecto (Phase 15B) | `packages/services/src/project/project-overview-dashboard.service.ts`, `apps/web/features/projects/overview/project-overview-view.tsx`, `apps/web/app/(app)/proyectos/[id]/page.tsx` |
| Rutas proyecto | `apps/web/app/(app)/proyectos/**` |
| Rutas finanzas | `apps/web/app/(app)/finanzas/**` |
| Hub finanzas (servicio) | `packages/services/src/finance/finance-hub-overview.service.ts` |
| Hub finanzas (UI) | `apps/web/features/finance/finance-hub-view.tsx` |
| Hub finanzas **proyecto** | `packages/services/src/project-finance/project-finance-overview.service.ts` |
| Hub finanzas proyecto (UI) | `apps/web/features/projects/project-finance-overview-view.tsx`, `apps/web/app/(app)/proyectos/[id]/finanzas/page.tsx` |
| Workspace + layout proyecto | `apps/web/app/(app)/proyectos/[id]/layout.tsx`, `apps/web/components/layout/app-nav-column.tsx`, `project-workspace-sidebar.tsx`, `packages/services/src/project/project-workspace-nav.ts`, `GET /api/projects/[id]/shell` |
| Shell proyecto (servicio) | `packages/services/src/project/project.service.ts` (`getProjectShellInfo`, `canAccessProjectLayout`) |
| Rutas tesorería | `apps/web/app/(app)/tesoreria/**` |
| AR | `packages/services/src/ar/**` |
| AP | `packages/services/src/ap/**` |
| Tesorería | `packages/services/src/treasury/**` |
| Flujo de caja proyecto | `packages/services/src/project-cash-flow/**` |
| Control de costos | `packages/services/src/cost-control/**` |
| Contabilidad | `packages/services/src/accounting/**` |
| Aging | `packages/services/src/aging/aging.service.ts` |

---

*Phase 14C–14E — hubs y workspace; Phase **16A** — auditoría; Phase **16B** — AP `projectId` nullable + `AccountMovement.projectId`; Phase **16C** — UI AP empresa `/finanzas` (hecho).*
