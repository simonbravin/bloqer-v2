# Core Entities — Bloqer 2.0

> **Catálogo conceptual** de entidades del dominio. **No es schema de base de datos**. Solo describe **qué representa cada entidad y para qué existe**.  
> El modelado relacional concreto vendrá en una fase posterior. Esta lista es la referencia funcional.

---

## 1. Convenciones de este catálogo

- Los nombres de entidad son en **PascalCase singular en inglés** (ver [`AGENTS.md`](../AGENTS.md) §8 y §3 *Canonical naming*).
- Cada entidad indica:
  - **Propósito** — para qué existe
  - **Identidad** — qué la identifica funcionalmente
  - **Atributos clave** — los principales campos funcionales (no exhaustivo)
  - **Estados típicos** — referencia a [`STATE_MACHINES.md`](./STATE_MACHINES.md)
  - **Tenant-scoped** — sí/no (casi siempre sí)
- Los nombres físicos de tablas/columnas se decidirán en la fase de modelo de datos.

---

## 2. Entidades transversales (la base)

### Tenant
- **Propósito:** representa una empresa cliente del SaaS. Aísla todos los datos.
- **Identidad:** `tenant_id` único.
- **Atributos clave:** nombre, CUIT/identificador fiscal, configuración de moneda base, método default de stock, zona horaria, estado (activo/suspendido).
- **Tenant-scoped:** N/A (es la raíz).

### Company
- **Propósito:** razón social dentro de un tenant. Pendiente decidir si es 1:1 con tenant o N:1 ([Q-001]).
- **Identidad:** `company_id`.
- **Atributos clave:** nombre legal, CUIT, dirección fiscal, datos bancarios.
- **Tenant-scoped:** sí.

### User
- **Propósito:** persona física que ingresa al sistema.
- **Identidad:** email + tenant.
- **Atributos clave:** nombre, email, hash de contraseña, 2FA, último login, estado.
- **Tenant-scoped:** sí (un usuario por tenant; si la misma persona pertenece a dos tenants tiene dos cuentas).

### Role
- **Propósito:** define qué permisos tiene un usuario. Predefinidos en [`USER_ROLES.md`](../00-product/USER_ROLES.md).
- **Identidad:** nombre del rol (`OWNER`, `ADMIN`, `PROJECT_MANAGER`, etc.).
- **Atributos clave:** nombre, descripción, alcance (global / por proyecto).
- **Tenant-scoped:** sí.

### UserRoleAssignment
- **Propósito:** vincula un usuario con un rol (global o sobre un proyecto).
- **Atributos clave:** user_id, role, scope (global o project_id).
- **Tenant-scoped:** sí.

### AuditLog
- **Propósito:** registra acciones críticas del sistema.
- **Atributos clave:** timestamp, user_id, action, entity_type, entity_id, before, after, ip.
- **Tenant-scoped:** sí.

### Document
- **Propósito:** contenedor lógico de adjuntos vinculado polimórficamente a una entidad; puede tener **versiones** (`DocumentVersion`).
- **Atributos clave:** nombre, entity_type, entity_id, `status` (`ACTIVE` \| `ARCHIVED` \| `DELETED`), uploaded_by, version actual (referencia).
- **Estados:** ver [`STATE_MACHINES.md`](./STATE_MACHINES.md) §26.1 Document.
- **Tenant-scoped:** sí.

### DocumentVersion
- **Propósito:** una revisión publicable de un archivo (cuando el tenant habilita versionado).
- **Atributos clave:** document_id, storage_url, mime_type, size_bytes, `status` (`DRAFT` \| `ACTIVE` \| `SUPERSEDED` \| `ARCHIVED`), published_at.
- **Estados:** ver [`STATE_MACHINES.md`](./STATE_MACHINES.md) §26.2 DocumentVersion.
- **Tenant-scoped:** sí.

### Notification
- **Propósito:** mensaje hacia un usuario sobre un evento del sistema.
- **Atributos clave:** user_id, type, payload, read_at, created_at.
- **Tenant-scoped:** sí.

### Period
- **Propósito:** rango temporal (típicamente mensual) que se puede cerrar.
- **Atributos clave:** start_date, end_date, status (`OPEN | CLOSED`), closed_by, closed_at.
- **Tenant-scoped:** sí.

---

## 3. Master Data (catálogos parametrizables)

### Currency
- **Propósito:** monedas habilitadas para el tenant.
- **Atributos clave:** code (ARS, USD), symbol, decimals.

### Unit
- **Propósito:** unidad de medida (m², kg, hora, gl, etc.).
- **Atributos clave:** code, name, type (área, peso, tiempo, etc.).

### Category
- **Propósito:** clasificación jerárquica usada en presupuesto, productos, movimientos. Soporta jerarquía.
- **Atributos clave:** name, parent_id, type (cost / revenue / movement / product), level.

### TaxType
- **Propósito:** tipo de impuesto/retención cargable manualmente (IVA, IIBB, Ganancias, SUSS, etc.).
- **Atributos clave:** name, default_rate, base (sobre qué se aplica).

### MovementCategory
- **Propósito:** categoriza movimientos de tesorería (cobranza, pago, transferencia, gasto general, etc.).
- **Atributos clave:** name, sign (+/-), default_account.

### DocumentType
- **Propósito:** tipo de documento (OC, factura A, factura B, certificado, contrato, recibo, libre).
- **Atributos clave:** name, requires_legal_number, default_template.

---

## 4. Directorio (contactos y roles)

### Contact
- **Propósito:** entidad raíz del directorio. Persona física o jurídica.
- **Identidad:** CUIT/CUIL único por tenant (validación recomendada).
- **Atributos clave:** legal_name, fantasy_name, tax_id, address, phone, email, contact_persons[], notes.
- **Tenant-scoped:** sí.

### ContactRole
- **Propósito:** rol funcional que cumple el contacto.
- **Valores:** `CLIENT`, `SUPPLIER`, `SUBCONTRACTOR`, `EMPLOYEE`, `OTHER`.
- **Relación:** Contact ↔ ContactRole es N:M (un contacto puede ser cliente y proveedor).

### ClientProfile
- **Propósito:** datos específicos del Contact cuando opera como cliente (límite de crédito, condiciones de pago, etc.).
- **Atributos clave:** credit_limit, payment_terms_days, default_currency.

### SupplierProfile
- **Propósito:** datos específicos del Contact cuando opera como proveedor.
- **Atributos clave:** payment_terms_days, default_currency, bank_account.

### SubcontractorProfile
- **Propósito:** datos específicos del Contact cuando opera como subcontratista.
- **Atributos clave:** specialty, certifications, payment_terms_days.

---

## 5. Proyectos y planes

### Project
- **Propósito:** la obra. Unidad central de negocio.
- **Identidad:** code (interno) + name.
- **Atributos clave:** code, name, client_id, location, start_date, end_date, project_type (`PUBLIC` / `PRIVATE`), status, currency, total_amount.
- **Tenant-scoped:** sí.
- **Estados:** `DRAFT | ACTIVE | ON_HOLD | COMPLETED | CANCELLED`.

### Schedule
- **Propósito:** cronograma del proyecto (contenedor de ítems).
- **Atributos clave:** project_id, type (`GANTT` / `MILESTONES` / `HYBRID`), metadata.
- **Lifecycle:** en Fase 1 no tiene máquina de estados propia separada del proyecto; ver [`STATE_MACHINES.md`](./STATE_MACHINES.md) §27.
- **Decisión pendiente:** ver [Q-003].

### ScheduleItem
- **Propósito:** tarea o hito dentro del cronograma.
- **Atributos clave:** schedule_id, name, type (`TASK` / `MILESTONE`), start_date, end_date, duration, dependencies[], wbs_item_id (opcional, ver [Q-004]), progress_pct, `status` (`PLANNED` \| `IN_PROGRESS` \| `BLOCKED` \| `COMPLETED` \| `CANCELLED`), block_reason (si `BLOCKED`).
- **Estados:** ver [`STATE_MACHINES.md`](./STATE_MACHINES.md) §27.1 ScheduleItem.

### Contract
- **Propósito:** contrato legal con cliente o con proveedor/subcontratista.
- **Atributos clave:** project_id, contact_id, contract_type (`CLIENT` / `SUPPLIER` / `SUBCONTRACTOR`), amount, currency, start_date, end_date, document_id, status.
- **Estados:** `DRAFT | ACTIVE | EXPIRED | CANCELLED`.

### Addendum
- **Propósito:** adenda que extiende un contrato.
- **Atributos clave:** contract_id, amount_delta, scope_change, effective_date, document_id, `status` (`DRAFT` \| `IN_REVIEW` \| `APPROVED` \| `SIGNED` \| `CANCELLED`).
- **Estados:** ver [`STATE_MACHINES.md`](./STATE_MACHINES.md) §4.2 Addendum ([BR-ADD-001]).

---

## 6. Presupuestos

### Budget
- **Propósito:** plan económico del proyecto.
- **Atributos clave:** project_id, version, name, status, total_cost, total_sale_price, currency, contract_id (opcional), parent_budget_id (si es adenda/fase complementaria); en `CLOSED` solo whitelist metadata [BR-BUD-008].
- **Estados:** `DRAFT | IN_REVIEW | RETURNED_FOR_CHANGES | APPROVED | CLOSED | SUPERSEDED | CANCELLED`.

### WbsNode
- **Propósito:** nodo de la jerarquía WBS dentro de un presupuesto.
- **Atributos clave:** budget_id, parent_id, code, name, level, order.

### CostItem
- **Propósito:** ítem hoja del WBS (lo que se mide y se certifica).
- **Atributos clave:** wbs_node_id, code, description, unit_id, quantity, unit_cost, unit_price, total_cost, total_price.
- **Relación:** un CostItem tiene su análisis de costos detallado.

### CostAnalysisLine
- **Propósito:** desglose de costo de un CostItem (mat / MO / equipo / subcontrato).
- **Atributos clave:** cost_item_id, type (`MATERIAL` / `LABOR` / `EQUIPMENT` / `SUBCONTRACT` / `OTHER`), product_id (opcional), quantity, unit_cost, total_cost.

### BudgetSettings
- **Propósito:** parámetros del presupuesto (overhead %, financial cost rate, profit margin %, taxes %).
- **Atributos clave:** budget_id, overhead_pct, financial_cost_rate, profit_margin_pct, tax_pct.

---

## 7. Comercial

### ChangeOrder
- **Propósito:** ajuste de alcance/precio de ítems del WBS sin generar adenda formal.
- **Atributos clave:** project_id, contract_id (opcional), description, items_affected[], amount_delta, status, document_id.
- **Estados:** `DRAFT | SUBMITTED | APPROVED | REJECTED | CANCELLED`.

### Rfi
- **Propósito:** request for information.
- **Atributos clave:** project_id, raised_by, raised_to (contact o usuario interno), subject, description, response, `status`, `due_date`, priority, `closure_without_response_reason` (si aplica), `is_overdue` (derivado).
- **Estados:** `DRAFT | SUBMITTED | ANSWERED | CLOSED | CANCELLED` — ver [`STATE_MACHINES.md`](./STATE_MACHINES.md) §16 ([BR-RFI-001], [BR-RFI-002]).

### Certification
- **Propósito:** documento de avance certificado al cliente.
- **Atributos clave:** project_id, budget_id, period_start, period_end, number, total_amount, `status`, `payment_status` (derivado), document_id.
- **`status` (ciclo de vida documental/operativo):** `DRAFT | ISSUED | APPROVED | REJECTED | CANCELLED`. **Sin** `INVOICED` ([BR-CERT-007]): “¿facturada?” = existe `SalesInvoice`/`Receivable` vinculada. Cobro sigue en AR/cobranzas.
- **`payment_status` (financiero derivado, solo lectura en flujo normal):** `UNPAID | PARTIALLY_PAID | PAID | OVERDUE` — calculado desde AR y aplicaciones de cobro vinculadas ([BR-CERT-PAYMENT-001], [`STATE_MACHINES.md`](./STATE_MACHINES.md) §5.2).

### CertificationLine
- **Propósito:** línea de avance por ítem dentro de una certificación.
- **Atributos clave:** certification_id, cost_item_id, physical_progress_pct, economic_amount, accumulated_physical_pct, accumulated_economic_amount.

### SalesInvoice
- **Propósito:** factura de venta emitida al cliente.
- **Atributos clave:** project_id (opcional para venta general), client_id, type (`A`/`B`/`C`/`E`), number, issue_date, due_date, items[], subtotal, taxes[], total, currency, status, certification_id (opcional), document_id.
- **Estados:** `DRAFT | ISSUED | PAID | OVERDUE | CANCELLED`.

### DirectSale
- **Propósito:** venta directa sin certificación previa (caso obras chicas o servicios).
- **Atributos clave:** project_id (opcional), client_id, items[], total, sales_invoice_id.

---

## 8. Compras y operaciones

### PurchaseOrder
- **Propósito:** orden de compra a proveedor.
- **Atributos clave:** supplier_id, project_id (opcional), number, issue_date, expected_date, items[], subtotal, taxes[], total, currency, status, document_id.
- **Estados:** `DRAFT | SUBMITTED | APPROVED | CONFIRMED | RECEIVED_PARTIAL | RECEIVED_FULL | CANCELLED`.

### PurchaseOrderLine
- **Propósito:** línea de OC.
- **Atributos clave:** po_id, product_id (opcional), description, unit_id, quantity, unit_cost, total_cost, wbs_item_id (imputación).

### Receipt
- **Propósito:** recepción de bienes/servicios contra una OC.
- **Atributos clave:** po_id, receipt_date, items[], status, warehouse_id (si aplica), document_id.
- **Estados:** `DRAFT | CONFIRMED | CANCELLED`.

### ReceiptLine
- **Propósito:** línea de recepción.
- **Atributos clave:** receipt_id, po_line_id, quantity_received, notes.

### PurchaseInvoice
- **Propósito:** factura recibida del proveedor.
- **Atributos clave:** supplier_id, project_id (opcional), po_id (opcional), number (proveedor), issue_date, due_date, items[], subtotal, taxes[], retentions[], total, currency, status, document_id.
- **Estados:** `DRAFT | ISSUED | APPROVED | PAID | OVERDUE | CANCELLED`.

### PurchaseInvoiceLine
- **Propósito:** línea de factura de compra.
- **Atributos clave:** invoice_id, description, quantity, unit_cost, total_cost, wbs_item_id (imputación), po_line_id (opcional), receipt_line_id (opcional).

### Subcontract
- **Propósito:** contrato con un subcontratista para ejecutar tareas de obra.
- **Atributos clave:** project_id, subcontractor_id, contract_id, amount, currency, items[], status.
- **Estados:** `DRAFT | ACTIVE | COMPLETED | CANCELLED`.

### SubcontractCertification
- **Propósito:** certificación de avance del subcontratista.
- **Atributos clave:** subcontract_id, period_start, period_end, lines[], total, `status`, **`settlement_status`** (derivado desde `Payable` / pagos; `UNSETTLED` \| `PARTIALLY_SETTLED` \| `SETTLED` \| `OVERDUE`), `replaces_certification_id` (opcional, en nueva versión tras `REJECTED` — [BR-SUB-005]).
- **`status`:** `DRAFT | SUBMITTED | APPROVED | REJECTED | CANCELLED` — ver [`STATE_MACHINES.md`](./STATE_MACHINES.md) §19 ([BR-SUB-003], [BR-SUB-004]).

---

## 9. Inventario

### Product
- **Propósito:** material o producto stockeable.
- **Atributos clave:** code, name, description, unit_id, category_id, default_supplier_id.

### Warehouse
- **Propósito:** depósito físico.
- **Atributos clave:** code, name, location, project_id (opcional si es depósito de obra), valuation_method (`FIFO` / `MOVING_AVG`).

### StockMovement
- **Propósito:** movimiento de entrada/salida de un producto en un depósito.
- **Atributos clave:** product_id, warehouse_id, type (`IN` / `OUT` / `ADJUSTMENT` / `TRANSFER_OUT` / `TRANSFER_IN`), quantity, unit_cost, total_cost, source_doc_type, source_doc_id, transfer_id (si aplica), date, `status` (`DRAFT` \| `CONFIRMED` \| `CANCELLED`), reverses_movement_id (si compensa otro).
- **Estados:** ver [`STATE_MACHINES.md`](./STATE_MACHINES.md) §9 ([BR-INV-007]).

### StockReservation
- **Propósito:** reserva de stock para una obra (ver [Q-019]).
- **Atributos clave:** product_id, warehouse_id, quantity, project_id, reserved_by, expires_at, `status` (`ACTIVE` \| `PARTIALLY_RELEASED` \| `RELEASED` \| `CONSUMED` \| `CANCELLED`), `consumed_by_movement_id` (si `CONSUMED`).
- **Estados:** [`STATE_MACHINES.md`](./STATE_MACHINES.md) §25 ([BR-INV-006], [BR-INV-008]).

### BankReconciliation
- **Propósito:** sesión de conciliación de extracto vs movimientos de una cuenta en un rango.
- **Atributos clave:** account_id, period_start, period_end, opening_balance, closing_balance, `status` (`DRAFT` \| `IN_PROGRESS` \| `CLOSED` \| `CANCELLED`).
- **Estados:** [`STATE_MACHINES.md`](./STATE_MACHINES.md) §24.

---

## 10. Tesorería

### Account
- **Propósito:** cuenta bancaria o caja.
- **Atributos clave:** type (`BANK` / `CASH` / `WALLET`), name, currency, bank_name (si aplica), bank_account_number, balance_cached.
- **Estados:** `ACTIVE | INACTIVE | CLOSED`.

### AccountMovement
- **Propósito:** **movimiento atómico** del ledger unificado de tesorería. La pieza clave del modelo financiero (ver [D-024]).
- **Atributos clave:** account_id, type (`INCOME` / `OUTCOME`), amount, currency, fx_rate, amount_ars, date_accounting, date_value, status (`DRAFT` / `CONFIRMED` / `RECONCILED` / `CANCELLED`), counterparty_id, project_id (opcional), category_id, source_doc_type, source_doc_id, transfer_id (si transferencia interna), notes.

### InternalTransfer
- **Propósito:** transferencia entre dos cuentas propias del mismo tenant.
- **Atributos clave:** from_account_id, to_account_id, amount_from, amount_to (puede diferir si distinto FX), date_accounting, date_value, fx_rate, transfer_id (compartido por los dos AccountMovement asociados).

### BankReconciliation
- **Propósito:** sesión de conciliación de un extracto bancario contra movimientos.
- **Atributos clave:** account_id, period_start, period_end, opening_balance, closing_balance, reconciled_movements[], unreconciled_count, status.

---

## 11. AR / AP / Impuestos

### Receivable
- **Propósito:** Cuenta por Cobrar.
- **Atributos clave:** client_id, project_id (opcional), source_doc_type, source_doc_id, total_amount, paid_amount, balance, due_date, currency, status.
- **Estados:** `OPEN | PARTIAL | PAID | OVERDUE | CANCELLED`.

### Payable
- **Propósito:** Cuenta por Pagar.
- **Atributos clave:** supplier_id, project_id (opcional), source_doc_type, source_doc_id, total_amount, paid_amount, balance, due_date, currency, status.
- **Estados:** `OPEN | PARTIAL | PAID | OVERDUE | CANCELLED`.

### Payment
- **Propósito:** pago aplicado a una o más Payables.
- **Atributos clave:** supplier_id, account_id, amount, currency, fx_rate, date, applies_to[] (lista de Payable + monto), retentions[], document_id.

### Collection
- **Propósito:** cobranza aplicada a una o más Receivables.
- **Atributos clave:** client_id, account_id, amount, currency, fx_rate, date, applies_to[] (lista de Receivable + monto), retentions[], document_id.

### TaxLine
- **Propósito:** línea de impuesto/retención aplicada a un comprobante.
- **Atributos clave:** parent_doc_type, parent_doc_id, tax_type_id, base, rate, amount, sign (+/-).

---

## 12. Libro de Obra

### JobsiteLogEntry
- **Propósito:** parte diario de obra.
- **Atributos clave:** project_id, date, weather, crew_count, tasks_done, materials_received, events, attachments[], created_by, status.
- **Estados:** `DRAFT | SUBMITTED | APPROVED`.

---

## 13. Reportes y dashboards

> Estas no son entidades persistidas como tablas, sino **agregaciones** sobre entidades existentes. Se documentan en [`06-reports/`](../06-reports/).

Existen, conceptualmente:
- `ProjectProfitabilitySummary`
- `BudgetVsActualReport`
- `CashflowReport`
- `CashflowProjectionReport`
- `ARAgingReport`
- `APAgingReport`
- `StockReport`
- `CertificationsEvolutionReport`

---

## 14. Vista de relaciones (texto)

```
Tenant
├── Companies (Q-001)
├── Users
│   └── UserRoleAssignments
├── Contacts
│   ├── ContactRoles
│   ├── ClientProfile
│   ├── SupplierProfile
│   └── SubcontractorProfile
├── Projects
│   ├── Schedule (ScheduleItems)
│   ├── Contracts (Addendums)
│   ├── Budgets
│   │   └── WbsNodes
│   │       └── CostItems
│   │           └── CostAnalysisLines
│   ├── ChangeOrders
│   ├── Rfis
│   ├── JobsiteLogEntries
│   ├── Certifications (CertificationLines)
│   └── Subcontracts (SubcontractCertifications)
├── Procurement
│   ├── PurchaseOrders (POLines)
│   ├── Receipts (ReceiptLines)
│   └── PurchaseInvoices (Lines)
├── Inventory
│   ├── Products
│   ├── Warehouses
│   ├── StockMovements
│   └── StockReservations
├── Treasury
│   ├── Accounts
│   ├── AccountMovements
│   ├── InternalTransfers
│   └── BankReconciliations
├── AR / AP
│   ├── Receivables (Collections)
│   └── Payables (Payments)
├── Taxes
│   └── TaxLines
├── MasterData
│   ├── Currencies
│   ├── Units
│   ├── Categories
│   ├── TaxTypes
│   ├── MovementCategories
│   └── DocumentTypes
├── Documents
├── Notifications
├── Periods
└── AuditLog
```

ERD funcional con relaciones explícitas en [`ENTITY_RELATIONSHIPS.md`](./ENTITY_RELATIONSHIPS.md).

---

## 15. Reglas globales sobre entidades

- **Tenant-id obligatorio**: toda entidad operativa lleva `tenant_id`.
- **Soft-delete preferente**: comprobantes legales no se borran; se anulan.
- **Inmutabilidad**: comprobantes con valor legal en estado terminal son inmutables (ver [D-025]).
- **Trazabilidad**: cada entidad guarda `created_at`, `updated_at`, `created_by`, `updated_by`.
- **Multi-moneda**: cada monto tiene currency + amount + fx_rate + amount_ars (cuando aplica).
- **Multi-warehouse**: stock siempre por depósito.

---

## 16. Entidades pendientes de definir (Fase 2/3)

- `ClientPortalSession` — sesiones de cliente externo.
- `BankFeed` / `BankImport` — para importación automática de extractos.
- `EFInvoiceMapping` — mapeo a facturación electrónica AFIP.
- `WorkflowApproval` — flujos multinivel (Fase 2).
- `ReportTemplate` — plantillas guardadas del query builder.
