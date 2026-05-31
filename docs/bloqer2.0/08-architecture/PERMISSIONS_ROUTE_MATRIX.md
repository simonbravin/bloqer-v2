# Permissions & route matrix (Phase 7A–12D)

Source of truth for role ceilings: [`docs/bloqer2.0/00-product/PERMISSIONS_MATRIX.md`](../00-product/PERMISSIONS_MATRIX.md) and `packages/domain/src/permissions/matrix.ts`.

Phase **12C (pass 1):** además de `can()`, los **servicios** listados bajo “Tenant module gate (services)” llaman `assertTenantModuleEnabled` vía `tenant-module-enforcement.ts` **antes** de validar rol, para deep links y APIs coherentes con la navegación.

Phase **12D:** reportes multi-módulo (`project-cash-flow`, `cost-control`) y mutaciones en `document.service` usan `getTenantModuleGate` / `assertTenantModuleEnabledWithGate` según política en la tabla “Phase 12D — implemented”; exclusiones parciales con `sectionsExcluded` / `warnings.sectionsExcluded`. Sin gate global en lecturas de documentos.

Phase **13E:** auditoría Prisma/ERD documentada en [`PRISMA_ERD_AUDIT.md`](./PRISMA_ERD_AUDIT.md) (sin cambios de schema en esa fase). Phase **13F:** cierre de decisiones RBAC/módulos en esta matriz + [`PERMISSIONS_MATRIX.md`](../00-product/PERMISSIONS_MATRIX.md) + [`SECURITY_ARCHITECTURE.md`](./SECURITY_ARCHITECTURE.md). Phase **13G:** gate de módulo tenant **`JOBSITE_LOG`** en `jobsite-log.service.ts` (antes de `can()`), alineado a mutaciones de documentos enlazados a libro de obra. Phase **14A:** ruta **`/onboarding`** — wizard de alta del primer tenant (sin shell lateral); acceso solo usuario autenticado sin membresía ACTIVE (redirección desde layout `(app)`); sin permisos RBAC de tenant previos; superadmin de plataforma sin tenant no es forzado a onboarding. Phase **14B:** ruta **`/dashboard`** — tablero ejecutivo; datos vía `getTenantDashboard` en servicios (gates + `can()` por sección); ver [`TENANT_DASHBOARD_ARCHITECTURE.md`](./TENANT_DASHBOARD_ARCHITECTURE.md). Phase **15C:** misma ruta y servicio; la página compone bloques adicionales (header con accesos rápidos derivados de `quickActions`, distribución de estados de proyecto, finanzas con barras por moneda) sin cambiar reglas de permisos ni de módulos. Phase **14C:** auditoría finanzas/proyecto/tesorería + plan de indicadores y overviews — ver [`FINANCE_AND_PROJECT_OVERVIEW_ARCHITECTURE.md`](./FINANCE_AND_PROJECT_OVERVIEW_ARCHITECTURE.md). Phase **16A (solo doc):** mismo documento — auditoría **Finanzas Empresa**. Phase **16B:** migración + modelo AP nullable + `AccountMovement.projectId` — detalle en [`FINANCE_AND_PROJECT_OVERVIEW_ARCHITECTURE.md`](./FINANCE_AND_PROJECT_OVERVIEW_ARCHITECTURE.md) §16B; matriz RBAC sin cambios hasta **16C** (nuevas rutas de alta corporativa).

AR project gates: `packages/services/src/ar/ar-access.ts` (`canViewArProjectArea`, `canEditArArea`).

Project-scoped access (same tenant, correct `projectId`) is enforced in services, not in `can()`.

## Top-level shell (`apps/web/lib/nav-config.ts`)

| Label        | Route          | Visible when (`VIEW` unless noted)        |
|-------------|----------------|-------------------------------------------|
| Inicio      | `/dashboard`   | Always (authenticated app shell)          |
| Proyectos   | `/proyectos`     | `PROJECTS` **and** tenant module `PROJECTS` enabled |
| Directorio  | `/directorio`    | `DIRECTORY` **and** tenant module `DIRECTORY` enabled |
| Inventario  | `/inventario`    | `INVENTORY` **and** tenant module `INVENTORY` enabled |
| Tesorería   | `/tesoreria`     | `TREASURY` **and** tenant module `TREASURY` enabled |
| Contabilidad | `/contabilidad` | `ACCOUNTING` **and** tenant module `ACCOUNTING` enabled |
| Finanzas    | `/finanzas`      | (`AR` **or** `AP` **or** `TREASURY` **or** `ACCOUNTING`) **and** tenant module enabled for the branch the user satisfies (Phase **16D** shell; **16E** subnav bajo `/finanzas/**`) |
| Configuración | `/configuracion` | (`TENANT_SETTINGS` **or** `USERS_PERMISSIONS`) **and** tenant module enabled for that branch |

Phase **12B:** si no existe fila en `tenant_module_settings` para un `moduleKey`, el módulo se considera **habilitado** (compatibilidad). Los usuarios del tenant **no** editan estos flags; solo la consola de plataforma (`/platform/tenants/[tenantId]/modules`).

## Tenant module gate — service layer (Phase 12C pass 1)

| URL / functional area | Primary `PermissionModule` (RBAC) | Tenant module enforced in services |
|-----------------------|-----------------------------------|-------------------------------------|
| `/contabilidad/**`, cuentas/asientos/reglas, `journal-entry*`, `accounting-account`, `accounting-mapping`, `accounting-suggestions`, `journal-entry-source-link` | `ACCOUNTING` | `ACCOUNTING` |
| `/tesoreria/**`, `treasury-account`, `account-movement`, `internal-transfer`, `balance.getTreasurySummaryByCompany` | `TREASURY` | `TREASURY` |
| Reportes tesorería (`treasury-reports`) | `TREASURY` | `TREASURY` |
| Facturas venta, CxC, cobranzas (`sales-invoice`, `receivable`, `collection.service`) | `AR` | `AR` |
| Facturas proveedor, CxP, pagos (`supplier-invoice`, `payable`, `payment`) | `AP` | `AP` |
| Aging CxC / CxP (`aging.service`) | `AR` / `AP` | `AR` / `AP` |
| **`getTenantDashboard`** (`tenant-dashboard.service.ts`) | Por sección: `VIEW PROJECTS`, `VIEW BUDGETS`, `VIEW AR`/`AP`/`TREASURY`/`INVENTORY`, etc. | **Composite:** una llamada `getTenantModuleGate`; cada subconsulta respeta el mismo módulo + RBAC que el servicio subyacente (Prisma solo en capa servicios). |
| **`getFinanceHubOverview`** (`finance-hub-overview.service.ts`) | `VIEW AR` / `VIEW AP` / `VIEW TREASURY` / `VIEW ACCOUNTING` + módulos tenant correspondientes | **Composite:** `getTenantModuleGate` + aging AR/AP y `getTreasurySummaryByCompany`; bloque contabilidad solo enlace (sin agregados GL); `FORBIDDEN` → datos omitidos. |
| `/inventario/**`, productos, depósitos, movimientos, transferencias, `inventory-reports` | `INVENTORY` | `INVENTORY` |
| Órdenes de compra y recepciones (`purchase-order`, `purchase-receipt`) | `PROCUREMENT` | `PROCUREMENT` |
| Subcontratos y certificaciones (`subcontract`, `subcontract-certification`) | `SUBCONTRACTS` | `SUBCONTRACTS` |
| Libro de obra (`jobsite-log.service` — list/get/picklists/WBS helper, crear/editar/enviar/aprobar/devolver/cancelar) | `VIEW`/`EDIT` `JOBSITE_LOG` **o** atajo `PROJECTS` (sin cambio de matriz) | **`JOBSITE_LOG`** (Phase **13G**) — `assertJobsiteLogTenantModule` **antes** de chequeos `can()`; mismo `ServiceError` que 12C si el módulo está deshabilitado |

## Tenant module gate — cross-module reports & documents (Phase 12D)

| Service / area | Primary `PermissionModule` (RBAC) | Tenant module enforced in services |
|----------------|-----------------------------------|-------------------------------------|
| Project cash flow (`getProjectCashFlowReport`) | `VIEW PROJECTS` **or** `VIEW AR` **or** `VIEW AP` **or** `VIEW TREASURY` | **`PROJECTS`** (bloqueo si off). Cobranzas solo si **`AR`**; pagos solo si **`AP`**. Si ambos off: reporte vacío + `warnings.sectionsExcluded` (no error). **`TREASURY`** no requerido para este reporte. |
| Project cost control (`getProjectCostControl`, `getWbsItemCostDetail`) | `VIEW PROJECTS` **or** `VIEW BUDGETS` | **`PROJECTS`** + **`BUDGETS`** (bloqueo si off). Capas omitidas + `sectionsExcluded` si CERTIFICATIONS / PROCUREMENT / SUBCONTRACTS / AP / INVENTORY / JOBSITE_LOG off (consultas condicionales). |
| `document.service` — mutaciones (create/initiate/confirm/archive/restore/delete) | RBAC por `linkedEntityType` (sin cambio) | **`linkedEntityType`** → módulo: `PROJECT`→`PROJECTS`, `BUDGET`→`BUDGETS`, `CERTIFICATION`→`CERTIFICATIONS`, `JOBSITE_LOG`→`JOBSITE_LOG`, `SUPPLIER_INVOICE`→`AP`, `PURCHASE_ORDER`/`PURCHASE_RECEIPT`→`PROCUREMENT`, `SUBCONTRACT`/`SUBCONTRACT_CERTIFICATION`→`SUBCONTRACTS`. **Lecturas/listados/download:** sin gate global; `DocumentAttachmentView.disabledLinkedModule` + `canMutate` false si módulo off. |

**Still no tenant module gate:** `listNegativeStockBalancesForTenant` (operational alerts).

## Phase 12D — implemented policies (cross-module)

| Área | Policy |
|------|--------|
| **Project cash flow** | Base **`PROJECTS`**. Inflows/collections si **`AR`**; outflows/payments si **`AP`**; ambos off → vacío + structured warnings. |
| **Cost control** | Base **`PROJECTS`** + **`BUDGETS`**. Reporte parcial: excluir capas según módulo off + `sectionsExcluded` + `warnings` texto. |
| **Documents** | Sin gate global en reads; mutaciones bloqueadas por módulo mapeado; biblioteca de proyecto sigue mostrando histórico. |
| **Operational alerts** | Stock negativo sin gate. |

Removed dead links: `/compras`, `/reportes` (no routes in App Router). **`/configuracion`** is implemented (Phase 10B–10C — tenant settings, team, invitations; not the platform shell).

## SaaS trial onboarding (Phase 14A)

| Route | Access | Notes |
|-------|--------|-------|
| `/onboarding` | Authenticated **NextAuth** session; user must **not** have `UserMembership` with `status=ACTIVE` (server check en página + servicio) | Wizard sin sidebar: crea `Tenant` (trial 30 días), `Company`, membresía **OWNER** + `TenantModuleSetting` para todos los `OVERVIEW_MODULES`. Usuario con membresía ACTIVE → redirect `/dashboard`. Superadmin de plataforma sin tenant **no** es redirigido aquí desde `(app)` (puede usar `/platform`). Server Action + `completeTrialOnboarding` en `@bloqer/services`; validación Zod en `@bloqer/validators`. |

## Tenant dashboard (Phase 14B + 15C UI)

| Route | Access | Notes |
|-------|--------|-------|
| `/dashboard` | Authenticated; **active tenant membership** (`buildTenantServiceContext` no nulo) para cargar datos | Server Component: `getTenantDashboard(ctx)` — cada bloque condicionado por **tenant module** + **`can()`** (p. ej. `VIEW PROJECTS`, `VIEW BUDGETS`, `VIEW AR`/`AP`/`TREASURY`/`INVENTORY`/`ACCOUNTING`). Sin Prisma en la página. **Superadmin** sin `tenantCtx`: copy + enlace a `/platform` (sin llamar al servicio de tablero). **Phase 15C:** enlaces del encabezado (“Nuevo proyecto”, “Crear contacto”, etc.) solo se renderizan si el `href` corresponde a una entrada ya filtrada en `quickActions` del servicio (misma fuente de verdad que permisos/módulos). |

## Finance hub empresa (Phase 14C+ / 16D / 16E)

Las rutas bajo **`/finanzas/**`** comparten layout: subnav filtrada por módulo tenant + `can()` (**16E**); datos del resumen vía **`getFinanceHubOverview`** (**16D**).

| Route | Access | Notes |
|-------|--------|-------|
| `/finanzas` | Authenticated; `buildTenantServiceContext` no nulo | **Layout** `app/(app)/finanzas/layout.tsx`: **`getFinanceSubnavLinks(ctx)`** (`getTenantModuleGate` + `can()` por ítem) + **`FinanceSubnav`**. **Resumen:** **`getFinanceHubOverview(ctx)`** — CxC/C×P/Tesorería/Contabilidad según módulo + `VIEW AR` / `VIEW AP` / `VIEW TREASURY` / `VIEW ACCOUNTING`. **16D:** DTO multimoneda + split AP en aging. **16E:** polish UI + copy. Reutiliza aging AR/AP + `getTreasurySummaryByCompany`. Sin Prisma en páginas. **16C:** rutas corporativas AP. |
| `/finanzas/facturas-proveedor`, `/finanzas/facturas-proveedor/nueva`, `/finanzas/facturas-proveedor/[invoiceId]` | Authenticated; tenant module **AP** | Servicios: `listCompanySupplierInvoices`, `getCompanySupplierInvoiceById`, `createSupplierInvoice` / `issue` / `cancel` (sin `projectScopeId`). **Lecturas y listados corporativos: solo `VIEW AP`** (`canViewCompanyAp` en servicios) — **no** alcanza solo `VIEW PROJECTS`. Mutaciones alta/emisión/anulación: `EDIT AP`. Adjuntos: `EntityDocumentsPanel` alcance `company-finanzas-supplier-invoice` + `listEntityDocuments` sin `projectId`. |
| `/finanzas/gastos-generales`, `/finanzas/gastos-generales/nueva` | Same | **Phase 17B:** asistente UX + alta reutilizando `SupplierInvoiceForm` / `createCompanySupplierInvoiceAction`. **`/gastos-generales`:** `VIEW AP`. **`/nueva`:** `EDIT AP` (redirige al asistente si solo lectura). |
| `/finanzas/cuentas-por-pagar`, `/finanzas/cuentas-por-pagar/[payableId]`, `/finanzas/cuentas-por-pagar/[payableId]/pagar` | Same | `listCompanyPayables`, `getCompanyPayableById`, `createPayment` sin `projectScopeId`; mismos gates **VIEW AP** / **EDIT AP**. |
| `/finanzas/pagos-proveedor/[paymentId]` | Same | `getCompanyPaymentById`; cancel pago `EDIT AP`; contabilidad draft igual que pago proyecto (`EDIT ACCOUNTING`). |

## In-app notifications (Phase 8A–8D)

| Route | Access | Notes |
|-------|--------|-------|
| `/notificaciones` | Authenticated user with active tenant membership | Personal inbox only; **not** gated on `VIEW NOTIFICATIONS` |
| `/notificaciones/alertas` | **OWNER** or **ADMIN** on active tenant membership (`canRunOperationalAlerts`) | Manual operational alert runner; others get `notFound()` |
| `/api/cron/operational-alerts` | **No session.** Valid `CRON_SECRET` via `Authorization: Bearer` or `x-cron-secret` | Server-to-server / Vercel Cron; optional `?tenantId=` (UUID, ACTIVE only); respuesta agregada sin PII ([`NOTIFICATIONS_ARCHITECTURE.md`](./NOTIFICATIONS_ARCHITECTURE.md)) |
| `/api/cron/scheduled-reports` | **No session.** Mismo `CRON_SECRET` | Vercel Cron horario; envíos programados `REPORT_SCHEDULED` ([`SCHEDULED_REPORTS_ARCHITECTURE.md`](./SCHEDULED_REPORTS_ARCHITECTURE.md)) |
| Header bell + badge | Same as inbox | Count = `getUnreadNotificationCount` (SSR en layout) |

See [`NOTIFICATIONS_ARCHITECTURE.md`](./NOTIFICATIONS_ARCHITECTURE.md).

## Document attachments (`document.service` — mutación)

| `linkedEntityType`              | Mutate (`canMutateDocumentByLink`)   | Read (`canViewDocumentByLink` after `VIEW PROJECTS` shortcut) |
|--------------------------------|--------------------------------------|------------------------------------------------------------------|
| `PROJECT` / null               | `EDIT PROJECTS`                      | `VIEW PROJECTS` shortcut grants all doc types                  |
| `JOBSITE_LOG`                  | `EDIT JOBSITE_LOG`                   | `VIEW JOBSITE_LOG`                                               |
| `CERTIFICATION`                | `EDIT CERTIFICATIONS`                | `VIEW CERTIFICATIONS`                                            |
| `SUPPLIER_INVOICE`             | `EDIT AP`                            | `VIEW AP`                                                        |
| `PURCHASE_ORDER` / `PURCHASE_RECEIPT` | `EDIT PROCUREMENT`            | `VIEW PROCUREMENT`                                               |
| `SUBCONTRACT` / `SUBCONTRACT_CERTIFICATION` | `EDIT SUBCONTRACTS`   | `VIEW SUBCONTRACTS`                                              |
| `BUDGET`                       | `EDIT BUDGETS`                       | `VIEW BUDGETS`                                                   |
| Other enum values              | Denied                               | Denied (unless `VIEW PROJECTS`)                                  |

## Cross-cutting service gates (Phase 7A fixes)

| Area | Read gate | Notes |
|------|-----------|--------|
| Jobsite log — list / get / form pick lists / WBS helper | `VIEW JOBSITE_LOG` **or** `VIEW PROJECTS` | Además: tenant module **`JOBSITE_LOG`** habilitado (Phase **13G**); protege deep links |
| Jobsite log — create / update / submit / cancel | `EDIT JOBSITE_LOG` **or** `EDIT PROJECTS` | Foreman can contribute; mismo gate de módulo |
| Jobsite log — approve / return | `EDIT PROJECTS` only | Supervisor / PM (matrix: PM has `PROJECTS` `EDIT`); mismo gate de módulo |
| Purchase order / receipt — reads | `VIEW PROCUREMENT` **or** `VIEW PROJECTS` | Aligned with entity document list; `listLinkablePurchaseOrders` / `listProcurementWbsOptions` now gated |
| Supplier invoice / payable / payment — project workspace | `VIEW AP` **or** `VIEW PROJECTS` | Aligned with `SUPPLIER_INVOICE` documents; `projectScopeId` en getters/mutaciones donde aplica (16B.1) |
| Supplier invoice / payable / payment — **Finanzas empresa** (`/finanzas/...`, filas con `projectId` null) | **`VIEW AP` only** | Phase **16C**: sin atajo `VIEW PROJECTS`; servicios `listCompany*`, `getCompany*` + `canViewCompanyAp` |
| Sales invoice / receivable / collection — project-scoped reads | `VIEW AR` **or** `VIEW PROJECTS` | Same pattern as AP project reads (`ar-access.ts`) |
| Sales invoice / receivable cancel / collection create & cancel — mutations | `EDIT AR` only | Owner module `AR` only (Phase 7B); `SALES_COLLECTIONS` removed from domain in Phase 7C |
| Global AP / AR aging (`getReceivableAgingReport`, `getPayableAgingReport`) | `VIEW AP` / `VIEW AR` only | Tenant-wide — **no** `VIEW PROJECTS` |

## Financial reporting scope (Phase 7D)

### Tenant-wide (global) reports

| Report / API | Gate | `VIEW PROJECTS` |
|--------------|------|-----------------|
| AR aging | `VIEW AR` | No |
| AP aging | `VIEW AP` | No |
| Treasury cash position (`getCashPositionReport`) | `VIEW TREASURY` | No |
| Movement ledger (`getAccountMovementReport`) | `VIEW TREASURY` | No |
| Treasury cash flow by period (`getCashFlowReport`) | `VIEW TREASURY` | No |
| Tesorería home (resúmenes) | `VIEW TREASURY` (page guard) | No |

### Project-scoped reports (single `projectId`; queries filter by project + `tenantId`)

| Report / API | Read gate | Notes |
|--------------|-----------|--------|
| `getProjectCashFlowReport` | `VIEW PROJECTS` **or** `VIEW AR` **or** `VIEW AP` **or** `VIEW TREASURY` | `canViewProjectCashFlowReport` en `project-cash-flow.service.ts` |
| `getProjectCostControl`, `getWbsItemCostDetail` | `VIEW PROJECTS` **or** `VIEW BUDGETS` | `canViewProjectCostControlReport` en `cost-control.service.ts` |

### UI

- `/finanzas` y subrutas bajo el mismo layout: hub **`getFinanceHubOverview`** (**16D**) + subnav (**16E**) con enlaces filtrados por módulo + `VIEW AR` / `VIEW AP` / `VIEW TREASURY` / `VIEW ACCOUNTING`; rutas corporativas AP (**16C**).
- `/tesoreria` y `/tesoreria/reportes`: redirect si no `VIEW TREASURY` (deep links).
- `/contabilidad` y subrutas: redirect si no `VIEW ACCOUNTING` (hub, cuentas, asientos, **reglas contables**, detalle). Mutaciones en UI (crear/editar/contabilizar/anular borrador; crear/editar/desactivar reglas) requieren `EDIT ACCOUNTING` (botones condicionales + Server Actions; servicios validan igual).
- **Fase 11C — borrador GL desde documentos:** los botones “Generar asiento contable” / columna Contabilidad en tesorería–movimientos e inventario–movimientos requieren **`EDIT ACCOUNTING`** (además de poder ver la pantalla operativa: proyecto/cobranza, proyecto/pago, `VIEW TREASURY` en reporte movimientos, `VIEW INVENTORY` en movimientos de stock). No crean asientos al confirmar cobranzas/pagos/movimientos; solo bajo acción explícita del usuario. Errores de servicio vuelven con `?contabilidad=` en la URL de origen (solo mensaje de `ServiceError`, sin stack). En **`/contabilidad/**`**, `?empresa=` es **filtro de alcance contable** (UUID validado), no reemplaza la sesión ni el tenant; la autorización sigue siendo membresía + `can()`.
- **Fase 11D — panel “Documento origen” en `/contabilidad/asientos/[journalEntryId]`:** el usuario ya pasó `VIEW ACCOUNTING` para ver el asiento; el enlace profundo al documento operativo (cobranza, pago, movimiento tesorería, transferencia, stock, facturas) solo se muestra si `getJournalEntrySourceLink` confirma el mismo `companyId` del asiento y el rol tiene el **`VIEW`** del módulo destino (AR/AP vía `canViewArProjectArea` / `canViewApProjectArea`, tesorería `VIEW TREASURY`, inventario `VIEW INVENTORY`). Sin mutaciones en el documento origen.
- Detalle de proyecto: botones **Control de costos** / **Flujo de caja** solo si pasan los mismos `can*` exportados por servicios.

**Futuro:** asignación de usuario a proyectos / alcance “solo mis obras” no está modelado; hoy basta `tenantId` + `projectId` en servicio.

## Report exports API (Phase 9A–9B)

| Route pattern | Session | Effective gate |
|---------------|---------|----------------|
| `GET /api/reports/finanzas/ar-aging.csv` | Required (tenant membership → `ServiceContext`) | Same as `getReceivableAgingReport` — **`VIEW AR`** |
| `GET /api/reports/finanzas/ap-aging.csv` | Required | Same as `getPayableAgingReport` — **`VIEW AP`** |
| `GET /api/reports/tesoreria/posicion-caja.csv` | Required | Same as `getCashPositionReport` — **`VIEW TREASURY`** |
| `GET /api/reports/tesoreria/movimientos.csv` | Required | Same as `getAccountMovementReport` — **`VIEW TREASURY`** |
| `GET /api/reports/tesoreria/flujo-caja.csv` | Required | Same as `getCashFlowReport` — **`VIEW TREASURY`** |
| `GET /api/reports/inventario/stock.csv` | Required | Same as `getStockBalanceReport` — **`VIEW INVENTORY`** |
| `GET /api/reports/inventario/movimientos.csv` | Required | Same as `getStockMovementReport` — **`VIEW INVENTORY`** |
| `GET /api/reports/proyectos/[projectId]/control-costos.csv` | Required | Same as `getProjectCostControl` — `canViewProjectCostControlReport` |
| `GET /api/reports/proyectos/[projectId]/flujo-caja.csv` | Required | Same as `getProjectCashFlowReport` — `canViewProjectCashFlowReport` |

- **No** `tenantId` (nor impersonation) via query string; tenant is taken only from the authenticated session.
- **`?format=json`** — mismo payload que la página (donde aplica).
- **`?format=pdf`** — **solo** aging CxC, aging CxP y control de costos (mismos gates que CSV). Resto de rutas bajo `/api/reports/**`: error `VALIDATION` claro (no implementado).
- **`?format` omitido o `csv`** — CSV (9A).

## Report email — Server Action (Phase 9C)

| Action | Session | Effective gate |
|--------|---------|----------------|
| `sendReportEmailAction` (`apps/web/app/(app)/report-email-actions.ts`) | Required → `ServiceContext` from session | **Igual** que la fila correspondiente de `GET /api/reports/**` arriba según `reportType` + `projectId` (control de costos / flujo de caja proyecto exigen `projectId` UUID validado). |

- **No** `tenantId` en el payload del cliente; filtros solo como `params` acotados (Zod) + `projectId` cuando el reporte lo exige.
- **`format: pdf`** solo permitido en servidor para los mismos tres reportes que soportan PDF en 9B; resto → validación.
- **Phase 9D:** cada envío exitoso o fallido queda en `EmailDeliveryLog` (servicio `sendReportByEmail`).

## Email delivery log — admin page (Phase 9D)

| Route | Session | Effective gate |
|-------|---------|----------------|
| `GET /notificaciones/emails` | Required | **`listEmailDeliveryLogs`** — solo **OWNER** / **ADMIN** (`canRunOperationalAlerts`); otros → redirect a `/notificaciones`. |

## Platform superadmin (Phase 10A)

**Not** tenant RBAC. Access = `isPlatformSuperadmin` (**email** in optional `PLATFORM_SUPERADMIN_EMAILS` **OR** active **`PlatformAdmin`**). `OWNER` / `ADMIN` alone does **not** grant these routes.

| Route | Session | Effective gate | Notes |
|-------|---------|----------------|--------|
| `/platform` and `/platform/**` | Required | `isPlatformSuperadmin` | `PlatformShell` + `PageShell`; no access → `redirect("/dashboard")`; login → `/login` |
| `/platform/registro` | Required | Same | `listPlatformAuditLog` — registro global superadmin (actor, acción, tenant, metadata) |
| `/platform/vencimientos` | Required | Same | `listPlatformExpirationAttention` — trials, mora, sin OWNER; acciones `extendPlatformTenantTrial`, `updatePlatformTenantStatus` |
| `/platform/tenants/new` | Required | Same | `provisionPlatformTenant` — tenant trial + company + invitación OWNER |
| `/platform/tenants/[tenantId]/invitations/**` | Required | Same | `createPlatformTenantInvitation`, `cancelPlatformTenantInvitation`; aceptación pública `/invitaciones/aceptar` |
| Server Actions `platform-actions.ts`, `platform-invitation-actions.ts`, `platform-provision-actions.ts` | Required | Same via `assertPlatformAccess` | Mutations append **`PlatformAuditLog`** |

*App Router:* páginas bajo `apps/web/app/(platform)/platform/` — el segmento `(platform)` es route group (no URL); el prefijo URL `/platform` viene de la carpeta `platform/`.

See [`PLATFORM_SUPERADMIN_ARCHITECTURE.md`](./PLATFORM_SUPERADMIN_ARCHITECTURE.md).

## Tenant configuration & team (Phase 10B–10C)

En **shell de app** (no `/platform`). No usa `PlatformAdmin`; solo RBAC por membresía.

| Route | Session + tenant | Read | Mutate |
|-------|------------------|------|--------|
| `/configuracion` | Requiere membresía activa | `VIEW TENANT_SETTINGS` **or** `VIEW USERS_PERMISSIONS` | `EDIT TENANT_SETTINGS` solo para formulario de nombre / timezone / moneda base |
| `/configuracion/equipo` | Idem | Idem read | — |
| `/configuracion/equipo/invitar` | Idem | Idem read (solo navegación) | `EDIT USERS_PERMISSIONS` — crear invitación |
| `/configuracion/equipo/invitaciones/[invitationId]` | Idem | Idem read | `EDIT USERS_PERMISSIONS` — cancelar invitación **PENDING** |
| `/configuracion/equipo/[membershipId]` | Idem | Idem read | `EDIT USERS_PERMISSIONS` para roles y estado `ACTIVE`/`INACTIVE` |
| `/configuracion/permisos` | Idem | Idem read (matriz solo lectura `buildPermissionMatrixGrid`) | Notas por módulo: `EDIT USERS_PERMISSIONS` **o** `EDIT TENANT_SETTINGS` (persistencia `Tenant.permissionMatrixNotes`, ADR-Phase1-05) |
| `/configuracion/reportes`, `/configuracion/reportes/nuevo`, `/configuracion/reportes/[id]` | Idem | **OWNER** o **ADMIN** (`canManageScheduledReports`) | CRUD envíos programados (Phase 17B); sin cron |
| `/proyectos/[id]/reportes/programados` | Idem proyecto | **OWNER** o **ADMIN** | Listado filtrado por `projectId`; alta vía `/configuracion/reportes/nuevo?scope=PROJECT&projectId=` |
| `/invitaciones/aceptar` | **Pública** (sin sesión: mensaje + login); con sesión: aceptar con token | Invitación válida (`peek` por token) | Aceptación: usuario autenticado cuyo **email** coincide con la invitación |

- **Protección dominio:** no dejar el tenant **sin** al menos un miembro **ACTIVE** con rol **OWNER** si ya había uno antes del cambio (simulación sobre membresías activas). Desactivar al único OWNER activo queda bloqueado. **Aceptar invitación** respeta el mismo invariante al activar/reactivar membresía.
- **Concurrencia:** dos mutaciones simultáneas (equipo o aceptar invitación) podrían, en teoría, violar el invariante entre lectura y escritura; mitigación completa requeriría bloqueo transaccional fuerte (no implementado).
- **Invitaciones (10C):** `tenantId` solo desde `ServiceContext`; token crudo nunca en DB (solo `sha256`); sin bypass superadmin de plataforma en flujo tenant.
- **Schema:** Phase 10C agrega `tenant_invitations` + enum; migraciones manuales / deploy — **sin** `db:push` en el proceso documentado.
- **Servicios:** `packages/services/src/tenant-settings/*` incl. `tenant-invitations.service.ts`; mutaciones con `audit.service` `log()`.

## Phase 12A — RBAC audit snapshot (2026-05)

### Findings (aligned; no code regressions required)

- **Roles:** `OWNER`, `ADMIN`, `FINANCE`, `PROCUREMENT`, `WAREHOUSE`, `SALES`, `VIEWER`, `PROJECT_MANAGER`, `SITE_FOREMAN`, `PROJECT_VIEWER` — todos definidos en `packages/domain/src/permissions/roles.ts` y presentes en `MATRIX` (`matrix.ts`). La UI de matriz de permisos (`matrix-overview` + `/configuracion/permisos`) usa el subconjunto `OVERVIEW_ROLES` (incluye `PROJECT_VIEWER`).
- **Top-level nav** (`MAIN_NAV_DEF`): cada ítem con `require` mapea a un `can(VIEW, …)` real **y** (Phase **12B**) disponibilidad del módulo para el tenant (`getTenantModuleGate`); **Inicio** sin `require` (cualquier usuario con shell de app). Módulos operativos bajo **proyecto** (certificaciones, compras, subcontratos, facturas, etc.) **no** tienen ítem de primer nivel; el acceso pasa por `VIEW PROJECTS` y gates por servicio — **12C** recomienda extender el gate a esos servicios.
- **Plataforma** (`/platform/**`): solo `isPlatformSuperadmin` (email en `PLATFORM_SUPERADMIN_EMAILS` y/o `PlatformAdmin`); **nunca** se infiere desde `OWNER`/`ADMIN` del tenant. El enlace “Plataforma” en el header es condicional; el layout de app no mezcla checks.
- **AR / AP en proyecto:** lecturas usan `canViewArProjectArea` / `canViewApProjectArea` (`VIEW AR|PROJECTS` / `VIEW AP|PROJECTS`) en `ar-access.ts` / `ap-access.ts`. Mutaciones AR usan `EDIT AR` (u otras reglas del servicio). Coherente con la matriz producto.
- **Tesorería / contabilidad / inventario / aging global:** gates con `VIEW`/`EDIT` de `TREASURY`, `ACCOUNTING`, `INVENTORY`, `AR`, `AP` según el reporte; sin atajos incorrectos detectados en 12A.
- **Documentos:** `document.service` alinea `canViewDocumentByLink` / `canMutateDocumentByLink` con `PERMISSIONS_MATRIX` y `linkedEntityType`.
- **Módulos en `PermissionModule` sin `can(…, módulo)` todavía en servicios** (reservados / matriz documental): entre otros `CLIENTS`, `SUPPLIERS`, `SUBCONTRACTORS` (frente a `DIRECTORY` unificado en operación), `CONTRACTS`, `CHANGE_ORDERS`, `RFIS`, `PURCHASE_ORDERS` (frente a `PROCUREMENT` en gates), `WAREHOUSES`, `BANK_ACCOUNTS`, `BANK_RECONCILIATION`, `EXPENSES_PAYMENTS`, `INTERNAL_TRANSFERS` (frente a `TREASURY` en muchas rutas), `TAXES`, `NOTIFICATIONS` (el inbox no exige `VIEW NOTIFICATIONS` a propósito), `MASTER_DATA`, `AUDIT`, `BILLING` — ver §2.2.1 y “Remaining RBAC decisions” en `PERMISSIONS_MATRIX.md`. **`SCHEDULE`:** implementado en `/proyectos/[id]/cronograma` (`canViewScheduleArea` / `canEditScheduleArea`, gate tenant `SCHEDULE`).
- **Diferencia de patrón (no bug):** `certification.service` exige `VIEW`/`EDIT`/`APPROVE` **CERTIFICATIONS** sin atajo `VIEW PROJECTS` en la primera comprobación; otras áreas (libro de obra, documentos) usan `OR VIEW PROJECTS`. Coherente con módulo explícito de certificaciones; quien solo tuviera `VIEW PROJECTS` sin `CERTIFICATIONS` hoy quedaría fuera (ningún rol predefinido en `matrix.ts` tiene solo `PROJECTS` sin `CERTIFICATIONS` donde importe — p. ej. `WAREHOUSE` no ve certificaciones, alineado a producto).

### `PermissionModule` strings that appear in `can(ctx.roles, …)` in `packages/services` (Phase 12A)

`PROJECTS`, `DIRECTORY`, `BUDGETS`, `CERTIFICATIONS`, `JOBSITE_LOG`, `PROCUREMENT`, `SUBCONTRACTS`, `AP`, `AR`, `INVENTORY`, `TREASURY`, `ACCOUNTING`, `USERS_PERMISSIONS`, `TENANT_SETTINGS`.

(Operative alerts usan `can` con módulos dinámicos según el tipo de alerta.)

## Phase 12B — Tenant enabled modules (foundation)

- **Modelo:** `TenantModuleSetting` (`tenantId`, `moduleKey` string validado contra `PermissionModule` / `OVERVIEW_MODULES`, `isEnabled`, `internalNotes`, único `(tenantId, moduleKey)`).
- **Semántica:** **permiso de rol (`can`) ≠ módulo habilitado.** El usuario necesita **ambos** para ver ítems de nav de primer nivel que comprueban el flag. Sin fila en DB ⇒ módulo **habilitado** (no rompe tenants existentes).
- **Servicios:** `getTenantModuleGate`, `getTenantEnabledModules`, `isTenantModuleEnabled`, `assertTenantModuleEnabled`, `assertTenantModuleEnabledWithGate`; mutación **`updateTenantModuleSetting`** solo con `PlatformServiceContext` (`assertPlatformAccess`).
- **UI app:** `(app)/layout.tsx` pasa el gate al sidebar vía `filterMainNav(roles, { isTenantModuleEnabled })`. **Inicio** y enlace **Plataforma** no usan flags de tenant.
- **UI plataforma:** `/platform/tenants/[tenantId]/modules` — lista por módulo, notas internas, auditoría `platform.tenant.module_updated`.
- **Phase 12C (recomendado):** aplicar el gate en **servicios** por rutas/módulos críticos (evitar deep links si el módulo está deshabilitado); no intentado en bloque en 12B. **Phase 13G:** `jobsite-log.service` incluido (`JOBSITE_LOG`).
- **Catálogo en consola:** la UI lista **todos** los `OVERVIEW_MODULES` / `PermissionModule` con etiqueta; **ningún** módulo está excluido en código del listado (12B). Operativamente, deshabilitar ciertos keys (p. ej. `USERS_PERMISSIONS`) puede ser delicado — decisión de producto/superadmin, no hardcoded en esta fase.

## Pending / follow-up (product or later engineering)

- Sub-routes under `/proyectos/[id]/*` rely on services; libro de obra (`jobsite-log.service`) tiene gate de módulo **`JOBSITE_LOG`** (Phase **13G**); otras ramas según 12C/12D.
- **Phase 14D / 15A — layout proyecto:** `apps/web/app/(app)/proyectos/[id]/layout.tsx` valida `getProjectShellInfo` + `getTenantModuleGate`; `NOT_FOUND` → `notFound()`, `FORBIDDEN` → `redirect("/dashboard")`. **Phase 15A:** la navegación del proyecto es el **sidebar workspace** (`ProjectWorkspaceSidebar` + `buildProjectWorkspaceNavSections`), no una subnav horizontal; el cliente reconstruye el gate con el snapshot serializado en `(app)/layout.tsx` (`OVERVIEW_MODULES` → `tenantGateFromSnapshot`). Mismas reglas de visibilidad: `can()` + helpers (`canViewArProjectArea`, `canViewApProjectArea`, `canViewProcurementProjectArea`, `canViewProjectCostControlReport`, `canViewProjectCashFlowReport`, `canShowProjectFinanzasNavLink`) y `gate.isEnabled`. Ver `FINANCE_AND_PROJECT_OVERVIEW_ARCHITECTURE.md` §6.
- **Phase 14E — `/proyectos/[id]/finanzas`:** `getProjectFinanceOverview(ctx, projectId)` (`packages/services/src/project-finance/project-finance-overview.service.ts`); **un** `getTenantModuleGate` por invocación (opcional `options.gate` para compartir gate con otros servicios, p. ej. Phase **15B**); AR/AP con `getReceivableAgingReport` / `getPayableAgingReport` y `projectId` si el rol tiene `VIEW AR` / `VIEW AP`; si solo área proyecto (`canViewArProjectArea` / `canViewApProjectArea` sin esos `VIEW`), agregados livianos desde `listReceivablesByProject` / `listPayablesByProject`. Enlace **Finanzas del proyecto** en el workspace condicionado por `canShowProjectFinanzasNavLink` (requiere módulo tenant `PROJECTS` + al menos un bloque financiero visible).
- **Phase 15B — resumen `/proyectos/[id]`:** `getProjectOverviewDashboard` (`packages/services/src/project/project-overview-dashboard.service.ts`) — KPIs y conteos con mismos gates/permisos que las vistas hijas; `getProjectFinanceOverview(ctx, projectId, { gate })` para no duplicar `getTenantModuleGate`; ficha extendida y acciones de ciclo de vida en página solo si `VIEW PROJECTS` (`getProjectById`).
- **Cronograma — `/proyectos/[id]/cronograma`:** `getProjectScheduleWorkspace` + Server Actions en `apps/web/features/schedule/actions/`; gate tenant **`SCHEDULE`**; `canViewScheduleArea` / `canEditScheduleArea` (`packages/services/src/schedule/schedule-access.ts`). Línea base presupuesto = misma resolución que control de costos (`APPROVED` / `CLOSED`).
- **PM vs aging global:** `PROJECT_MANAGER` tiene `EDIT AR` en matriz ⇒ `can(VIEW, AR)` es verdadero; puede abrir aging tenant-wide. Si el producto lo restringe solo a FINANCE/ADMIN, hace falta otra regla (módulo dedicado, o aging con filtro obligatorio por proyecto para ciertos roles) — no implementado en 7D; **sigue abierto** (ver `PERMISSIONS_MATRIX.md` “Remaining RBAC decisions”).
