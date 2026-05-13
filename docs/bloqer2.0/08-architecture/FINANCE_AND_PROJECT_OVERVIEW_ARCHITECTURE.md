# Finanzas globales, overview por proyecto y plan de indicadores (Phase 14C–14E)

Este documento **audita el estado actual** (rutas + Prisma + servicios) y define **arquitectura objetivo** sin implementar un módulo nuevo de gastos generales. Las reglas de implementación siguen siendo: **sin Prisma en `apps/web`**, datos solo desde **`@bloqer/services`**, **RBAC `can()`**, **tenant module gates**, **sin inventar métricas**.

Relacionado: [`TENANT_DASHBOARD_ARCHITECTURE.md`](./TENANT_DASHBOARD_ARCHITECTURE.md) (tablero tenant), [`PERMISSIONS_ROUTE_MATRIX.md`](./PERMISSIONS_ROUTE_MATRIX.md).

---

## 1. Auditoría — respuestas directas

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

- **Hub financiero global** más allá de aging — ver 1.4.
- **Gastos generales sin obra** / entidad `Expense` — ver 1.5 y §7 (pendiente de producto).

### 1.3 ¿Existe `/proyectos/[id]/finanzas`?

**Sí (Phase 14E).** Página `apps/web/app/(app)/proyectos/[id]/finanzas/page.tsx` y servicio **`getProjectFinanceOverview(ctx, projectId)`** en `packages/services/src/project-finance/project-finance-overview.service.ts`. Orquesta aging AR/AP con filtro `projectId` cuando el rol tiene `VIEW AR` / `VIEW AP`; si el acceso es solo vía `canViewArProjectArea` / `canViewApProjectArea` (p. ej. `VIEW PROJECTS` sin `VIEW AR`), agrega saldos por moneda desde los listados por proyecto **sin** mezclar monedas en un solo total. No llama a `getProjectCostControl` completo.

### 1.4 ¿Existe una visión global financiera “real” en `/finanzas`?

**Mejorada (Phase 14C+).** La página usa **`getFinanceHubOverview(ctx)`** (`packages/services/src/finance/finance-hub-overview.service.ts`): cards de saldo abierto CxC/CxP reutilizando **`getReceivableAgingReport` / `getPayableAgingReport`**, card de tesorería con **`getTreasurySummaryByCompany`**, enlaces a aging y reportes de tesorería, empty states por módulo deshabilitado o sin permiso. **No** duplica fórmulas de cost-control ni project-cash-flow. Contabilidad global en el hub queda **pendiente** (opcional futuro `accounting-insights`).

### 1.5 ¿Cómo se registran hoy gastos “sin proyecto”?

- **AR / AP “clásicos” (factura → cuenta por cobrar/pagar → cobro/pago):** el modelo Prisma **exige `projectId`** en `SalesInvoice`, `Receivable`, `Collection`, `SupplierInvoice`, `Payable`, `Payment`, `PurchaseOrder`, etc. Los servicios de alta (`supplier-invoice.service`, flujos AR) **resuelven `companyId` vía proyecto**. **No** hay hoy un flujo productizado de “factura de gasto general sin obra” en esas entidades.
- **Tesorería:** `AccountMovement` **no tiene** columna `projectId`; el vínculo con negocio es **`sourceType` + `sourceId`** (p. ej. cobro/pago genera movimiento). Movimientos “sueltos” o transferencias pueden existir **sin** obra explícita a nivel fila.
- **Contabilidad:** `JournalEntry.projectId` y `JournalEntryLine.projectId` son **opcionales** (`String?`). Un **asiento manual** puede representar gasto de estructura **sin** proyecto (subject a reglas de negocio y permisos `ACCOUNTING`).

Conclusión operativa: **gasto general sin obra** hoy se acerca por **asientos contables** y/o **movimientos de tesorería no etiquetados por proyecto**, no por C×P estándar con `projectId` null (no permitido por schema).

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
| `SupplierInvoice`, `Payable`, `Payment`, `PurchaseOrder`, `PurchaseReceipt` | Cadena AP / compras amarrada a obra |
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
| Hub finanzas empresa (14C+) | `getFinanceHubOverview` | Composición sobre aging + tesorería |

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

**Implementación (Phase 14C+):** ver `getFinanceHubOverview` + `FinanceHubView` en `apps/web/features/finance/`.

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
- [x] Rediseño `/finanzas` overview global (servicio + UI) — **v1** con `getFinanceHubOverview`.
- [x] `layout.tsx` bajo `[id]` + navegación de proyecto (Phase **14D** subnav horizontal → **15A** sidebar workspace).
- [x] `/proyectos/[id]/finanzas` (página + servicio orquestador) — **Phase 14E**.
- [x] Resumen `/proyectos/[id]` — **Phase 15B** (`getProjectOverviewDashboard` + `ProjectOverviewView`).
- [ ] Producto: ¿nullable `projectId` en `SupplierInvoice` / `SalesInvoice` / `Receivable` / `Payable`?
- [ ] Producto: ¿`projectId` en `AccountMovement` o tabla puente?
- [ ] Documentar en `OPEN_QUESTIONS.md` si se abre debate BR-AR-003 / gastos generales AP.

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

*Phase 14C–14E — auditoría + arquitectura; hubs `/finanzas` (empresa) y `/proyectos/[id]/finanzas` (obra); layout proyecto con subnav; sin schema nuevo ni entidad Expense.*
