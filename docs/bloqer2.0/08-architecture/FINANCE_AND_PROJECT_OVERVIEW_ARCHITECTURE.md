# Finanzas globales, overview por proyecto y plan de indicadores (Phase 14C–14D)

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
| Costos / flujo | `/control-costos`, `/control-costos/[wbsNodeId]`, `/flujo-caja` |
| Operativa | `/subcontratos`, `/nuevo`, `/[subcontractId]`, `/editar`, certificaciones de subcontrato, `/libro-obra`, `/nuevo`, `/[logId]`, `/[logId]/editar`, `/inventario`, `/consumos/nuevo`, `/documentos`, `/nuevo`, `/[documentId]` |

La **ficha** `/proyectos/[id]` conserva atajos en botones; la **navegación principal entre secciones** es la subnav del layout. Rutas como OC, recepciones, consumos, detalle de facturas siguen enlazadas desde listas o CTAs internos.

### 1.2 ¿Qué rutas faltan para una experiencia “completa”?

- **`/proyectos/[id]/finanzas`** — no existe; hoy la información financiera del proyecto está **dispersa** en C×C, cobranzas, facturas proveedor, C×P, pagos, flujo de caja y control de costos (**Phase 14E** propuesta).
- **Hub financiero global** más allá de aging — ver 1.4.

### 1.3 ¿Existe `/proyectos/[id]/finanzas`?

**No.** No hay carpeta ni página con ese segmento.

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

Cada **`/proyectos/[id]/...`** debería poder resumirse en **`/proyectos/[id]/finanzas`** como **hub de solo lectura** (o con CTAs a mutaciones existentes):

| Bloque | Servicio / ruta existente | Notas |
|--------|---------------------------|--------|
| CxC / cobranzas | Rutas bajo `[id]/cuentas-por-cobrar`, `cobranzas`; aging con `projectId` | Ya filtrable |
| CxP / pagos | `[id]/cuentas-por-pagar`, `pagos`, facturas proveedor | Ya existente |
| Flujo de caja proyecto | `getProjectCashFlowReport` + `/flujo-caja` | No reimplementar |
| Presupuesto vs real | `getProjectCostControl` + `/control-costos` | No reimplementar |
| Certificaciones / compras / subcontratos | Enlaces a módulos ya implementados | Solo navegación |
| Inventario en obra | `/inventario`, consumos | Ya existe |

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

## 6. Navegación interna de proyecto (subnav)

### 6.1 Layout (Phase 14D)

- **`apps/web/app/(app)/proyectos/[id]/layout.tsx`** — envuelve **todas** las rutas bajo `[id]`; obtiene **`getProjectShellInfo(id, ctx)`** (`packages/services/src/project/project.service.ts`: `id`, `name`, `code`, `status`, validación tenant + **`canAccessProjectLayout`**) y **`getTenantModuleGate(ctx)`** en paralelo.
- **Errores:** `ServiceError` **`NOT_FOUND`** → `notFound()`; **`FORBIDDEN`** → `redirect("/dashboard")` (mismo criterio que otras rutas app).
- **Cabecera:** nombre + `ProjectStatusBadge` + código; enlace “← Proyectos”.
- **Subnav:** `ProjectSubnav` con ítems de **`buildProjectSubnavLinks`** (sin rutas muertas).

### 6.2 Ítems visibles hoy (`buildProjectSubnavLinks`)

Cada fila solo aparece si el **módulo tenant** está habilitado (`gate.isEnabled`) **y** el rol cumple el permiso / helper indicado.

| Label | Ruta | Módulo gate (tenant) | Permiso / helper |
|-------|------|----------------------|------------------|
| Resumen | `/proyectos/[id]` | — | `VIEW PROJECTS` |
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

**Rutas existentes no incluidas en la subnav** (siguen por enlaces contextuales o menús internos): recepciones, consumos, detalles de facturas/OC/certificados, etc.

### 6.3 Ocultas / futuras (no link en subnav hasta nueva página)

| Label aspiracional | Ruta | Notas |
|--------------------|------|--------|
| Finanzas (hub proyecto) | **`/proyectos/[id]/finanzas`** | **Phase 14E** sugerida — consolidar C×C, cobranzas, AP, flujo y costos en un hub de solo lectura. |
| Cronograma | **`/proyectos/[id]/cronograma`** | Sin página. |
| Reportes (proyecto) | **`/proyectos/[id]/reportes`** | Sin página; hoy reportes clave = **Flujo de caja** y **Control de costos** con rutas propias. |
| WBS dedicado | ruta propia | Hoy WBS vive en **Presupuesto** y **Control de costos**; no se duplica link con la misma URL que presupuesto. |

### 6.4 Componentes

- **`apps/web/features/projects/project-subnav.tsx`** — cliente (`usePathname`); **Resumen** activo con match exacto de `href`; demás ítems activos con `pathname === href` o prefijo `href/`; si `items.length === 0` no renderiza nav.
- **`apps/web/features/projects/project-subnav-config.ts`** — **`buildProjectSubnavLinks(projectId, gate, roles)`**.

---

## 7. Pendientes explícitos (backlog)

- [ ] `getProjectFinanceOverview` (o nombre alineado) en `packages/services`.
- [x] Rediseño `/finanzas` overview global (servicio + UI) — **v1** con `getFinanceHubOverview`.
- [x] `layout.tsx` bajo `[id]` + reutilizar `ProjectSubnav` en todas las páginas hijas (Phase **14D**).
- [ ] `/proyectos/[id]/finanzas` (página + servicio delgado) — **Phase 14E**.
- [ ] Producto: ¿nullable `projectId` en `SupplierInvoice` / `SalesInvoice` / `Receivable` / `Payable`?
- [ ] Producto: ¿`projectId` en `AccountMovement` o tabla puente?
- [ ] Documentar en `OPEN_QUESTIONS.md` si se abre debate BR-AR-003 / gastos generales AP.

---

## 8. Referencias de código auditadas

| Área | Path principal |
|------|----------------|
| Rutas proyecto | `apps/web/app/(app)/proyectos/**` |
| Rutas finanzas | `apps/web/app/(app)/finanzas/**` |
| Hub finanzas (servicio) | `packages/services/src/finance/finance-hub-overview.service.ts` |
| Hub finanzas (UI) | `apps/web/features/finance/finance-hub-view.tsx` |
| Subnav + layout proyecto | `apps/web/app/(app)/proyectos/[id]/layout.tsx`, `apps/web/features/projects/project-subnav.tsx`, `project-subnav-config.ts` |
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

*Phase 14C–14D — auditoría + arquitectura; hub `/finanzas`; layout `/proyectos/[id]` con subnav compartida y `getProjectShellInfo`; sin schema nuevo.*
