# Entity Relationships — Bloqer 2.0

> ERD **funcional** del dominio. Muestra **cómo se vinculan** las entidades. No es schema técnico.  
> El catálogo conceptual de entidades está en [`CORE_ENTITIES.md`](./CORE_ENTITIES.md).

---

## 1. ERD por bloques (5 diagramas)

Para que el ERD sea legible, lo dividimos en 5 vistas funcionales. Cada entidad lleva su `tenant_id` (omitido visualmente).

---

## 2. Bloque A — Multitenancy, usuarios, roles, auditoría

```mermaid
erDiagram
  TENANT ||--o{ COMPANY : "contiene"
  TENANT ||--o{ USER : "tiene"
  TENANT ||--o{ ROLE : "define"
  USER ||--o{ USER_ROLE_ASSIGNMENT : "asume"
  ROLE ||--o{ USER_ROLE_ASSIGNMENT : "asignado a"
  USER ||--o{ AUDIT_LOG : "genera"
  USER ||--o{ NOTIFICATION : "recibe"
  TENANT ||--o{ PERIOD : "controla"

  TENANT {
    uuid id PK
    string name
    string fiscal_id
    string base_currency
    string default_stock_method
  }
  USER {
    uuid id PK
    uuid tenant_id FK
    string email
    string status
  }
  ROLE {
    string code PK
    string scope
  }
  USER_ROLE_ASSIGNMENT {
    uuid user_id FK
    string role_code FK
    uuid project_id "opcional"
  }
  PERIOD {
    uuid id PK
    date start_date
    date end_date
    string status
  }
```

---

## 3. Bloque B — Directorio (contactos y roles)

```mermaid
erDiagram
  CONTACT ||--o{ CONTACT_ROLE : "puede tener"
  CONTACT ||--o| CLIENT_PROFILE : "como cliente"
  CONTACT ||--o| SUPPLIER_PROFILE : "como proveedor"
  CONTACT ||--o| SUBCONTRACTOR_PROFILE : "como subcontratista"

  CONTACT {
    uuid id PK
    string legal_name
    string fantasy_name
    string tax_id
    string email
    string phone
    string address
  }
  CONTACT_ROLE {
    uuid contact_id FK
    string role "CLIENT|SUPPLIER|SUBCONTRACTOR|EMPLOYEE|OTHER"
  }
  CLIENT_PROFILE {
    uuid contact_id PK
    decimal credit_limit
    int payment_terms_days
    string default_currency
  }
  SUPPLIER_PROFILE {
    uuid contact_id PK
    int payment_terms_days
    string default_currency
    string bank_account
  }
  SUBCONTRACTOR_PROFILE {
    uuid contact_id PK
    string specialty
    int payment_terms_days
  }
```

---

## 4. Bloque C — Proyectos, contratos, presupuestos, certificaciones

```mermaid
erDiagram
  PROJECT ||--|| CONTACT : "cliente"
  PROJECT ||--o{ CONTRACT : "tiene"
  PROJECT ||--o| SCHEDULE : "tiene"
  PROJECT ||--o{ BUDGET : "tiene"
  PROJECT ||--o{ CHANGE_ORDER : "registra"
  PROJECT ||--o{ RFI : "registra"
  PROJECT ||--o{ JOBSITE_LOG_ENTRY : "registra"
  PROJECT ||--o{ CERTIFICATION : "emite"

  CONTRACT ||--o{ ADDENDUM : "extendido por"
  CONTRACT }o--|| CONTACT : "con (cliente o proveedor)"

  BUDGET ||--o{ WBS_NODE : "agrupa"
  BUDGET ||--|| BUDGET_SETTINGS : "parametrizado"
  BUDGET }o--o| BUDGET : "fase complementaria"
  BUDGET }o--o| CONTRACT : "respaldado por"

  WBS_NODE ||--o{ WBS_NODE : "subnivel"
  WBS_NODE ||--o{ COST_ITEM : "contiene"
  COST_ITEM ||--o{ COST_ANALYSIS_LINE : "se descompone en"

  SCHEDULE ||--o{ SCHEDULE_ITEM : "contiene"
  SCHEDULE_ITEM }o--o| WBS_NODE : "vinculado opcional"

  CERTIFICATION ||--o{ CERTIFICATION_LINE : "tiene"
  CERTIFICATION_LINE }o--|| COST_ITEM : "certifica"
  CERTIFICATION ||--o| BUDGET : "respaldada por"

  CHANGE_ORDER }o--o| CONTRACT : "ajusta"
  CHANGE_ORDER ||--o{ COST_ITEM : "afecta"

  PROJECT {
    uuid id PK
    string code
    string name
    uuid client_id FK
    string project_type "PUBLIC|PRIVATE"
    string status
    string currency
    date start_date
    date end_date
  }
  BUDGET {
    uuid id PK
    uuid project_id FK
    int version
    string status
    decimal total_cost
    decimal total_sale_price
    uuid parent_budget_id "opcional"
  }
  CERTIFICATION {
    uuid id PK
    uuid project_id FK
    uuid budget_id FK
    int number
    date period_start
    date period_end
    decimal total_amount
    string status
  }
  CERTIFICATION_LINE {
    uuid id PK
    uuid certification_id FK
    uuid cost_item_id FK
    decimal physical_progress_pct
    decimal economic_amount
  }
```

---

## 5. Bloque D — Compras, recepciones, facturas, subcontratos, inventario

```mermaid
erDiagram
  PURCHASE_ORDER ||--o{ PURCHASE_ORDER_LINE : "contiene"
  PURCHASE_ORDER ||--o{ RECEIPT : "se recibe en"
  PURCHASE_ORDER ||--o{ PURCHASE_INVOICE : "se factura en"
  PURCHASE_ORDER }o--|| CONTACT : "proveedor"
  PURCHASE_ORDER }o--o| PROJECT : "imputable"

  RECEIPT ||--o{ RECEIPT_LINE : "contiene"
  RECEIPT_LINE }o--|| PURCHASE_ORDER_LINE : "cumple"
  RECEIPT }o--o| WAREHOUSE : "ingresa a"
  RECEIPT_LINE ||--o{ STOCK_MOVEMENT : "genera"

  PURCHASE_INVOICE ||--o{ PURCHASE_INVOICE_LINE : "contiene"
  PURCHASE_INVOICE_LINE }o--o| PURCHASE_ORDER_LINE : "factura (opcional)"
  PURCHASE_INVOICE_LINE }o--o| RECEIPT_LINE : "factura (opcional)"
  PURCHASE_INVOICE_LINE }o--o| WBS_NODE : "imputado a"
  PURCHASE_INVOICE ||--|| PAYABLE : "genera"

  SUBCONTRACT ||--|| CONTACT : "con subcontratista"
  SUBCONTRACT ||--o| CONTRACT : "respaldado por"
  SUBCONTRACT ||--o{ SUBCONTRACT_CERTIFICATION : "tiene avances"
  SUBCONTRACT_CERTIFICATION }o--o| PAYABLE : "genera al APPROVED"
  SUBCONTRACT_CERTIFICATION }o--o| SUBCONTRACT_CERTIFICATION : "replaces tras REJECTED"

  WAREHOUSE ||--o{ STOCK_MOVEMENT : "registra"
  PRODUCT ||--o{ STOCK_MOVEMENT : "moviliza"
  PRODUCT }o--o| CONTACT : "proveedor habitual"

  STOCK_RESERVATION }o--|| WAREHOUSE : "reserva en"
  STOCK_RESERVATION }o--|| PRODUCT : "reserva de"
  STOCK_RESERVATION }o--|| PROJECT : "para obra"

  PURCHASE_ORDER {
    uuid id PK
    uuid supplier_id FK
    uuid project_id FK "opcional"
    string number
    string status
    decimal total
    string currency
  }
  PURCHASE_INVOICE {
    uuid id PK
    uuid supplier_id FK
    uuid po_id FK "opcional"
    string number
    decimal total
    string status
  }
  STOCK_MOVEMENT {
    uuid id PK
    uuid product_id FK
    uuid warehouse_id FK
    string type "IN|OUT|ADJUSTMENT|TRANSFER_OUT|TRANSFER_IN"
    decimal quantity
    decimal unit_cost
    string source_doc_type
    uuid source_doc_id
    uuid transfer_id "opcional"
    date date
  }
```

---

## 6. Bloque E — Tesorería, AR, AP, impuestos, ventas

```mermaid
erDiagram
  ACCOUNT ||--o{ ACCOUNT_MOVEMENT : "registra"
  ACCOUNT_MOVEMENT }o--o| CONTACT : "contraparte"
  ACCOUNT_MOVEMENT }o--o| PROJECT : "imputable"
  ACCOUNT_MOVEMENT }o--o| MOVEMENT_CATEGORY : "categorizado por"
  ACCOUNT_MOVEMENT }o--o| PERIOD : "afecta"

  INTERNAL_TRANSFER ||--|{ ACCOUNT_MOVEMENT : "compone (par)"

  ACCOUNT_MOVEMENT ||--o{ TAX_LINE : "tiene impuestos"

  RECEIVABLE }o--|| CONTACT : "cliente"
  RECEIVABLE }o--o| PROJECT : "imputable"
  PAYABLE }o--|| CONTACT : "proveedor"
  PAYABLE }o--o| PROJECT : "imputable"

  RECEIVABLE ||--o{ COLLECTION : "se cobra con"
  PAYABLE ||--o{ PAYMENT : "se paga con"

  COLLECTION ||--|| ACCOUNT_MOVEMENT : "ingreso"
  PAYMENT ||--|| ACCOUNT_MOVEMENT : "egreso"

  COLLECTION ||--o{ TAX_LINE : "retenciones"
  PAYMENT ||--o{ TAX_LINE : "retenciones"

  SALES_INVOICE ||--|| RECEIVABLE : "genera"
  SALES_INVOICE }o--|| CONTACT : "cliente"
  SALES_INVOICE }o--o| PROJECT : "imputable"
  SALES_INVOICE }o--o| CERTIFICATION : "respaldada por"
  SALES_INVOICE ||--o{ TAX_LINE : "tiene impuestos"

  DIRECT_SALE ||--|| SALES_INVOICE : "genera"

  BANK_RECONCILIATION ||--|{ ACCOUNT_MOVEMENT : "concilia"

  ACCOUNT {
    uuid id PK
    string type "BANK|CASH|WALLET"
    string name
    string currency
    string status
  }
  ACCOUNT_MOVEMENT {
    uuid id PK
    uuid account_id FK
    string type "INCOME|OUTCOME"
    decimal amount
    string currency
    decimal fx_rate
    decimal amount_ars
    date date_accounting
    date date_value
    string status "DRAFT|CONFIRMED|RECONCILED|CANCELLED"
    uuid counterparty_id FK
    uuid project_id FK "opcional"
    string source_doc_type
    uuid source_doc_id
    uuid transfer_id "opcional"
  }
  RECEIVABLE {
    uuid id PK
    uuid client_id FK
    uuid project_id FK "opcional"
    decimal total_amount
    decimal paid_amount
    decimal balance
    date due_date
    string status
  }
  PAYABLE {
    uuid id PK
    uuid supplier_id FK
    uuid project_id FK "opcional"
    decimal total_amount
    decimal paid_amount
    decimal balance
    date due_date
    string status
  }
```

---

## 7. Vínculos transversales (todo lo de arriba se cruza con esto)

```mermaid
flowchart LR
  Doc[Document]
  Audit[AuditLog]
  Notif[Notification]
  Period[Period]

  AnyEntity[Cualquier entidad operativa] --> Doc
  AnyEntity --> Audit
  AnyEntity --> Notif
  ConfirmableEntity[Movimientos con fecha] --> Period
```

- Toda entidad puede tener **adjuntos** (Document) por relación polimórfica (`entity_type` + `entity_id`).
- Toda creación/edición/anulación crítica genera un `AuditLog`.
- Eventos de negocio generan `Notification` para roles afectados.
- Movimientos con fecha contable validan contra `Period` (no se puede tocar periodo cerrado).

---

## 8. Cardinalidades clave a tener presentes

| Origen | Destino | Cardinalidad | Notas |
|---|---|---|---|
| Tenant | cualquier entidad | 1:N | aislamiento total |
| Contact | ContactRole | 1:N | un contacto N roles |
| Contact | Project (cliente) | 1:N | un cliente N obras |
| Project | Budget | 1:N | versión activa + adendas/fases |
| Budget | WbsNode | 1:N | jerárquico |
| WbsNode | CostItem | 1:N | hojas |
| Project | Certification | 1:N | múltiples certificaciones |
| Certification | CertificationLine | 1:N | una por ítem |
| PurchaseOrder | Receipt | 1:N | recepciones parciales |
| PurchaseOrder | PurchaseInvoice | 1:N | múltiples facturas posibles |
| PurchaseInvoice | PurchaseInvoiceLine | 1:N | imputaciones |
| PurchaseInvoice | Payable | 1:1 | una factura = una CxP |
| SalesInvoice | Receivable | 1:1 | una factura = una CxC |
| Receivable | Collection | 1:N | parciales (D-010) |
| Payable | Payment | 1:N | parciales (D-010) |
| InternalTransfer | AccountMovement | 1:2 | par origen+destino (D-023) |
| Account | AccountMovement | 1:N | extracto |
| Warehouse | StockMovement | 1:N | inventario por depósito |
| Product | StockMovement | 1:N | movimientos por producto |
| BankReconciliation | AccountMovement | 1:N | conciliados |

---

## 9. Reglas de integridad funcional

### Integridad multi-tenant

- **R-INT-001**: ninguna FK puede apuntar a una entidad de otro tenant.
- **R-INT-002**: el `tenant_id` se hereda automáticamente del padre cuando se crea una entidad hija.

### Integridad de comprobantes

- **R-INT-003**: una `Certification` solo puede emitirse si el `Budget` referenciado está `APPROVED` o `CLOSED`.
- **R-INT-004**: una `PurchaseInvoice` con `po_id` debe tener líneas que correspondan a líneas del PO referenciado (validación blanda en Fase 1).
- **R-INT-005**: un `Receipt` solo puede confirmarse si la `PurchaseOrder` está `CONFIRMED`.
- **R-INT-006**: un `Payment` no puede aplicarse a una `Payable` de otro `Tenant` o de otro `Contact` distinto al supplier del payment.

### Integridad de tesorería

- **R-INT-007**: una `InternalTransfer` debe generar **exactamente 2** `AccountMovement` con el mismo `transfer_id` (uno OUTCOME en origen, uno INCOME en destino).
- **R-INT-008**: un `AccountMovement` con `status = RECONCILED` no se puede modificar.
- **R-INT-009**: ningún `AccountMovement` con `date_accounting` dentro de un `Period` cerrado puede crearse, editarse o anularse. Se requiere reapertura.

### Integridad de presupuestos

- **R-INT-010**: un `Budget` con status `CLOSED` no admite edición de `WbsNode`, `CostItem` ni `CostAnalysisLine`. Solo a través de adendas.
- **R-INT-011**: `parent_budget_id` siempre apunta a un Budget del **mismo proyecto**.

### Integridad de inventario

- **R-INT-012**: el saldo de stock por (producto, depósito) nunca puede ser negativo en estado confirmado (excepción: ajustes manuales con motivo).
- **R-INT-013**: una `TRANSFER` genera **exactamente 2** `StockMovement` con el mismo `transfer_id`.

### Integridad de certificación

- **R-INT-014**: la suma de `physical_progress_pct` acumulada por `CostItem` no puede exceder 100% sin que el proyecto sea de tipo `PRIVATE` con nota aclaratoria (D-004).
- **R-INT-015**: la suma de `economic_amount` acumulada por `CostItem` no puede exceder el total presupuestado del item, salvo el mismo caso de D-004.

### Integridad de adendas y documentos de obra

- **R-INT-016**: un `Addendum` solo dispara efectos sobre **base contractual/comercial** (p. ej. aplicación de `Budget` complementario) cuando `status = SIGNED` ([BR-ADD-001]).
- **R-INT-017**: la anulación de un `StockMovement` `CONFIRMED` cumple [BR-INV-007] (compensación o procedimiento explícito); no se borra el registro sin trazabilidad.

### Integridad de certificaciones de subcontrato

- **R-INT-018**: `replaces_certification_id` (o equivalente) solo referencia un `SubcontractCertification` **`REJECTED`** del **mismo** `subcontract_id`; el sucesor no reabre el rechazado ([BR-SUB-005]).

---

## 10. Polimorfismos del modelo

Algunas relaciones son **polimorfas** (apuntan a varios tipos de entidad). Esto se documenta así:

| Entidad polimorfa | Tipos posibles de destino |
|---|---|
| `Document.entity` | Project, Contract, Certification, PurchaseOrder, PurchaseInvoice, SalesInvoice, JobsiteLogEntry, Rfi, ChangeOrder, Subcontract |
| `AccountMovement.source_doc` | Collection, Payment, InternalTransfer, manual |
| `Receivable.source_doc` | SalesInvoice, manual |
| `Payable.source_doc` | PurchaseInvoice, SubcontractCertification, manual |
| `TaxLine.parent_doc` | SalesInvoice, PurchaseInvoice, Payment, Collection, Certification |
| `AuditLog.entity` | cualquier entidad operativa |

Implementación física: pareja `entity_type` + `entity_id` (no enforce a nivel FK clásica).

---

## 11. Lo que el ERD NO muestra (intencionalmente)

- **Soft-delete** de cada entidad: implícito por convención.
- **Auditoría técnica** (`created_at`, `updated_at`, `created_by`, `updated_by`): asumida en toda entidad.
- **Cachés de saldo** (ej. `Account.balance_cached`): se asumen pero su definición técnica viene en la fase de modelo de datos.
- **Índices, constraints físicas**: técnicos, no funcionales.

---

## 12. Próximos pasos del modelo

Cuando se pase a la fase de modelo de datos técnico:

1. Decidir motor de DB y estilo (relacional puro, multi-tenant strategy: schema por tenant, columna por tenant, etc.).
2. Definir convenciones físicas (snake_case, plurales, soft-delete, timestamps).
3. Resolver polimorfismos físicamente (tabla pivote vs tipo+id).
4. Definir generadores de número (numeración de comprobantes — Q-002).
5. Caches y materialized views para reportes.
6. Estrategia de migrations.
