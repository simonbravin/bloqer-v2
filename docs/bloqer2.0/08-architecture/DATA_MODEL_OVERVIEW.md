# Data model overview — Bloqer 2.0

> Mapa del modelo lógico por **dominio de implementación**. No es schema Prisma.

## Decisión

Organizar el persistido en **PostgreSQL** en dominios alineados al monolito modular ([`MODULAR_MONOLITH.md`](./MODULAR_MONOLITH.md)). Cada dominio expone **servicios**; las FKs cruzan dominios solo donde el ERD funcional lo exige.

---

## Tenant, Company, Legal entity, Project ownership

### Definiciones propuestas

| Concepto | Significado en Bloqer |
|---|---|
| **Tenant** | Cuenta del cliente en el SaaS: aislamiento de datos, facturación de plataforma, límites de uso. Siempre presente. |
| **Company** | **Persona jurídica operativa** (razón social) del cliente: CUIT, razón social, posible emisor de facturas/compras. Es el ancla para “contabilidad por empresa” cuando hay más de una. |
| **Legal entity** | Sinónimo de **Company** en este modelo; no se introduce una tercera tabla salvo necesidad futura de holdings complejos. |
| **Project ownership** | **Proyecto** pertenece al **Tenant**; opcionalmente se asocia a una **Company** cuando el tenant opera varias razones sociales. El **cliente de obra** sigue siendo un **Contact** (rol cliente). |

### Q-001 abierta: dos alternativas

**Alternativa A — Tenant 1:1 Company (implícita)**  
- Una fila `company` por `tenant` creada automáticamente (o `company_id` omitido y todo cae en “default company”).  
- **Pros:** menor complejidad en Fase 1.  
- **Contras:** migración dolorosa si aparece multi-razón social; numeración y reportes pueden mezclar entidades legales distintas.

**Alternativa B — Tenant 1:N Company (recomendada)**  
- Tabla `company` con `tenant_id`; `project.company_id` **nullable al inicio** pero resuelto por regla de aplicación: si hay una sola company, asignar por defecto; si hay varias, obligar selección en proyecto o en documento.  
- **Pros:** compatible con grupos empresariales sin rediseño; AR/AP pueden anclarse a `company_id` cuando el producto lo exija.  
- **Contras:** más UI y validaciones.

**Recomendación:** **Alternativa B** desde el modelo de datos, con **comportamiento** de “una sola company invisible” hasta que el usuario cree la segunda. **No bloquea** el ERD: campos `company_id` opcionales + invariantes en service layer.

---

## 1. Identity / tenancy

**Tablas conceptuales:** `tenant`, `company`, `user`, `user_membership`, `role` (o catálogo global + `tenant_role` si hace falta), `invitation` (futuro).

- `user_membership`: une `user` + `tenant` + roles del producto ([`../00-product/PERMISSIONS_MATRIX.md`](../00-product/PERMISSIONS_MATRIX.md)); puede incluir `company_id` nullable para restringir visibilidad.
- Auth.js: tablas de sesión/cuenta según proveedor — **fuera** del núcleo ERP pero con FK lógica a `user`.

**Refs:** [`../02-modules/USERS_AND_PERMISSIONS.md`](../02-modules/USERS_AND_PERMISSIONS.md), [`AUTH_ARCHITECTURE.md`](./AUTH_ARCHITECTURE.md).

---

## 2. Directory

**Tablas:** `contact`, `contact_role`, perfiles opcionales por rol.

- Un **Contact** N roles ([D-016](../00-product/DECISION_LOG.md)).
- FKs de `project.client_contact_id`, `purchase_order.supplier_contact_id`, etc.

**Refs:** [`../02-modules/DIRECTORY.md`](../02-modules/DIRECTORY.md).

---

## 3. Projects

**Tablas:** `project`, `schedule`, `schedule_item`, vínculos opcionales a `wbs_node`.

- `project.tenant_id` obligatorio; `project.company_id` según alternativa B.
- `project_type`: `PUBLIC` | `PRIVATE` ([D-004](../00-product/DECISION_LOG.md)).

**Refs:** [`../02-modules/PROJECTS.md`](../02-modules/PROJECTS.md), [`../02-modules/PROJECT_SCHEDULING.md`](../02-modules/PROJECT_SCHEDULING.md).

---

## 4. Budgets

**Tablas:** `budget`, `budget_settings`, `wbs_node`, `cost_item`, `cost_analysis_line`.

- Estados: [`../01-domain/STATE_MACHINES.md`](../01-domain/STATE_MACHINES.md) (incl. `RETURNED_FOR_CHANGES`, [D-030](../00-product/DECISION_LOG.md)).
- `CLOSED`: sin mutación estructural; metadata whitelist ([BR-BUD-008](../01-domain/BUSINESS_RULES.md)).

**Refs:** [`../02-modules/BUDGETS.md`](../02-modules/BUDGETS.md), [`../02-modules/WBS_AND_COST_ITEMS.md`](../02-modules/WBS_AND_COST_ITEMS.md).

---

## 5. Contracts

**Tablas:** `contract`, `addendum`, `change_order` (y vínculos a `project`, `budget`).

- `addendum` efectos contractuales con estado `SIGNED` ([BR-ADD-001](../01-domain/BUSINESS_RULES.md)).

**Refs:** [`../02-modules/CONTRACTS_AND_ADDENDUMS.md`](../02-modules/CONTRACTS_AND_ADDENDUMS.md), [`../02-modules/CHANGE_ORDERS.md`](../02-modules/CHANGE_ORDERS.md).

---

## 6. Certifications

**Tablas:** `certification`, `certification_line`.

- `payment_status`: **derivado** (no columna de negocio obligatoria; ver [`MONEY_AND_DECIMAL_STRATEGY.md`](./MONEY_AND_DECIMAL_STRATEGY.md) / servicios).
- Sin `INVOICED` en `status` ([D-026](../00-product/DECISION_LOG.md)).

**Refs:** [`../02-modules/CERTIFICATIONS.md`](../02-modules/CERTIFICATIONS.md).

---

## 7. Procurement

**Tablas:** `purchase_order`, `purchase_order_line`, `receipt`, `receipt_line`, `purchase_invoice`, `purchase_invoice_line`, `payable` (vía factura).

- OC → N recepciones → N facturas ([D-020](../00-product/DECISION_LOG.md)).
- Impacto comprometido vs devengado: [`../04-formulas/COST_FORMULAS.md`](../04-formulas/COST_FORMULAS.md), [BR-COS-002](../01-domain/BUSINESS_RULES.md).

**Refs:** [`../02-modules/PROCUREMENT.md`](../02-modules/PROCUREMENT.md), [`../02-modules/PURCHASE_ORDERS_AND_RECEIPTS.md`](../02-modules/PURCHASE_ORDERS_AND_RECEIPTS.md).

---

## 8. Subcontracting

**Tablas:** `subcontract`, `subcontract_certification`, líneas, `payable` originada en certificación **APPROVED** ([BR-SUB-003](../01-domain/BUSINESS_RULES.md)).

- `replaces_certification_id` para sucesión tras `REJECTED` ([BR-SUB-005](../01-domain/BUSINESS_RULES.md)).
- `settlement_status` derivado ([D-027](../00-product/DECISION_LOG.md)).

**Refs:** [`../02-modules/SUBCONTRACTS.md`](../02-modules/SUBCONTRACTS.md).

---

## 9. Inventory

**Tablas:** `warehouse`, `product`, `stock_movement`, `stock_reservation`.

- Stock por depósito ([D-022](../00-product/DECISION_LOG.md)); transferencias = par de movimientos.
- Reserva: estados en [`../01-domain/STATE_MACHINES.md`](../01-domain/STATE_MACHINES.md) §25.

**Refs:** [`../02-modules/INVENTORY.md`](../02-modules/INVENTORY.md), [`../02-modules/WAREHOUSES.md`](../02-modules/WAREHOUSES.md).

---

## 10. Treasury (incl. AR / AP / ledger)

**Tablas:** `account`, `account_movement`, `internal_transfer`, `sales_invoice`, `receivable`, `collection`, aplicaciones, `payable`, `payment`, aplicaciones, `tax_line`, `movement_category`, `period`, `bank_reconciliation`, matches.

- Ver [`LEDGER_TABLES_STRATEGY.md`](./LEDGER_TABLES_STRATEGY.md).
- FX manual ([D-008](../00-product/DECISION_LOG.md)).

**Refs:** [`../03-finance/TREASURY_MODEL.md`](../03-finance/TREASURY_MODEL.md), [`../03-finance/ACCOUNT_MOVEMENTS.md`](../03-finance/ACCOUNT_MOVEMENTS.md), [`../03-finance/ACCOUNTS_RECEIVABLE.md`](../03-finance/ACCOUNTS_RECEIVABLE.md), [`../03-finance/ACCOUNTS_PAYABLE.md`](../03-finance/ACCOUNTS_PAYABLE.md).

---

## 11. Documents

**Tablas:** `document_attachment` (metadata en Postgres; binario en R2).

**Refs:** [`DOCUMENT_STORAGE_DATA_MODEL.md`](./DOCUMENT_STORAGE_DATA_MODEL.md), [`../02-modules/DOCUMENTS.md`](../02-modules/DOCUMENTS.md).

---

## 12. Reporting

- **Fase 1:** consultas SQL sobre tablas fuente + exports ([`REPORTING_DATA_MODEL.md`](./REPORTING_DATA_MODEL.md)).
- Sin data warehouse dedicado en esta propuesta; sí **vistas** o MV opcionales más adelante.

**Refs:** [`../06-reports/REPORT_CATALOG.md`](../06-reports/REPORT_CATALOG.md), [`REPORTING_ARCHITECTURE.md`](./REPORTING_ARCHITECTURE.md).

---

## 13. Audit

**Tablas:** `audit_log` (+ posiblemente `outbox` / `domain_event` en el futuro).

**Refs:** [`../02-modules/AUDIT_LOG.md`](../02-modules/AUDIT_LOG.md), [`AUDIT_FIELDS_STRATEGY.md`](./AUDIT_FIELDS_STRATEGY.md).

---

## 14. Notifications

**Tablas:** `notification`, (futuro) `notification_preference`.

**Refs:** [`../02-modules/NOTIFICATIONS.md`](../02-modules/NOTIFICATIONS.md), [`EMAIL_NOTIFICATIONS_ARCHITECTURE.md`](./EMAIL_NOTIFICATIONS_ARCHITECTURE.md).

---

## Problemas que evita este mapa

- Mezclar **ledger** con **documentos operativos** en una sola tabla.
- Perder **trazabilidad** entre certificación, factura y cobranza.
- Obligar **data warehouse** prematuro para MVP de reportes.

## Qué NO hacer

- No crear tablas “por cada pantalla”.  
- No persistir **labels en español** en columnas de negocio.  
- No omitir `tenant_id` en entidades operativas.

## Referencias cruzadas

- ERD técnico: [`TECHNICAL_ERD.md`](./TECHNICAL_ERD.md)  
- Convenciones: [`DATABASE_CONVENTIONS.md`](./DATABASE_CONVENTIONS.md)  
- Aislamiento: [`TENANT_ISOLATION_MODEL.md`](./TENANT_ISOLATION_MODEL.md)
