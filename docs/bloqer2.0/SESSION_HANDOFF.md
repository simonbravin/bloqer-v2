# Session Handoff — Bloqer 2.0

Last updated: 2026-05-13  
Status: Phase **14D** — `layout.tsx` bajo `/proyectos/[id]` (`getProjectShellInfo` + `ProjectSubnav` compartido); `buildProjectSubnavLinks` audita solo rutas existentes (AR/AP, control de costos, flujo de caja, etc.); `getProjectShellInfo` / `canAccessProjectLayout` en `project.service.ts`. Phase **14C+**: hub `/finanzas`. Doc subnav: [`FINANCE_AND_PROJECT_OVERVIEW_ARCHITECTURE.md`](./08-architecture/FINANCE_AND_PROJECT_OVERVIEW_ARCHITECTURE.md). Sin `db:push`; verificar `db:generate` + typecheck + lint + build en CI local.

---

## Completed phases

| Phase | Module | Status |
|---|---|---|
| Phase 0 | Foundation (auth, tenant, membership, seed) | Complete |
| Phase 1 | Projects, Directory (contacts), Budgets (WBS) | Complete |
| Phase 2 | Certifications | Complete |
| Phase 3A | SalesInvoice (manual + cert-based) | Complete |
| Phase 3B | Accounts Receivable (Receivable lifecycle) | Complete |
| Phase 3C | Collections + Treasury Base | Complete |
| Phase 4A | Accounts Payable (SupplierInvoice, Payable, Payment) | Complete |
| Phase 4B | Procurement (PurchaseOrder, Receipt, PO→SupplierInvoice link) | Complete |
| Phase 4C | Inventory Foundation (Product, Warehouse, StockMovement ledger) | Complete |
| Phase 4D | Subcontracts / Subcontract Certifications | Complete |
| Phase 4E | Jobsite Log / Libro de Obra | Complete |
| Phase 5A | Cost Control / Budget vs Actual read-only | Complete |
| Phase 5B | AR/AP Aging read-only reports | Complete |
| Phase 5C | Warehouse Transfers (WarehouseTransfer entity, paired stock movements, cancellation) | Complete |
| Phase 5D | Treasury Reports (cash position, movement ledger, cash flow by period) | Complete |
| Phase 5E | Inventory Reports (stock balance, movement history, product Kardex, warehouse stock) | Complete |
| Phase 5F | Project Cash Flow (inflows via Collection→Project, outflows via Payment→Project; per-period + cumulative) | Complete |
| Phase 6A | Documents / Attachments (metadata foundation, project library, placeholder storage) | Complete |
| Phase 6B | Real R2 Upload + Secure Download (presigned PUT/GET, UPLOADING status, MIME allowlist, 50 MB limit, dev fallback) | Complete |
| Phase 6C | P-DOC-01 — Stale UPLOADING cleanup (`cleanupStaleUploadingDocuments`; OWNER/ADMIN; default 1h threshold; audit batch) | Complete |
| Phase 6D | JobsiteLog attachments (`linkedEntityType=JOBSITE_LOG`, `EntityDocumentsPanel`, extended `initiateDocumentUpload` + `listEntityDocuments` validation) | Complete |
| Phase 6E | Certification attachments (`linkedEntityType=CERTIFICATION`, same panel/form/routes; `EDIT`/`VIEW` `CERTIFICATIONS`) | Complete |
| Phase 6F | Compras/AP attachments — SupplierInvoice, PurchaseOrder, PurchaseReceipt (`linkedEntityType` + `AP`/`PROCUREMENT` permissions) | Complete |
| Phase 6G | Subcontracts attachments — Subcontract, SubcontractCertification (`linkedEntityType` + `SUBCONTRACTS`) | Complete |
| Phase 6H | Budget attachments — Presupuesto (`linkedEntityType` + `BUDGET`, `VIEW`/`EDIT` `BUDGETS`) | Complete |
| Phase 7A | RBAC audit — sidebar filtered by `can()`, procurement/AP project reads aligned with documents, jobsite log contributor vs supervisor gates, `PERMISSIONS_ROUTE_MATRIX.md` | Complete |
| Phase 7B | AR en proyecto — `ar-access.ts`; lecturas `VIEW AR | VIEW PROJECTS`; mutaciones `EDIT AR` | Complete |
| Phase 7C | Matriz producto + `matrix.ts`: remoción `SALES_COLLECTIONS`; PM `AR` EDIT; §2.2.1 `PERMISSIONS_MATRIX.md`; seed documentado | Complete |
| Phase 7D | Reportes financieros: globales solo módulo financiero (AR/AP/TREASURY); proyecto cash flow + cost control con OR ampliado; guard en `/tesoreria`; finanzas filtra cards; botones proyecto condicionales | Complete |
| Phase 8A | In-app notifications — modelo `Notification`, servicio, UI `/notificaciones` + badge header; eventos: upload documento confirmado, libro devuelto, certificación aprobada | Complete |
| Phase 8B | Operational in-app alerts — servicios idempotentes (AR/AP vencidos, stock negativo, certificación aprobada sin factura ISSUED, uploads UPLOADING &gt; 1 h); destinatarios por `can()` + membresía ACTIVE | Complete |
| Phase 8C | Operational alerts manual runner — UI `/notificaciones/alertas`, Server Actions, `operational-alerts-runner.service.ts`; solo **OWNER** / **ADMIN** | Complete |
| Phase 8D | Operational alerts cron — `POST`/`GET` `/api/cron/operational-alerts`, `CRON_SECRET` (Bearer o `x-cron-secret`), `operational-alerts-cron.service.ts` + `runAllOperationalAlertsForSystemContext`; `apps/web/vercel.json` cron diario | Complete |
| Phase 8E | Email notifications foundation — `isEmailConfigured` / `getEmailEnv` opcional; `@bloqer/email` + Resend; templates; `notification-email.service.ts` (`sendNotificationEmail`, `sendOperationalAlertEmail`); sin schema, sin envío automático, sin UI | Complete |
| Phase 9A | Report exports — CSV + JSON opcional vía servicios existentes; rutas finas `GET /api/reports/...`; UI “Exportar CSV” con filtros actuales | Complete |
| Phase 9B | PDF parcial — `@react-pdf/renderer`; aging CxC/CxP + control de costos; `?format=pdf`; límites de filas en PDF; demás rutas `assertPdfExportNotRequested` | Complete |
| Phase 9C | Reportes por email manual — `sendReportEmailAction`, `ReportEmailSendDialog`, `report-email.service.ts` + validators; adjuntos; mismo AuthZ que exports | Complete |
| Phase 9D | `EmailDeliveryLog` en Prisma + `email-delivery-log.service.ts`; integración en report-email y notification-email; lista admin `/notificaciones/emails` | Complete |
| Phase 10B | Configuración tenant: `/configuracion`, equipo, matriz permisos; servicios `tenant-settings/*`; RBAC `TENANT_SETTINGS` / `USERS_PERMISSIONS`; auditoría en mutaciones | Complete |
| Phase 10C | Invitaciones equipo: modelo `TenantInvitation`, servicio `tenant-invitations.service.ts`, validators, UI equipo + aceptación; token bearer hasheado; email opcional | Complete |
| Phase 10D | Deploy readiness: inventario env, orden de despliegue, smoke test, scripts `db:migrate:deploy` / docs | Complete |
| Phase 11A | Contabilidad / libro mayor: `AccountingAccount`, `JournalEntry`, `JournalEntryLine`; `ACCOUNTING` en matriz + nav; servicios + UI `/contabilidad`; asientos manuales balanceados; mayor solo `POSTED`; cancelación solo `DRAFT` | Complete |
| Phase 11B | Reglas de mapeo `AccountingMappingRule` + `AccountingMappingEventType`; servicios `accounting-mapping.service`, `accounting-suggestions.service` (colección, pago, movimiento tesorería, consumo stock → `createJournalEntry` en `DRAFT`); UI `/contabilidad/reglas` (lista/alta/detalle/edición); sin auto-post; sin wiring en flujos operativos | Complete |
| Phase 11C | Acciones explícitas: cobranza confirmada, pago confirmado, movimiento tesorería (reporte), consumo stock con costo; `source-draft-actions.ts` + deduplicación en servicio; `EDIT ACCOUNTING` para generar; revisión/post manual en `/contabilidad/asientos` | Complete |
| Phase 11D | Detalle asiento: panel “Documento origen” (`JournalEntrySourcePanel`) si `sourceType`/`sourceId`; `journal-entry-source-link.service.ts` resuelve etiqueta + `href` con mismos gates que lecturas AR/AP/Tesorería/Inventario; sin Prisma en UI | Complete |
| Phase 12B | `TenantModuleSetting` + helpers (`getTenantModuleGate`, `updateTenantModuleSetting` solo plataforma); nav filtrado por rol + disponibilidad de módulo; UI `/platform/tenants/[tenantId]/modules` | Complete |
| Phase 12C (pass 1) | Barreras en **servicios** (`tenant-module-enforcement.ts`) para ACCOUNTING, TREASURY, AR, AP, INVENTORY, PROCUREMENT, SUBCONTRACTS; exports vía mismos servicios; `listNegativeStockBalancesForTenant` sin gate (alertas); multi-módulo → Phase 12D | Complete |
| Phase 12D | **Cross-module reports + documents:** `project-cash-flow` (base `PROJECTS`; cobranzas si `AR`; pagos si `AP`; vacío + warnings si ambos off); `cost-control` (base `PROJECTS`+`BUDGETS`; capas omitidas si CERTIFICATIONS/PROCUREMENT/SUBCONTRACTS/AP/INVENTORY/JOBSITE_LOG off); `document.service` mutaciones por `linkedEntityType` → módulo; lecturas sin gate global; alertas stock sin cambio | Complete |
| Phase 13A | Estabilización / QA: rutas sin Prisma en páginas libro/subcontratos; pick lists en servicios; typecheck + lint + build | Complete |
| Phase 13C.1 | Normalización URLs plataforma: todo bajo `/platform/*`; filesystem `app/(platform)/platform/tenants/...` | Complete |
| Phase 13E–13G | Auditoría ERD Prisma; permisos/módulos doc; gate servicio `JOBSITE_LOG` en libro de obra | Complete |
| Phase 14A | Onboarding SaaS: usuario autenticado sin membresía ACTIVE → `/onboarding`; alta transaccional tenant + company + membresía OWNER + trial 30 días + `TenantModuleSetting` explícitos + `AuditLog` | Complete |
| Phase 14A.1 | Onboarding: `pg_advisory_xact_lock` por `actorUserId` dentro de `completeTrialOnboarding` para evitar dos tenants concurrentes del mismo usuario | Complete |
| Phase 14B | Dashboard tenant: agregados servicio + UI; sin Prisma en `apps/web`; sin schema nuevo | Complete |
| Phase 14C | Auditoría rutas finanzas/proyecto/tesorería + modelo `projectId` + plan indicadores; doc [`FINANCE_AND_PROJECT_OVERVIEW_ARCHITECTURE.md`](./08-architecture/FINANCE_AND_PROJECT_OVERVIEW_ARCHITECTURE.md) | Complete (doc) |
| Phase 14C+ | Hub `/finanzas` (`getFinanceHubOverview` + `FinanceHubView`); subnav proyecto en ficha `/proyectos/[id]` | Complete |
| Phase 14D | Layout `/proyectos/[id]` + subnav global; `getProjectShellInfo` / `canAccessProjectLayout`; enlaces subnav solo a rutas reales; presupuestos/certificaciones usan shell para breadcrumb | Complete |

**Siguiente (sugerido):** página `/proyectos/[id]/finanzas` (hub proyecto); servicio `getProjectFinanceOverview`; producto: `projectId` nullable / `AccountMovement`. Deploy: Neon + Vercel, [`DEPLOYMENT_SMOKE_TEST.md`](./08-architecture/DEPLOYMENT_SMOKE_TEST.md).

---

## Phase 12C (pass 1) — service tenant module gates

- **12B (recordatorio):** `TenantModuleSetting` + nav + consola plataforma — no reemplaza 12C.
- **12C (pass 1):** bloqueo en servicios vía `tenant-module-enforcement.ts` / `assertTenantModuleEnabled`.
- **12D (implementado):** reportes multi-módulo + mutaciones de documentos por módulo vinculado — ver bloque siguiente.
- Mensaje único: `El módulo está deshabilitado para este tenant.` (`assertTenantModuleEnabled`).
- Default-on sin fila en `tenant_module_settings`.
- Helpers: `packages/services/src/tenant-modules/tenant-module-enforcement.ts`.
- Plataforma `/platform`: sin gates de módulo tenant (superadmin gestiona toggles).

## Phase 12D — cross-module reports & document mutations (implemented)

- **`project-cash-flow.service.ts`:** `getTenantModuleGate` → `assertTenantModuleEnabledWithGate(..., "PROJECTS")`. Cobranzas solo si `AR` habilitado; pagos solo si `AP` habilitado. Si ambos off: reporte vacío + `warnings.sectionsExcluded` (no `FORBIDDEN`). Tesorería no requerida para este reporte.
- **`cost-control.service.ts`:** Gate `PROJECTS` + `BUDGETS` (bloqueo total si off). Consultas condicionales por módulo: CERTIFICATIONS, PROCUREMENT, SUBCONTRACTS, AP, INVENTORY, JOBSITE_LOG. DTO: `sectionsExcluded[]` + `warnings[]` (texto). `getWbsItemCostDetail` alineado.
- **`document.service`:** Sin gate global en lecturas/listados. **Mutaciones** (`createDocumentMetadata`, `initiateDocumentUpload`, `confirmDocumentUpload`, archive/restore/delete): `assertTenantModuleEnabledWithGate` según `linkedEntityType` → `PROJECTS` / `BUDGETS` / `CERTIFICATIONS` / `JOBSITE_LOG` / `AP` / `PROCUREMENT` / `SUBCONTRACTS`. `serialize` expone `disabledLinkedModule` si el módulo está off (`canMutate` false).
- **Tipos:** `TenantModuleSectionExcludedWarning` en `packages/services/src/tenant-modules/tenant-module-report-warnings.ts`.
- **UI:** banners simples en `/proyectos/[id]/flujo-caja` y `/proyectos/[id]/control-costos`.
- **Alertas:** `listNegativeStockBalancesForTenant` sin gate (sin cambio).

Ver matrices: `PERMISSIONS_ROUTE_MATRIX.md`, `SECURITY_ARCHITECTURE.md`.

## Implemented routes

```
/api/cron/operational-alerts (internal; CRON_SECRET; optional ?tenantId=)
/configuracion
/configuracion/equipo
/configuracion/equipo/invitar
/configuracion/equipo/invitaciones/[invitationId]
/configuracion/equipo/[membershipId]
/configuracion/permisos
/invitaciones/aceptar
/onboarding
/platform
/platform/tenants
/platform/tenants/[tenantId]
/platform/tenants/[tenantId]/users
/platform/tenants/[tenantId]/modules
/platform/tenants/[tenantId]/settings
/dashboard
/notificaciones
/notificaciones/alertas
/notificaciones/emails
/directorio, /directorio/nuevo, /directorio/[id], /directorio/[id]/editar
/proyectos, /proyectos/nuevo
/proyectos/[id]
/proyectos/[id]/presupuestos, /nueva, /[budgetId], /[budgetId]/editar
/proyectos/[id]/certificaciones, /nueva, /[certId], /[certId]/editar
/proyectos/[id]/facturas, /nueva, /[invoiceId], /[invoiceId]/editar
/proyectos/[id]/cuentas-por-cobrar, /[receivableId], /[receivableId]/cobrar
/proyectos/[id]/cobranzas, /nueva, /[collectionId]
/proyectos/[id]/facturas-proveedor, /nueva, /[supplierInvoiceId], /[supplierInvoiceId]/editar
/proyectos/[id]/cuentas-por-pagar, /[payableId], /[payableId]/pagar
/proyectos/[id]/pagos, /[paymentId]
/proyectos/[id]/ordenes-compra, /nueva, /[poId], /[poId]/editar, /[poId]/recepciones/nueva
/proyectos/[id]/recepciones, /[receiptId]
/inventario, /inventario/productos, /inventario/productos/nuevo, /inventario/productos/[productId]
/inventario/productos/[productId]/stock
/inventario/depositos, /inventario/depositos/nuevo, /inventario/depositos/[warehouseId]
/inventario/depositos/[warehouseId]/stock
/inventario/movimientos
/inventario/transferencias, /inventario/transferencias/nueva, /inventario/transferencias/[transferId]
/proyectos/[id]/inventario, /proyectos/[id]/consumos/nuevo
/inventario/reportes
/inventario/reportes/stock
/inventario/reportes/movimientos
/proyectos/[id]/flujo-caja
/proyectos/[id]/documentos
/proyectos/[id]/documentos/nuevo
/proyectos/[id]/documentos/[documentId]
/proyectos/[id]/subcontratos, /nueva, /[subcontractId], /[subcontractId]/editar
/proyectos/[id]/subcontratos/[subcontractId]/certificaciones/nueva, /[certId], /[certId]/editar
/proyectos/[id]/libro-obra, /nuevo, /[logId], /[logId]/editar
/proyectos/[id]/control-costos, /[wbsNodeId]
/finanzas
/finanzas/cuentas-por-cobrar-aging
/finanzas/cuentas-por-pagar-aging
/tesoreria
/contabilidad
/contabilidad/cuentas, /nueva, /[accountId]
/contabilidad/asientos, /nuevo, /[journalEntryId], /[journalEntryId]/editar
/contabilidad/reglas, /nueva, /[ruleId], /[ruleId]/editar
/tesoreria/cuentas, /nueva, /[accountId]
/tesoreria/transferencias, /nueva
/tesoreria/reportes
/tesoreria/reportes/posicion-caja
/tesoreria/reportes/movimientos
/tesoreria/reportes/flujo-caja

/api/reports/finanzas/ar-aging.csv
/api/reports/finanzas/ap-aging.csv
/api/reports/tesoreria/posicion-caja.csv
/api/reports/tesoreria/movimientos.csv
/api/reports/tesoreria/flujo-caja.csv
/api/reports/inventario/stock.csv
/api/reports/inventario/movimientos.csv
/api/reports/proyectos/[projectId]/control-costos.csv
/api/reports/proyectos/[projectId]/flujo-caja.csv
```

*App Router (Phase 13C.1):* consola de plataforma en `app/(platform)/platform/` — el grupo `(platform)` no forma parte de la URL; el prefijo `/platform` coincide con la carpeta `platform/`.

---

## Prisma models (all implemented)

**Phase 8A:** `Notification` (+ `NotificationType`, `NotificationSeverity`, `NotificationStatus`) — in-app inbox; `recipientUserId` → `User`.

**Pre-Phase 3C:** Tenant, Company, UserMembership, User, Account, Session, VerificationToken, AuditLog, Contact, Project, Budget, BudgetLine, WbsNode, Certification, CertificationLine, SalesInvoice, SalesInvoiceLine, Receivable

**Phase 3C additions:**
- `TreasuryAccount`, `AccountMovement`, `Collection`, `InternalTransfer`

**Phase 4A additions:**
- `SupplierInvoice` — supplier invoice (DRAFT → ISSUED creates Payable; CANCELLED cascades); optional `purchaseOrderId` FK added in Phase 4B
- `SupplierInvoiceLine` — line items per invoice
- `Payable` — AP balance per invoice (OPEN | PARTIAL | PAID | OVERDUE | CANCELLED)
- `Payment` — payment against a Payable; creates AccountMovement OUTFLOW

**Phase 4B additions:**
- `PurchaseOrder` — supplier procurement order per project/company; @@unique([tenantId, companyId, number]); DRAFT → ISSUED → PARTIALLY_RECEIVED → RECEIVED | CANCELLED
- `PurchaseOrderLine` — line items with optional WBS ITEM allocation; `receivedQuantity` maintained by service; `productId?` added in Phase 4C
- `PurchaseReceipt` — receipt against a PO; DRAFT → CONFIRMED | CANCELLED; CONFIRMED increments receivedQty and creates StockMovement IN for product-linked lines; CANCELLED reverses exactly and cancels StockMovements
- `PurchaseReceiptLine` — per-line quantities received

**Phase 4C additions:**
- `Product` — tenant-wide catalog; `@@unique([tenantId, companyId, sku])`; ACTIVE | INACTIVE
- `Warehouse` — per-company/project depot; ACTIVE | INACTIVE | CLOSED; CENTRAL | PROJECT | TEMPORARY | OTHER
- `StockMovement` — append-only ledger; IN | OUT | TRANSFER_IN | TRANSFER_OUT | ADJUSTMENT; CONFIRMED | CANCELLED; balance = SUM(IN) - SUM(OUT) over CONFIRMED movements

**Phase 4D additions:**
- `Subcontract` — contract with subcontractor per project/company; `@@unique([tenantId, companyId, number])`; DRAFT → ACTIVE → COMPLETED | CANCELLED; lines locked once ACTIVE
- `SubcontractLine` — lines with optional WBS ITEM; `certifiedQuantity` maintained by service
- `SubcontractCertification` — certification period per subcontract; `@@unique([subcontractId, number])`; DRAFT → ISSUED → APPROVED | REJECTED; APPROVED creates SupplierInvoice DRAFT; CANCELLED reverses if APPROVED and linked invoice is DRAFT
- `SubcontractCertificationLine` — per-line quantities with previous/current/cumulative/remaining snapshots
- `SupplierInvoice` modified: added `subcontractCertificationId String? @unique` → nullable FK to SubcontractCertification

**Enums added in Phase 4A:**
- `SupplierInvoiceStatus`: DRAFT | ISSUED | CANCELLED
- `PayableStatus`: OPEN | PARTIAL | PAID | OVERDUE | CANCELLED
- `PaymentStatus`: CONFIRMED | CANCELLED
- `AccountMovementSourceType` now includes: PAYMENT

**Enums added in Phase 4B:**
- `PurchaseOrderStatus`: DRAFT | ISSUED | PARTIALLY_RECEIVED | RECEIVED | CANCELLED
- `PurchaseReceiptStatus`: DRAFT | CONFIRMED | CANCELLED

**Enums added in Phase 4C:**
- `ProductStatus`: ACTIVE | INACTIVE
- `WarehouseStatus`: ACTIVE | INACTIVE | CLOSED
- `WarehouseType`: CENTRAL | PROJECT | TEMPORARY | OTHER
- `StockMovementType`: IN | OUT | TRANSFER_IN | TRANSFER_OUT | ADJUSTMENT
- `StockMovementSourceType`: PURCHASE_RECEIPT | CONSUMPTION | TRANSFER | ADJUSTMENT | OPENING_BALANCE
- `StockMovementStatus`: CONFIRMED | CANCELLED

**Phase 5C additions:**
- `WarehouseTransfer` — paired-movement transfer between warehouses; `@@unique([tenantId, companyId, number])`; displayed as TR-001, TR-002; CONFIRMED | CANCELLED
- `StockMovement` modified: added `warehouseTransferId String?` FK + `@@index([warehouseTransferId])`

**Enums added in Phase 5C:**
- `WarehouseTransferStatus`: CONFIRMED | CANCELLED

**Enums added in Phase 3C:**
- `TreasuryAccountType`: BANK | CASH | DIGITAL_WALLET | OTHER
- `TreasuryAccountStatus`: ACTIVE | INACTIVE | CLOSED
- `AccountMovementType`: INFLOW | OUTFLOW | TRANSFER_IN | TRANSFER_OUT | ADJUSTMENT
- `AccountMovementStatus`: CONFIRMED | CANCELLED
- `AccountMovementSourceType`: COLLECTION | INTERNAL_TRANSFER | MANUAL_ADJUSTMENT | OPENING_BALANCE
- `CollectionStatus`: CONFIRMED | CANCELLED
- `InternalTransferStatus`: CONFIRMED | CANCELLED

---

## Services implemented (packages/services/src/)

| File | Key responsibilities |
|---|---|
| `treasury/balance.service.ts` | `getAccountBalance` (openingBalance + Σ confirmed movements × sign); `getTreasurySummaryByCompany` |
| `treasury/treasury-account.service.ts` | create/list/get/update/deactivate/reactivate; opening-balance INFLOW movement on create |
| `treasury/account-movement.service.ts` | list/get/cancel (blocks cancel of TRANSFER movements; use cancelTransfer instead) |
| `treasury/collection.service.ts` | create/cancel/list/get; enforces BR-TRZ-006 (no overpayment), currency match, updates Receivable transactionally |
| `treasury/internal-transfer.service.ts` | create/cancel/list; D4 balance check, same-currency guard, creates 2 movements with shared transferId |
| `ar/receivable.service.ts` | OVERDUE computed on read in `serializeReceivable`; `listCollectionsByReceivable` |
| `ap/supplier-invoice.service.ts` | create/update/issue/cancel; issue creates Payable atomically; cancel blocked if active payments; optional purchaseOrderId link with consistency validation |
| `ap/payable.service.ts` | list/get/cancel; `serializePayable` with derived OVERDUE/balanceDue |
| `ap/payment.service.ts` | create/cancel/list/get; no-overpayment guard, currency match, creates OUTFLOW movement, updates Payable |
| `procurement/purchase-order-calc.service.ts` | `calcLine`, `recalcPurchaseOrderTotals` |
| `procurement/purchase-order.service.ts` | CRUD + issue + cancel; WBS ITEM validation; listLinkablePurchaseOrders; listProcurementWbsOptions; productId on lines |
| `procurement/purchase-receipt.service.ts` | create/confirm/cancel/list/get; confirm increments receivedQty + creates StockMovement IN; cancel reverses exactly + cancels StockMovements |
| `inventory/product.service.ts` | create/update/list/get/deactivate/reactivate; SKU unique per tenant+company |
| `inventory/warehouse.service.ts` | create/update/list/get/deactivate/reactivate; CLOSED cannot be edited |
| `inventory/stock-movement.service.ts` | listStockMovements/get; createStockConsumption (blocks negative stock); createReceiptStockMovement/cancelReceiptStockMovements (internal) |
| `inventory/stock-balance.service.ts` | getStockBalance (Decimal); getStockBalanceByWarehouse (aggregated by product); `listNegativeStockBalancesForTenant` (Phase 8B — saldos &lt; 0 por producto/depósito/proyecto/WBS) |
| `subcontracts/subcontract.service.ts` | createSubcontract, updateSubcontract (DRAFT only), updateSubcontractMeta (notes/dates on ACTIVE), activateSubcontract, completeSubcontract, cancelSubcontract, getSubcontractById, listSubcontractsByProject, listSubcontractorContacts |
| `subcontracts/subcontract-certification.service.ts` | createSubcontractCertification, updateSubcontractCertification (DRAFT), issueSubcontractCertification, approveSubcontractCertification (creates SupplierInvoice DRAFT + increments certifiedQty), rejectSubcontractCertification (ISSUED only, no effects), cancelSubcontractCertification (reverses APPROVED effects if invoice is DRAFT) |
| `jobsite-log/jobsite-log.service.ts` | createJobsiteLog, updateJobsiteLog (DRAFT only), submitJobsiteLog, approveJobsiteLog, returnJobsiteLog (returnNotes required, SUBMITTED→DRAFT), cancelJobsiteLog (DRAFT only), getJobsiteLogById, listJobsiteLogsByProject, listProjectWbsItemsForLog — no StockMovement created, no Certification mutation |
| `cost-control/cost-control.service.ts` | `getProjectCostControl(projectId, filters, ctx)` → `CostControlResult` (discriminated union: REPORT \| BUDGET_SELECTION_REQUIRED); `getWbsItemCostDetail(wbsNodeId, projectId, filters, ctx)` — drilldown with all source documents per WBS item; read-only, no mutations |
| `aging/aging.service.ts` | `getReceivableAgingReport(filters, ctx)` → `AgingReport`; `getPayableAgingReport(filters, ctx)` → `AgingReport`; buckets: current/1_30/31_60/61_90/90_plus; grouped by contactId+currency; OVERDUE derived on read; no FX conversion; read-only |
| `treasury-reports/treasury-reports.service.ts` | `getCashPositionReport` (accounts+byCurrency+byCompany, N per-account balance queries); `getAccountMovementReport` (filters: account, date, type, sourceType, currency, includeInternalTransfers; running balance when single accountId); `getCashFlowReport` (period buckets day/week/month per currency; openingBalance from preDate movements; separates inflow/outflow/internalTransferIn/internalTransferOut/adjustments/netOperatingCashFlow/netCashFlow; default last 12 months) |
| `inventory/warehouse-transfer.service.ts` | `createWarehouseTransfer` (validates src≠dst, both ACTIVE, same company, stock balance ≥ qty; transaction creates WT + 2 StockMovements TRANSFER_OUT+TRANSFER_IN); `cancelWarehouseTransfer` (checks destination balance ≥ qty before reversing — BR-INV-002); `listWarehouseTransfers` (filters: warehouseId OR, productId, status, dateFrom/dateTo); `getWarehouseTransferById`; `getSourceStockPreview` |
| `inventory-reports/inventory-reports.service.ts` | `getStockBalanceReport` (filters: warehouseId, productId, companyId, projectId, includeZeroStock; aggregates CONFIRMED movements in memory; ADJUSTMENT excluded from balance, sets adjustmentPresent flag); `getStockMovementReport` (filters: warehouseId, productId, projectId, wbsNodeId, companyId, sourceType, movementType, dateFrom, dateTo; ADJUSTMENT shown as raw qty); `getProductStockDetail` (returns product + balancesByWarehouse + movements); `getWarehouseStockDetail` (returns warehouse + balancesByProduct + movements) |
| `project-cash-flow/project-cash-flow.service.ts` | `getProjectCashFlowReport(projectId, filters, ctx)` — reads CONFIRMED Collections and Payments by projectId; groups by currency → period; computes cumulativeNetCashFlow from dateFrom; returns project info, warnings, per-currency sections with periods/collections/payments detail |
| `documents/document.service.ts` | `createDocumentMetadata` (PLACEHOLDER legacy, project library), `initiateDocumentUpload` (optional link: `JOBSITE_LOG` \| `CERTIFICATION` — `assertJobsiteLogDocumentTarget` / `assertCertificationDocumentTarget`; UPLOADING + presigned PUT), `confirmDocumentUpload`, `getDocumentDownloadUrl`, `cleanupStaleUploadingDocuments`, `archive`/`restore`/`softDelete` (mutate by link: `EDIT PROJECTS`, `EDIT JOBSITE_LOG`, or `EDIT CERTIFICATIONS`), `getDocumentById`/`download` (view: `VIEW PROJECTS` or module view for linked entity), `listProjectDocuments`, `listEntityDocuments` (`JOBSITE_LOG` \| `CERTIFICATION` requires `options.projectId` + ownership check) |
| `notifications/notification.service.ts` | `createNotification`, `createSystemNotification`, `listMyNotifications`, `getUnreadNotificationCount`, `markNotificationAsRead`, `markAllNotificationsAsRead`, `archiveNotification` — Phase 8A in-app inbox |
| `notifications/operational-alerts-runner.service.ts` | Phase 8C: `canRunOperationalAlerts` (OWNER/ADMIN), `runOperationalAlert`, `runAllOperationalAlerts` — UI manual. Phase 8D: `buildOperationalAlertsCronServiceContext`, `runAllOperationalAlertsForSystemContext` — cron / sistema por tenant |
| `notifications/operational-alerts-cron.service.ts` | Phase 8D: `runOperationalAlertsForTenant`, `runOperationalAlertsForAllActiveTenants` — sin sesión; errores aislados por tenant |
| `notifications/notification-email.service.ts` | Phase 8E: `sendNotificationEmail`, `sendOperationalAlertEmail` — Resend opcional; sin mutar `Notification`; recipient o OWNER/ADMIN |
| `notifications/operational-alerts.service.ts` | Phase 8B: `runOverdueReceivablesAlert`, `runOverduePayablesAlert`, `runNegativeStockAlert`, `runApprovedCertificationsWithoutInvoiceAlert`, `runStaleUploadingDocumentsAlert`; `findActiveUsersForPermission`, `findActiveOwnerAdminUserIds` — idempotent fan-out, invocable desde UI 8C o cron 8D |
| `report-exports/report-export.service.ts` (Phase 9A) | Parsers de query alineados a páginas; `export*Csv` delegan en `aging`, `treasury-reports`, `inventory-reports`, `cost-control`, `project-cash-flow`; `assertPdfExportNotRequested` |
| `report-exports/csv-export.service.ts` | `buildCsv`, `escapeCsvCell` — UTF-8 BOM, `;`, CRLF |
| `report-exports/filename.service.ts` | `safeReportFilename` |
| `report-exports/report-pdf-export.service.tsx` (Phase 9B) | `exportReceivableAgingPdf`, `exportPayableAgingPdf`, `exportProjectCostControlPdf` — `renderToBuffer` + documentos en `report-exports/pdf/` |
| `report-exports/pdf/*` | Tipos límites, `renderReportPdfToBuffer`, layouts sobrios, `aging-pdf`, `cost-control-pdf` |

---

## Business rules enforced

- **BR-TRZ-006**: collection amount ≤ receivable.balanceDue (overpayment blocked)
- **BR-TRZ-004**: InternalTransfer creates exactly 2 AccountMovements (TRANSFER_OUT + TRANSFER_IN) with shared `transferId`
- **D4**: source account balance checked inside transaction before transfer; blocks if amount > balance
- **D5**: OVERDUE derived on read — no background job yet (see P-TRZ-01)
- **D6**: opening balance stored on TreasuryAccount + INFLOW/OPENING_BALANCE movement on creation
- Currency match enforced: collection currency = receivable currency = account currency
- Transfer currency match enforced: source currency = destination currency
- No FX support in Phase 3C
- No hard delete on financial records (CANCELLED status only)
- All money mutations inside `prisma.$transaction`
- No Prisma in React pages/components — service layer only
- No manual adjustment UI (MANUAL_ADJUSTMENT reserved in enum but not exposed)
- `AccountMovement.companyId` derived from `TreasuryAccount.companyId`

---

## Validators

**treasury.ts:** `createTreasuryAccountSchema`, `updateTreasuryAccountSchema`, `createCollectionSchema`, `createInternalTransferSchema`

**ap.ts (Phase 4A):** `createSupplierInvoiceSchema`, `updateSupplierInvoiceSchema`, `createPaymentSchema` — both invoice schemas include optional `purchaseOrderId`

**procurement.ts (Phase 4B):** `createPurchaseOrderSchema` (lines include optional `productId`), `updatePurchaseOrderSchema`, `createPurchaseReceiptSchema` (optional `warehouseId`)

**inventory.ts (Phase 4C):** `createProductSchema`, `updateProductSchema`, `createWarehouseSchema`, `updateWarehouseSchema`, `createStockConsumptionSchema`

**subcontracts.ts (Phase 4D):** `createSubcontractSchema` (lines with optional wbsNodeId, description, unit, quantity, unitPrice), `updateSubcontractSchema`, `updateSubcontractMetaSchema`, `createSubcontractCertificationSchema` (lines with subcontractLineId, currentQty), `updateSubcontractCertificationSchema`

**jobsite-log.ts (Phase 4E):** `createJobsiteLogSchema` (header fields + 4 child arrays: progress/labor/materials/issues), `updateJobsiteLogSchema` (logDate optional), `returnJobsiteLogSchema` (returnNotes required)

**No new validators in Phase 5A** — cost control is read-only (filters passed as plain strings from URL searchParams)

**No new validators in Phase 5B** — aging is read-only; no Prisma schema changes

**inventory.ts updated in Phase 5C:** added `createWarehouseTransferSchema` (sourceWarehouseId, destinationWarehouseId, productId, projectId?, transferDate, quantity, unitCost?, notes?)

## Phase 6B — R2 Upload + Download

### Upload flow (R2 configured)
1. Client selects file; MIME/size validated client-side
2. `POST /api/documents/initiate-upload` → service creates `DocumentAttachment` with `status=UPLOADING`, `storageProvider=R2`; returns `{ documentId, uploadUrl }`
3. Client PUTs file directly to R2 presigned URL (5 min expiry) with correct `Content-Type`
4. Client POSTs `POST /api/documents/[documentId]/confirm` → service sets `status=ACTIVE`
5. Client redirected to document detail

### Upload flow (R2 not configured / dev)
- `isStorageConfigured()` returns false
- Document created immediately with `status=ACTIVE`, `storageProvider=PLACEHOLDER`
- Warning banner shown in UI
- No real file stored

### Download flow
- `GET /api/documents/[documentId]/download` → validates auth+tenant, blocks DELETED/UPLOADING/PLACEHOLDER
- Generates presigned GET URL (5 min expiry), returns 302 redirect
- `publicUrl` field not used; no bucket URL exposed

### Env vars required for real upload
```
R2_ACCOUNT_ID=<cloudflare account id>
R2_ACCESS_KEY_ID=<r2 access key>
R2_SECRET_ACCESS_KEY=<r2 secret key>
R2_BUCKET_NAME=<bucket name>
R2_PUBLIC_URL=<optional — not used for download>
```
R2 endpoint: `https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com`

### @bloqer/storage exports (Phase 6B)
- `buildStorageKey(tenantId, projectId, documentId, filename) → string`
- `getPresignedPutUrl(storageKey, mimeType, expiresInSeconds=300) → Promise<string>`
- `getPresignedGetUrl(storageKey, expiresInSeconds=300) → Promise<string>`
- Dependencies added: `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `@types/node`

### @bloqer/config exports added
- `isStorageConfigured() → boolean` (safe check without throwing)
- `R2_PUBLIC_URL` made optional in storageSchema

### MIME allowlist (enforced server-side in service + client-side in form)
`application/pdf`, `image/jpeg`, `image/png`, `image/webp`, `image/heic`, `image/heif`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `application/msword`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `application/vnd.ms-excel`, `text/csv`, `text/plain`

### DocumentStatus enum — updated
`UPLOADING | ACTIVE | ARCHIVED | DELETED` (UPLOADING added in Phase 6B)

### New API routes
| Route | Method | Auth | Purpose |
|---|---|---|---|
| `/api/documents/initiate-upload` | POST | session | Create UPLOADING record, return presigned PUT URL |
| `/api/documents/[documentId]/confirm` | POST | session | UPLOADING → ACTIVE after successful R2 PUT |
| `/api/documents/[documentId]/download` | GET | session | Generate presigned GET URL, 302 redirect |

### Phase 6B — Known limitations
- **Upload transport size not strongly enforced at R2**: `Content-Length-Range` condition not set on presigned PUT. App validates `sizeBytes` server-side; client validates before initiating. R2 could theoretically accept a larger PUT if bypass attempted.
- **No antivirus scanning**: files stored without ClamAV or equivalent (P-DOC-02)
- **No versioning**: one file per DocumentAttachment; Q-008 deferred (P-DOC-04)
- **No per-module attachment panels for most entities** (WarehouseTransfer, …): **JobsiteLog, Certification, SupplierInvoice, PurchaseOrder, PurchaseReceipt, Subcontract, SubcontractCertification, Budget wired** (Phase 6D–6H); remainder P-DOC-03
- **No public sharing**: `publicUrl` field always null; presigned download only
- **No per-tenant quota**: `documents_max_size_mb` not on Tenant model
- **Linked entity validation**: proyecto siempre validado; entidades enlazadas usadas en UI validadas en initiate/list entity (Phase 6D–6H); otras entidades enum pendientes (P-DOC-03)

### Phase 6C — Stale UPLOADING cleanup (P-DOC-01)

- **Service:** `cleanupStaleUploadingDocuments(ctx, options?)` in `document.service.ts`
- **Selection:** `status=UPLOADING`, `tenantId=ctx.tenantId`, `createdAt < now - threshold` (default threshold **1 hour** via `olderThanMs`)
- **Effect:** `status` → `DELETED` (soft delete); no hard delete; does **not** delete objects in R2 (orphan blobs may remain until a future cleanup — P-DOC-01B / storage policy)
- **Authorization:** `OWNER` or `ADMIN` only
- **Audit:** one batch row `document.stale_upload_batch_cleaned` on `Tenant` with `cleanedCount`, `documentIds`, `olderThanMs`, `cutoffIso` (does not expose `storageKey`)
- **Scheduling:** no cron or HTTP route yet — invoke from a future job (P-DOC-01B) or internal tooling

### Phase 6D — JobsiteLog / Libro de obra attachments

- **UI:** `EntityDocumentsPanel` (`features/documents/components/entity-documents-panel.tsx`) on `/proyectos/[id]/libro-obra/[logId]` — list, download, archivar/restaurar/eliminar (soft), upload via extended `DocumentForm` + existing `/api/documents/*` routes.
- **Linking:** `linkedEntityType=JOBSITE_LOG`, `linkedEntityId=jobsiteLog.id`, `projectId` = obra; rows appear in proyecto **Documentos** (`listProjectDocuments` by `projectId`).
- **Validators:** `initiateUploadSchema` optional `linkedEntityType` + `linkedEntityId` (paired).
- **Limitaciones Phase 6D (Libro de obra):** alcance solo `JOBSITE_LOG` en esa entrega; sin versioning/antivirus/approval/batch/R2 blob delete on soft-delete (globales documentos).

### Phase 6E — Certification attachments

- **UI:** `EntityDocumentsPanel` on `/proyectos/[id]/certificaciones/[certId]` — mismo patrón que Libro de obra.
- **Linking:** `linkedEntityType=CERTIFICATION`, `linkedEntityId=certification.id`, `projectId` del proyecto; aparecen en biblioteca **Documentos**.
- **Permisos:** `EDIT CERTIFICATIONS` / `VIEW CERTIFICATIONS` (o `VIEW PROJECTS` donde aplica, ver servicio).
- **Mutación de adjuntos (alineación post-auditoría):** `canMutateDocumentByLink` — sin usar `EDIT PROJECTS` como comodín para entidades enlazadas. Reglas: `PROJECT` (o null) → `EDIT PROJECTS`; `JOBSITE_LOG` → `EDIT JOBSITE_LOG`; `CERTIFICATION` → `EDIT CERTIFICATIONS`; `SUPPLIER_INVOICE` → `EDIT AP`; `PURCHASE_ORDER` / `PURCHASE_RECEIPT` → `EDIT PROCUREMENT`; `SUBCONTRACT` / `SUBCONTRACT_CERTIFICATION` → `EDIT SUBCONTRACTS`; `BUDGET` → `EDIT BUDGETS`. Otros valores de enum sin UI → mutación denegada hasta definir módulo. `DocumentAttachmentView` incluye **`canMutate`** (boolean, servidor); el servidor sigue siendo la fuente de verdad en actions/API.
- **Validators:** `initiateUploadSchema` incluye tipos `linkedEntityType` para adjuntos por entidad (compras Phase 6F; subcontratos Phase 6G; presupuesto Phase 6H).
- **Limitaciones Phase 6E (adjuntos certificación):** sin versioning; sin antivirus; sin approval workflow dedicado a adjuntos; sin gestión batch; sin borrado físico de blobs R2 al soft-delete; entidades distintas de las cableadas en 6D–6H siguen pendientes (P-DOC-03).

### Phase 6F — Compras / AP attachments (SupplierInvoice, PurchaseOrder, PurchaseReceipt)

- **UI:** `EntityDocumentsPanel` en `/proyectos/[id]/facturas-proveedor/[supplierInvoiceId]`, `/proyectos/[id]/ordenes-compra/[poId]`, `/proyectos/[id]/recepciones/[receiptId]`.
- **Linking:** `SUPPLIER_INVOICE` / `PURCHASE_ORDER` / `PURCHASE_RECEIPT` + id de entidad + `projectId`; aparecen en biblioteca **Documentos**.
- **Permisos:** vista `VIEW AP` o `VIEW PROCUREMENT` según entidad, con `VIEW PROJECTS` como alternativa en servicio; mutación `EDIT AP` (factura proveedor) o `EDIT PROCUREMENT` (OC / recepción). Matriz `can()` usa módulos **`AP`** y **`PROCUREMENT`** (no strings inventados).
- **`canMutateDocumentByLink`:** actualizado para estos tipos (sin fallback `EDIT PROJECTS`).
- **Categorías por defecto en UI:** factura → `INVOICE`; OC → `CONTRACT`; recepción → `RECEIPT`.
- **Limitaciones Phase 6F:** mismas globales documentos (sin versioning/antivirus/approval/batch/R2 físico en soft-delete); entidades enum restantes (WarehouseTransfer, …) pendientes P-DOC-03.

### Phase 6G — Subcontracts attachments (Subcontract, SubcontractCertification)

- **UI:** `EntityDocumentsPanel` en `/proyectos/[id]/subcontratos/[subcontractId]` y `/proyectos/[id]/subcontratos/[subcontractId]/certificaciones/[certId]` (`EntityDocumentsLink` para certificación incluye `subcontractId` para rutas).
- **Linking:** `SUBCONTRACT` / `SUBCONTRACT_CERTIFICATION` + id + `projectId`; biblioteca proyecto **Documentos**.
- **Permisos:** lectura `VIEW SUBCONTRACTS` o `VIEW PROJECTS`; mutación/upload `EDIT SUBCONTRACTS` (misma regla para contrato y certificación de subcontrato).
- **Alineación con rutas de subcontrato:** `getSubcontractById`, `listSubcontractsByProject`, `getSubcontractCertificationById`, `listSubcontractCertificationsBySubcontract` y mutaciones de subcontrato/certificación usan los mismos módulos `can()` que los adjuntos (`subcontract-access.ts`: vista = `VIEW SUBCONTRACTS | VIEW PROJECTS`; edición = `EDIT SUBCONTRACTS`), no `PROCUREMENT`.
- **Limitaciones Phase 6G:** mismas globales documentos; resto enum P-DOC-03 (p. ej. WarehouseTransfer).

### Phase 6H — Budget attachments (Presupuesto)

- **UI:** `EntityDocumentsPanel` en `/proyectos/[id]/presupuestos/[budgetId]`.
- **Linking:** Prisma `LinkedEntityType.BUDGET`, `linkedEntityId=budget.id`, `projectId` obligatorio en modelo; biblioteca proyecto **Documentos**.
- **Permisos:** lectura `VIEW BUDGETS` o `VIEW PROJECTS`; mutación/upload `EDIT BUDGETS`.
- **Alineación vista presupuesto:** `getBudgetById` / `listBudgetsByProject` usan `VIEW BUDGETS | VIEW PROJECTS` (misma familia que adjuntos); **`getWbsTree`** usa `canViewBudgetsArea` exportado desde `budget.service.ts` (misma regla).
- **Categoría por defecto en UI:** `REPORT`.
- **Limitaciones Phase 6H:** mismas globales documentos; P-DOC-03 solo transferencias u otras entidades no cableadas.

### Phase 7A — Roles, permissions, module visibility

- **Sidebar:** `apps/web/lib/nav-config.ts` + `filterMainNav(roles)`; `AppLayout` pasa `tenantCtx.roles` a `Sidebar`. Items filtrados por `can()` (`VIEW` sobre módulos reales). Enlaces rotos removidos históricamente (`/compras`, `/reportes`). **`/configuracion`** (Phase 10B) aparece con `VIEW TENANT_SETTINGS` **o** `VIEW USERS_PERMISSIONS`.
- **Jobsite log:** lectura `VIEW JOBSITE_LOG | VIEW PROJECTS`; contribución (crear/editar/enviar/cancelar) `EDIT JOBSITE_LOG | EDIT PROJECTS`; aprobar/devolver solo `EDIT PROJECTS` (supervisor).
- **Procurement reads:** `procurement-access.ts` — `VIEW PROCUREMENT | VIEW PROJECTS` en PO/receipt reads + `listLinkablePurchaseOrders` / `listProcurementWbsOptions` (cerraban brecha sin gate).
- **AP project reads:** `ap-access.ts` — `VIEW AP | VIEW PROJECTS` en factura proveedor, payable, payment (lecturas); aging global AP sigue `VIEW AP` solo.
- **Doc matrix:** [`08-architecture/PERMISSIONS_ROUTE_MATRIX.md`](./08-architecture/PERMISSIONS_ROUTE_MATRIX.md).
- **Pendientes (post-7D):** navegación por sub-rutas de proyecto sin mapa único; PM vs aging global si se restringe por rol (ver matriz de rutas).

### Phase 7B — AR project context (symmetric to AP)

- **`ar-access.ts`:** `canViewArProjectArea` = `VIEW AR | VIEW PROJECTS`; `canEditArArea` = `EDIT AR`.
- **Sales invoice, receivable (reads), collection (reads):** `canViewArProjectArea`.
- **Sales invoice mutations, receivable cancel, collection create/cancel:** `canEditArArea` = `EDIT AR` (Phase 7C: módulo `SALES_COLLECTIONS` eliminado del dominio).
- **Aging AR global** (`getReceivableAgingReport`, `/finanzas/cuentas-por-cobrar-aging`): **`VIEW AR` only**.
- **Roles:** `PROJECT_MANAGER` tiene `AR: "EDIT"` en `matrix.ts` (alineado con Phase 7B). Rol `SALES` sigue con `AR: "EDIT"`.

### Phase 7C — Matrix + seeds documentation

- **`packages/domain/src/permissions/matrix.ts`:** eliminado `SALES_COLLECTIONS` de `PermissionModule` y de todas las filas de rol; `PROJECT_MANAGER`: `AR: "EDIT"` (antes `VIEW`).
- **`docs/bloqer2.0/00-product/PERMISSIONS_MATRIX.md`:** §2.2 PM en Cuentas por Cobrar = `E`; §2.2.1 mapeo producto ↔ `PermissionModule`.
- **`seed.ts`:** sin cambio funcional; comentario de que los techos por rol viven en `matrix.ts` / membresía (no hay multi-rol en seed demo).

### Phase 7D — Financial reporting visibility scope

- **Globales:** aging AR/AP y reportes de tesorería ya exigían `VIEW AR` / `VIEW AP` / `VIEW TREASURY` (sin `VIEW PROJECTS`). Se añadió guard en `/tesoreria` y `/tesoreria/reportes` para deep links.
- **Proyecto:** `getProjectCashFlowReport` → `canViewProjectCashFlowReport` = `VIEW PROJECTS | VIEW AR | VIEW AP | VIEW TREASURY`. Cost control → `canViewProjectCostControlReport` = `VIEW PROJECTS | VIEW BUDGETS`.
- **UI:** `/finanzas` filtra enlaces por permiso; detalle proyecto oculta botones de flujo de caja / control de costos si no aplica.

### Phase 8A — In-app notifications foundation

- **Prisma:** `Notification` + enums `NotificationType`, `NotificationSeverity`, `NotificationStatus`; relaciones `Tenant`, `Project`, `User` (recipient).
- **Servicio:** `packages/services/src/notifications/notification.service.ts` — inbox solo `recipientUserId` = actor; `createSystemNotification` valida membresía activa.
- **UI:** campana en `header.tsx` (conteo SSR en `app/(app)/layout.tsx`); página `/notificaciones` con filtros y acciones server.
- **Integraciones:** `confirmDocumentUpload` → uploader; `returnJobsiteLog` → `createdBy`; `approveCertification` → `createdBy` (best-effort `try/catch`).
- **Docs:** [`08-architecture/NOTIFICATIONS_ARCHITECTURE.md`](./08-architecture/NOTIFICATIONS_ARCHITECTURE.md).

### Phase 8B — Operational in-app alerts

- **Prisma:** nuevos valores en `NotificationType`: `RECEIVABLE_OVERDUE`, `PAYABLE_OVERDUE`, `NEGATIVE_STOCK`, `CERTIFICATION_APPROVED_WITHOUT_INVOICE`, `STALE_DOCUMENT_UPLOAD`.
- **Servicio:** `packages/services/src/notifications/operational-alerts.service.ts` — `runOverdueReceivablesAlert`, `runOverduePayablesAlert`, `runNegativeStockAlert`, `runApprovedCertificationsWithoutInvoiceAlert`, `runStaleUploadingDocumentsAlert`; resumen `{ checkedCount, createdCount, skippedCount, errors }`; idempotencia 7 días por `(tenantId, type, linkedEntityType, linkedEntityId, recipientUserId)` excl. `ARCHIVED`. Uploads viejos: notificar a `uploadedBy` solo si tiene membresía **ACTIVE** en el tenant; si no, OWNER/ADMIN.
- **Stock negativo:** `listNegativeStockBalancesForTenant` en `stock-balance.service.ts` (agregación igual que reportes, filtro `qty &lt; 0`).
- **Destinatarios:** `findActiveUsersForPermission` / `findActiveOwnerAdminUserIds`; sin preferencias. Invocación in-app: UI manual (8C) o cron HTTP (8D). Correo transaccional: servicio 8E (`notification-email.service`) solo si Resend está configurado y se invoca explícitamente — **no** automático desde 8C/8D.
- **Docs:** [`08-architecture/NOTIFICATIONS_ARCHITECTURE.md`](./08-architecture/NOTIFICATIONS_ARCHITECTURE.md).

### Phase 8C — Manual operational alerts runner

- **Servicio:** `operational-alerts-runner.service.ts` — `canRunOperationalAlerts` (OWNER/ADMIN), `runOperationalAlert`, `runAllOperationalAlerts`.
- **Web:** `/notificaciones/alertas` + `runOperationalAlertsDispatchAction`; enlace condicional desde `/notificaciones`; `notFound()` si no OWNER/ADMIN.
- **Docs / matriz:** `NOTIFICATIONS_ARCHITECTURE.md`, `PERMISSIONS_ROUTE_MATRIX.md`.

### Phase 8D — Protected cron runner (operational alerts)

- **HTTP:** `POST` o `GET` `/api/cron/operational-alerts` — `CRON_SECRET` (`Authorization: Bearer` o `x-cron-secret`); opcional `?tenantId=` (UUID, solo ACTIVE); **503** si secreto no configurado o &lt; 16 chars.
- **Servicios:** `operational-alerts-cron.service.ts` + `runAllOperationalAlertsForSystemContext` en `operational-alerts-runner.service.ts`.
- **Vercel:** `apps/web/vercel.json` — `0 12 * * *` (confirmar que el proyecto Vercel usa `apps/web` como root o replicar cron en dashboard).
- **Docs:** [`08-architecture/NOTIFICATIONS_ARCHITECTURE.md`](./08-architecture/NOTIFICATIONS_ARCHITECTURE.md), [`08-architecture/BACKGROUND_JOBS_ARCHITECTURE.md`](./08-architecture/BACKGROUND_JOBS_ARCHITECTURE.md).

### Phase 8E — Email foundation (Resend opcional)

- **Config:** `isEmailConfigured()`, `getEmailEnv()` → `null` si faltan `RESEND_*`; `getPublicAppBaseUrl()` para CTA.
- **Package:** `@bloqer/email` — `sendEmail`, templates `notification-email` / `operational-alert-email`.
- **Service:** `notification-email.service.ts` — sin envío automático desde runners ni cron; sin UI en esta fase.
- **Docs:** [`EMAIL_NOTIFICATIONS_ARCHITECTURE.md`](./08-architecture/EMAIL_NOTIFICATIONS_ARCHITECTURE.md), [`NOTIFICATIONS_ARCHITECTURE.md`](./08-architecture/NOTIFICATIONS_ARCHITECTURE.md).

## Phase 6A — Documents foundation (superseded by Phase 6B)

- PLACEHOLDER mode still works when R2 not configured
- `createDocumentMetadata` kept for internal use; primary path is `initiateDocumentUpload`
- `storageKey` always server-side via `buildStorageKey`; never from client
- DELETED hidden from list; no hard delete

## Phase 5F — Project Cash Flow known limitations

- **Real cash only**: CONFIRMED Collections and Payments — no accrual/committed view; open AR/AP not shown
- **No FX conversion**: currencies reported separately; never summed
- **No project opening balance**: cumulative starts at `dateFrom`, not project inception
- **No internal transfer attribution**: internal transfers excluded by design
- **Payment→supplier traversal**: `Payment` has no direct `supplierContact` relation; supplier name traversed via `payable.supplierInvoice.supplierContact`; if a payment has a cancelled/null payable link the query would error (not expected in valid data)
- **No global project cash flow**: single-project report only; no cross-project summary

## Phase 5E — Inventory Reports known limitations

- **No inventory valuation**: `unitCost` and `totalCost` captured per movement; no FIFO/AVG/LIFO costing method; P-INV-02
- **No stock reservations**: `quantityReserved` always null; `quantityAvailable = quantityOnHand`; P-INV-03
- **No snapshot/cache**: balance computed from raw movement scan on every request; P-INV-04
- **No stock adjustment UI**: ADJUSTMENT type stored but not exposed via form; adjustmentPresent flag shown; P-INV-05
- **noRecentMovement flag skipped**: no threshold defined; only `lastMovementDate` exposed
- **Zero stock hidden by default**: `includeZeroStock=false`; negative stock always shown regardless
- **Project dimension via warehouse**: filter `?projectId=` uses `warehouse.projectId`; movements consumed in a project but from a non-project warehouse are not captured
- **ADJUSTMENT treatment**: stored as raw quantity (no sign assumed); excluded from stock balance; shown with ⚠ badge in movement table

## Phase 5D — Treasury Reports known limitations

- **No FX conversion**: each currency reported separately; never summed across currencies
- **No bank reconciliation**: RECONCILED status not implemented; only CONFIRMED used
- **No cash flow forecast**: real (executed) cashflow only — no AR/AP projection
- **No project cash flow**: `AccountMovement` has no `projectId`; traceability via Collection→Receivable→Project or Payment→Payable→SupplierInvoice→Project deferred
- **No materialized views**: balance computed from raw movements on every request (N queries for N accounts in position report)
- **ADJUSTMENT sign convention pending**: ADJUSTMENT is displayed separately in cash flow `adjustments` field (raw stored amount); excluded from `netCashFlow` and `netOperatingCashFlow`; shown as raw amount in movement ledger (not negated); omitted from running balance; manual adjustment UI not implemented
- **Running balance only for single-account filter**: multi-account running balance is non-deterministic across accounts
- **recharts installed** at v2.x; chart colors use hardcoded hex (not CSS vars); dark mode color adaptation limited

## Phase 5B — Aging known limitations

- **No FX conversion**: amounts grouped by original currency; no ARS consolidation
- **No background OVERDUE job**: OVERDUE status derived on every read from dueDate vs asOfDate (P-TRZ-01 still pending)
- **No contact drilldown route**: expanded items shown inline in the table only
- **Search is post-query server-side JS filter**: filters in memory after the Prisma fetch; not a DB-level fulltext search
- **No materialized views**: direct queries on Receivable/Payable tables every request

---

## Known pending items (from PENDING_ARCHITECTURE_ITEMS.md)

| ID | Item |
|---|---|
| P-TRZ-01 | OVERDUE background job — currently computed on every read |
| P-TRZ-02 | FX collections + transfers (currencies must match in Phase 3C) |
| P-TRZ-03 | Overdraft policy per account (currently always blocked) |
| P-TRZ-04 | Manual adjustment UI (`/tesoreria/cuentas/[id]/ajuste`) — Phase 4 |
| P-TRZ-05 | Bank reconciliation (Phase 4) — no BankStatement entity yet |
| P-ERD-04 | Correlative invoice numbering (Q-002) |
| P-CERT-01 | Advisory lock for concurrent certification issuance |
| P-AP-02 | AP aging report — OVERDUE count/amount summary by project/company |
| P-PROC-01 | Over-receipt tolerance configurable per tenant (BR-PUR-006) — currently always blocks |
| P-PROC-02 | 3-way matching workflow (PO ↔ Receipt ↔ SupplierInvoice qty/amount validation) |
| P-PROC-03 | Committed/accrued/paid cost reporting (PO ISSUED = committed; Receipt CONFIRMED = accrued; Payment = paid) |
| ~~P-PROC-04~~ | ~~Inventory stock movements on receipt~~ — **RESOLVED in Phase 4C** |
| ~~P-INV-01~~ | ~~Warehouse transfers~~ — **RESOLVED in Phase 5C** |
| P-INV-02 | Inventory valuation FIFO/LIFO/AVG — unitCost captured but no costing method yet |
| P-INV-03 | Stock reservations (StockReservation entity) — deferred |
| P-INV-04 | OVERDUE-style balance snapshot / cache — balance always computed from raw movements |
| P-INV-05 | Stock adjustment UI (ADJUSTMENT source type defined but not exposed) |
| ~~P-SUB-01~~ | ~~edit DRAFT certification~~ — **RESOLVED: /certificaciones/[certId]/editar page added** |
| ~~P-SUB-02~~ | ~~Subcontract nav link on project detail~~ — **RESOLVED: Subcontratos button added to /proyectos/[id]** |
| ~~P-LOG-01~~ | ~~File/photo attachments on JobsiteLog~~ — **RESOLVED in Phase 6D** (`DocumentAttachment` + `EntityDocumentsPanel`; R2/PLACEHOLDER same as project docs) |
| P-LOG-02 | PDF export of Jobsite Log (daily report) — deferred |
| P-LOG-03 | Progress reporting: aggregate quantityCompleted per WBS ITEM across logs — no report UI yet |
| P-LOG-04 | Schedule/Gantt integration — no planned activity entity yet |
| P-LOG-05 | Automatic stock consumption on material usage — explicitly excluded; would require StockMovement CONSUMPTION on submit/approve |
| ~~P-DOC-01~~ | ~~Stale UPLOADING cleanup (metadata)~~ — **RESOLVED in Phase 6C** (`cleanupStaleUploadingDocuments`; no R2 object deletion) |
| P-DOC-01B | Scheduled job / platform cron to run stale UPLOADING cleanup per tenant (and optional orphan object removal in R2) — not implemented |
| P-DOC-02 | Antivirus/virus scanning on upload — no ClamAV or equivalent |
| P-DOC-03 | Per-module attachment panels — **partial:** JobsiteLog (6D), Certification (6E), SupplierInvoice / PurchaseOrder / PurchaseReceipt (6F), Subcontract / SubcontractCertification (6G), Budget (6H); WarehouseTransfer still not wired |
| P-DOC-04 | Document versioning (DocumentVersion model) — single file per record |

---

## Canonical commands (Phase 10D)

```bash
pnpm install
pnpm db:generate              # alias → @bloqer/database db:generate
pnpm --filter @bloqer/database db:migrate        # prisma migrate dev (crear/aplicar en dev)
pnpm --filter @bloqer/database db:migrate:deploy # prisma migrate deploy (prod/CI)
pnpm --filter @bloqer/database db:seed           # requiere SEED_USER_EMAIL
pnpm --recursive typecheck
pnpm --filter @bloqer/web lint
pnpm --filter @bloqer/web build   # opcional CI
```

Ver también [`08-architecture/ENVIRONMENT_VARIABLES.md`](./08-architecture/ENVIRONMENT_VARIABLES.md) y [`08-architecture/DEPLOYMENT_SMOKE_TEST.md`](./08-architecture/DEPLOYMENT_SMOKE_TEST.md).

## Commands that pass

```bash
pnpm --filter @bloqer/database db:generate   # ✔ Prisma Client generated
pnpm --recursive typecheck                    # ✔ 0 errors
pnpm --filter @bloqer/web lint                # ✔ 0 warnings or errors
```

## DB commands pending (require DATABASE_URL)

> Para cambios de schema versionados (p. ej. Phase 10C `tenant_invitations`), preferí **`prisma migrate`** en CI/prod; `db:push` abajo es solo referencia de entorno local y **no** reemplaza migraciones.

```bash
pnpm --filter @bloqer/database db:push        # needs Neon .env.local
pnpm --filter @bloqer/database db:seed        # needs SEED_USER_EMAIL in env
```

---

## Phase 5A — Cost Control design decisions and assumptions

**Cost layer definitions:**
- `committedCost` = ISSUED/PARTIALLY_RECEIVED/RECEIVED POs + ACTIVE Subcontracts (COMPLETED excluded)
- `receivedCost` = CONFIRMED PurchaseReceipts (own layer, not folded into accrued)
- `accruedCost` = ISSUED SupplierInvoices with PO link (proportional by POLine WBS weight) + APPROVED SubcontractCertificationLines
- `paidCost` = CONFIRMED Payments, allocated proportionally via invoice → PO/subCert chain
- `expectedCostExposure` = `max(committed, received, accrued)` per WBS — NOT sum
- `inventoryConsumedCost` = StockMovement OUT CONSUMPTION CONFIRMED with wbsNodeId
- Anti double-count (BR-COS-002): sub-cert-linked SupplierInvoices excluded from PO-proportional accrual

**Proportional WBS allocation assumption:** SupplierInvoiceLine has no wbsNodeId; amounts split by POLine total weight fractions. Documented, not hidden.

**Budget selection guard:** multiple APPROVED/CLOSED budgets → `BudgetSelectionRequired` (not an error). Single budget auto-selected in service.

**KPIs:** `certifiedApproved` = primary; `certifiedIssued` = informational. Both shown in UI.

**Unallocated costs:** always exposed in report totals section, never hidden.

**Decimal math:** all arithmetic via `Prisma.Decimal` methods. No JS number/float in cost calculations.

---

## Next recommended work (post Phase 6B)

- **Documents backlog**: P-DOC-01B (scheduled stale-upload cleanup), P-DOC-02 (antivirus), P-DOC-03 (per-module attachment panels), P-DOC-04 (versioning) — see pending table above.
- **Other product priorities** (examples): P-INV-02 inventory valuation; treasury/AR items in the pending table — follow [`08-architecture/IMPLEMENTATION_ROADMAP.md`](./08-architecture/IMPLEMENTATION_ROADMAP.md) and product ordering.

## Phase 5C — Warehouse Transfer design decisions

- **Paired movements**: every transfer creates exactly 2 StockMovements (TRANSFER_OUT source + TRANSFER_IN destination) linked by `warehouseTransferId`
- **Sequential numbering**: `MAX(number) + 1` inside transaction; `@@unique([tenantId, companyId, number])`; displayed as TR-001
- **Cancellation guard**: before cancelling, verify destination warehouse balance ≥ transfer quantity (BR-INV-002); error if destination has already consumed the stock
- **Stock preview UX**: server-side balance hint when `?sourceWarehouseId=&productId=` in URL; form updates URL via `router.replace` on select change; service validation is authoritative
- **No DRAFT state**: transfers are always CONFIRMED on creation (user-approved decision); only terminal state is CANCELLED
- **Named Prisma relations**: `@relation("TransferSource")` and `@relation("TransferDestination")` on Warehouse to resolve ambiguity

## Phase 5C — known limitations

- **No multi-product transfers**: one product per transfer; batch transfers require N separate WarehouseTransfers
- **totalCost not auto-computed**: if unitCost provided, totalCost = qty × unitCost (user input or could be derived — currently optional fields both passed through)
- **No project filter on list**: warehouseId OR filter + productId/status/date; no project-scoped transfer list
- **No partial cancellation**: cancel is all-or-nothing

---

## Rules for the next Claude session

1. **ServiceContext pattern** — every service mutation receives `{ actorUserId, tenantId, companyId, roles }`. Never skip.
2. **Decimal only** — all money is `Prisma.Decimal` in the DB, serialized to `string` in service views. Never `number` or `float`.
3. **No Prisma in React** — pages call services only. Components receive serialized view types.
4. **Transactions** — all multi-row mutations use `prisma.$transaction`.
5. **No hard delete** — use status CANCELLED on financial records.
6. **Audit log** — call `log()` from `audit.service.ts` after every mutation.
7. **`can(roles, action, module)`** — from `@bloqer/domain`. Always authorize before querying.
8. **Tenant guard** — after fetching any entity, check `entity.tenantId === ctx.tenantId`.
9. **OVERDUE is derived** — never stored; computed in `serializeReceivable` on every read.
10. **Validators in `@bloqer/validators`** — Zod schemas only; actions call `.safeParse()` before service.
11. **Spanish UI copy** — all visible text in Spanish (es-AR locale for dates/numbers).
12. **shadcn/ui components** — Button, Input, Label, Select, Textarea, Badge — no custom CSS.
13. **Server components for pages, "use client" for forms** — Next.js 15 App Router pattern.
14. **`pnpm --recursive typecheck` must pass 0 errors before handoff**.
