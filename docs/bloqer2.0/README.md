# Bloqer 2.0 — Documentación Funcional Maestra

> **Estado:** Especificación funcional (`00-product`–`07-non-functional`) + **arquitectura técnica** en [`08-architecture/`](./08-architecture/README.md). Esta carpeta **no** contiene código fuente, schema Prisma ni endpoints implementados.
> **Audiencia primaria:** Agentes IA (Claude / Cursor) trabajando con esta carpeta como contexto principal, y humanos del equipo de producto/ingeniería.
> **Idioma:** Español (Argentina) para narrativa funcional y labels de producto descritos en texto. **Nombres canónicos** (entidades, campos, enums, estados, eventos, APIs) en **inglés** — ver [`AGENTS.md`](./AGENTS.md#3-canonical-naming-and-language-rules) §3 y [`GLOSSARY.md`](./00-product/GLOSSARY.md#canonical-naming-and-language-rules).

---

## 1. ¿Qué es esto?

Esta carpeta contiene la **especificación funcional completa** de **Bloqer 2.0**: un ERP SaaS para empresas constructoras.

No describe cómo se implementa.  
Describe **qué tiene que hacer el producto**, **por qué**, **para quién**, y **bajo qué reglas**.

La **fuente de verdad funcional** vive en `00-07`. La **primera capa de “cómo construir”** vive en `08-architecture/`, siempre **subordinada** a la spec funcional y a [`DECISION_LOG.md`](./00-product/DECISION_LOG.md).  
Si una decisión técnica contradice la spec, primero se actualiza el documento correspondiente, luego se programa.

---

## 2. Cómo usar esta documentación

### Si sos un humano leyendo por primera vez:

Leer en este orden:

1. [`AGENTS.md`](./AGENTS.md) — cómo navegar y citar estos docs.
2. [`00-product/PRODUCT_VISION.md`](./00-product/PRODUCT_VISION.md) — la visión.
3. [`00-product/PRODUCT_SCOPE.md`](./00-product/PRODUCT_SCOPE.md) — qué hace y qué no.
4. [`00-product/DECISION_LOG.md`](./00-product/DECISION_LOG.md) — decisiones lockeadas.
5. [`01-domain/DOMAIN_OVERVIEW.md`](./01-domain/DOMAIN_OVERVIEW.md) — vista de pájaro del dominio.
6. [`01-domain/ENTITY_RELATIONSHIPS.md`](./01-domain/ENTITY_RELATIONSHIPS.md) — ERD funcional.
7. Si vas a implementar: [`08-architecture/README.md`](./08-architecture/README.md) — stack, capas y límites técnicos.
8. Después, los módulos que te interesen en `02-modules/`.

### Si sos un agente IA generando código:

1. **Antes de generar cualquier código**, leé [`AGENTS.md`](./AGENTS.md).
2. Revisá [`08-architecture/README.md`](./08-architecture/README.md) y los docs técnicos que apliquen (capas, multitenancy, reportes, etc.).
3. Identificá qué módulo te toca (`02-modules/<MODULE>.md`).
4. Resolvé fórmulas y reglas en `04-formulas/` y `01-domain/BUSINESS_RULES.md`.
5. Si tu cambio cruza módulos, leé el workflow en `05-workflows/`.
6. **Nunca contradigas** [`00-product/DECISION_LOG.md`](./00-product/DECISION_LOG.md). Si lo necesitás, pedí actualizarlo primero.

---

## 3. Estructura de carpetas

```
/docs/bloqer2.0/
├── README.md                       ← este archivo
├── AGENTS.md                       ← guía obligatoria para IA
│
├── 00-product/                     ← visión, alcance, roles, decisiones
├── 01-domain/                      ← entidades, ERD, reglas globales, eventos
├── 02-modules/                     ← un .md por módulo funcional (~25 archivos)
├── 03-finance/                     ← modelo de dinero, tesorería, multi-moneda
├── 04-formulas/                    ← todas las fórmulas con ejemplos numéricos
├── 05-workflows/                   ← procesos paso a paso entre módulos
├── 06-reports/                     ← catálogo de reportes
├── 07-non-functional/              ← multitenancy, seguridad, i18n, integraciones
└── 08-architecture/                ← arquitectura técnica (stack, capas, ADRs)
```

---

## 4. Índice maestro

### `00-product/` — Producto

| Archivo | Propósito |
|---|---|
| [`PRODUCT_VISION.md`](./00-product/PRODUCT_VISION.md) | Visión a largo plazo del producto |
| [`PRODUCT_SCOPE.md`](./00-product/PRODUCT_SCOPE.md) | Qué entra y qué no entra |
| [`PRODUCT_PRINCIPLES.md`](./00-product/PRODUCT_PRINCIPLES.md) | Principios rectores del diseño funcional |
| [`USER_ROLES.md`](./00-product/USER_ROLES.md) | Roles funcionales (no técnicos) |
| [`PERMISSIONS_MATRIX.md`](./00-product/PERMISSIONS_MATRIX.md) | Matriz rol × módulo × acción |
| [`GLOSSARY.md`](./00-product/GLOSSARY.md) | Vocabulario único del dominio |
| [`DECISION_LOG.md`](./00-product/DECISION_LOG.md) | Decisiones de producto lockeadas |
| [`OPEN_QUESTIONS.md`](./00-product/OPEN_QUESTIONS.md) | Preguntas abiertas que faltan responder |

### `01-domain/` — Dominio

| Archivo | Propósito |
|---|---|
| [`DOMAIN_OVERVIEW.md`](./01-domain/DOMAIN_OVERVIEW.md) | Vista de pájaro del dominio |
| [`CORE_ENTITIES.md`](./01-domain/CORE_ENTITIES.md) | Catálogo conceptual de entidades |
| [`ENTITY_RELATIONSHIPS.md`](./01-domain/ENTITY_RELATIONSHIPS.md) | ERD funcional |
| [`BUSINESS_RULES.md`](./01-domain/BUSINESS_RULES.md) | Reglas globales transversales |
| [`STATE_MACHINES.md`](./01-domain/STATE_MACHINES.md) | Estados y transiciones por entidad |
| [`EVENTS_AND_AUTOMATIONS.md`](./01-domain/EVENTS_AND_AUTOMATIONS.md) | Eventos y reacciones automáticas |
| [`APPROVAL_WORKFLOWS.md`](./01-domain/APPROVAL_WORKFLOWS.md) | Aprobaciones formales |
| [`MASTER_DATA.md`](./01-domain/MASTER_DATA.md) | Catálogos parametrizables |

### `02-modules/` — Módulos funcionales

| Archivo | Propósito |
|---|---|
| [`DIRECTORY.md`](./02-modules/DIRECTORY.md) | Directorio unificado de contactos |
| [`CLIENTS.md`](./02-modules/CLIENTS.md) | Vista cliente (rol) |
| [`SUPPLIERS.md`](./02-modules/SUPPLIERS.md) | Vista proveedor (rol) |
| [`SUBCONTRACTORS.md`](./02-modules/SUBCONTRACTORS.md) | Vista subcontratista (rol) |
| [`PROJECTS.md`](./02-modules/PROJECTS.md) | Proyectos / obras |
| [`PROJECT_SCHEDULING.md`](./02-modules/PROJECT_SCHEDULING.md) | Cronograma / planificación temporal |
| [`BUDGETS.md`](./02-modules/BUDGETS.md) | Presupuestos y versiones |
| [`WBS_AND_COST_ITEMS.md`](./02-modules/WBS_AND_COST_ITEMS.md) | WBS, ítems y análisis de costo |
| [`CONTRACTS_AND_ADDENDUMS.md`](./02-modules/CONTRACTS_AND_ADDENDUMS.md) | Contratos y adendas |
| [`CHANGE_ORDERS.md`](./02-modules/CHANGE_ORDERS.md) | Órdenes de cambio |
| [`RFIS.md`](./02-modules/RFIS.md) | RFIs |
| [`JOBSITE_LOG.md`](./02-modules/JOBSITE_LOG.md) | Libro de obra |
| [`CERTIFICATIONS.md`](./02-modules/CERTIFICATIONS.md) | Certificaciones de avance |
| [`PROCUREMENT.md`](./02-modules/PROCUREMENT.md) | Compras (visión general) |
| [`PURCHASE_REQUESTS.md`](./02-modules/PURCHASE_REQUESTS.md) | Solicitudes de compra y cotizaciones |
| [`PURCHASE_ORDERS_AND_RECEIPTS.md`](./02-modules/PURCHASE_ORDERS_AND_RECEIPTS.md) | OC y recepciones |
| [`SUBCONTRACTS.md`](./02-modules/SUBCONTRACTS.md) | Subcontratos |
| [`INVENTORY.md`](./02-modules/INVENTORY.md) | Inventario |
| [`WAREHOUSES.md`](./02-modules/WAREHOUSES.md) | Depósitos |
| [`TREASURY.md`](./02-modules/TREASURY.md) | Tesorería |
| [`BANK_ACCOUNTS.md`](./02-modules/BANK_ACCOUNTS.md) | Cuentas bancarias y cajas |
| [`BANK_RECONCILIATION.md`](./02-modules/BANK_RECONCILIATION.md) | Conciliación bancaria |
| [`SALES_AND_COLLECTIONS.md`](./02-modules/SALES_AND_COLLECTIONS.md) | Ventas y cobranzas |
| [`EXPENSES_AND_PAYMENTS.md`](./02-modules/EXPENSES_AND_PAYMENTS.md) | Gastos, facturas compra y pagos |
| [`INTERNAL_TRANSFERS.md`](./02-modules/INTERNAL_TRANSFERS.md) | Transferencias internas |
| [`REPORTING.md`](./02-modules/REPORTING.md) | Marco general de reportes |
| [`DOCUMENTS.md`](./02-modules/DOCUMENTS.md) | Documentos adjuntos |
| [`USERS_AND_PERMISSIONS.md`](./02-modules/USERS_AND_PERMISSIONS.md) | Usuarios y permisos |
| [`AUDIT_LOG.md`](./02-modules/AUDIT_LOG.md) | Auditoría |
| [`NOTIFICATIONS.md`](./02-modules/NOTIFICATIONS.md) | Notificaciones y alertas |

### `03-finance/` — Finanzas

| Archivo | Propósito |
|---|---|
| [`MONEY_MODEL.md`](./03-finance/MONEY_MODEL.md) | Modelo de dinero y precisión |
| [`MULTI_CURRENCY_RULES.md`](./03-finance/MULTI_CURRENCY_RULES.md) | Multi-moneda y FX manual |
| [`TREASURY_MODEL.md`](./03-finance/TREASURY_MODEL.md) | Cuatro vistas de tesorería |
| [`ACCOUNT_MOVEMENTS.md`](./03-finance/ACCOUNT_MOVEMENTS.md) | Ledger unificado |
| [`CASHFLOW.md`](./03-finance/CASHFLOW.md) | Cashflow real |
| [`CASHFLOW_PROJECTION.md`](./03-finance/CASHFLOW_PROJECTION.md) | Proyección de caja |
| [`ACCOUNTS_RECEIVABLE.md`](./03-finance/ACCOUNTS_RECEIVABLE.md) | Cuentas por cobrar |
| [`ACCOUNTS_PAYABLE.md`](./03-finance/ACCOUNTS_PAYABLE.md) | Cuentas por pagar |
| [`TAXES_AND_WITHHOLDINGS.md`](./03-finance/TAXES_AND_WITHHOLDINGS.md) | Impuestos y retenciones manuales |
| [`PERIOD_CLOSE_AND_LOCKS.md`](./03-finance/PERIOD_CLOSE_AND_LOCKS.md) | Cierre de período |
| [`PROFITABILITY_BY_PROJECT.md`](./03-finance/PROFITABILITY_BY_PROJECT.md) | Rentabilidad por proyecto |
| [`FINANCIAL_REPORTS.md`](./03-finance/FINANCIAL_REPORTS.md) | Paquete de reportes financieros |

### `04-formulas/` — Fórmulas

| Archivo | Propósito |
|---|---|
| [`BUDGET_FORMULAS.md`](./04-formulas/BUDGET_FORMULAS.md) | Presupuesto |
| [`COST_FORMULAS.md`](./04-formulas/COST_FORMULAS.md) | Costos y presupuesto vs real |
| [`SALE_PRICE_FORMULAS.md`](./04-formulas/SALE_PRICE_FORMULAS.md) | Precio de venta |
| [`TAX_FORMULAS.md`](./04-formulas/TAX_FORMULAS.md) | Impuestos |
| [`CERTIFICATION_FORMULAS.md`](./04-formulas/CERTIFICATION_FORMULAS.md) | Certificación |
| [`PROGRESS_FORMULAS.md`](./04-formulas/PROGRESS_FORMULAS.md) | Avance físico/económico/financiero |
| [`STOCK_FORMULAS.md`](./04-formulas/STOCK_FORMULAS.md) | Inventario FIFO / promedio |
| [`TREASURY_BALANCE_FORMULAS.md`](./04-formulas/TREASURY_BALANCE_FORMULAS.md) | Saldos y cashflow |
| [`PROFITABILITY_FORMULAS.md`](./04-formulas/PROFITABILITY_FORMULAS.md) | Rentabilidad |
| [`DASHBOARD_KPI_FORMULAS.md`](./04-formulas/DASHBOARD_KPI_FORMULAS.md) | KPIs de dashboard |
| [`CURRENCY_CONVERSION_FORMULAS.md`](./04-formulas/CURRENCY_CONVERSION_FORMULAS.md) | Conversión a ARS |

### `05-workflows/` — Workflows

| Archivo | Propósito |
|---|---|
| [`CREATE_PROJECT.md`](./05-workflows/CREATE_PROJECT.md) | Crear proyecto |
| [`CREATE_BUDGET.md`](./05-workflows/CREATE_BUDGET.md) | Crear presupuesto |
| [`APPROVE_BUDGET.md`](./05-workflows/APPROVE_BUDGET.md) | Aprobar presupuesto |
| [`ADD_PHASE_OR_ADDENDUM.md`](./05-workflows/ADD_PHASE_OR_ADDENDUM.md) | Fase / adenda presupuestaria |
| [`CREATE_CHANGE_ORDER.md`](./05-workflows/CREATE_CHANGE_ORDER.md) | Orden de cambio |
| [`HANDLE_RFI.md`](./05-workflows/HANDLE_RFI.md) | Gestionar RFI |
| [`REGISTER_JOBSITE_ENTRY.md`](./05-workflows/REGISTER_JOBSITE_ENTRY.md) | Parte de obra |
| [`ISSUE_CERTIFICATION.md`](./05-workflows/ISSUE_CERTIFICATION.md) | Emitir certificación |
| [`CERTIFY_TO_COLLECT.md`](./05-workflows/CERTIFY_TO_COLLECT.md) | Certificar → cobrar |
| [`DIRECT_SALE_FLOW.md`](./05-workflows/DIRECT_SALE_FLOW.md) | Venta directa |
| [`REGISTER_PURCHASE.md`](./05-workflows/REGISTER_PURCHASE.md) | Registrar compra |
| [`PURCHASE_TO_PAY.md`](./05-workflows/PURCHASE_TO_PAY.md) | Compra hasta pago |
| [`REGISTER_PAYMENT.md`](./05-workflows/REGISTER_PAYMENT.md) | Registrar pago |
| [`REGISTER_COLLECTION.md`](./05-workflows/REGISTER_COLLECTION.md) | Registrar cobranza |
| [`REGISTER_EXPENSE.md`](./05-workflows/REGISTER_EXPENSE.md) | Gasto / factura sin OC |
| [`TRANSFER_BETWEEN_OWN_ACCOUNTS.md`](./05-workflows/TRANSFER_BETWEEN_OWN_ACCOUNTS.md) | Transferencia interna |
| [`MOVE_INVENTORY.md`](./05-workflows/MOVE_INVENTORY.md) | Movimiento de inventario |
| [`RECONCILE_BANK.md`](./05-workflows/RECONCILE_BANK.md) | Conciliar banco |
| [`CLOSE_PERIOD.md`](./05-workflows/CLOSE_PERIOD.md) | Cerrar período |
| [`EXPORT_REPORTS.md`](./05-workflows/EXPORT_REPORTS.md) | Exportar reportes |

### `06-reports/` — Reportes

| Archivo | Propósito |
|---|---|
| [`REPORT_CATALOG.md`](./06-reports/REPORT_CATALOG.md) | Catálogo maestro |
| [`EXECUTIVE_DASHBOARD.md`](./06-reports/EXECUTIVE_DASHBOARD.md) | Dashboard ejecutivo |
| [`OPERATIONAL_REPORTS.md`](./06-reports/OPERATIONAL_REPORTS.md) | Reportes operativos |
| [`FINANCIAL_REPORT_PACK.md`](./06-reports/FINANCIAL_REPORT_PACK.md) | Paquete financiero |
| [`QUERY_BUILDER.md`](./06-reports/QUERY_BUILDER.md) | Query builder |
| [`EXPORT_FORMATS.md`](./06-reports/EXPORT_FORMATS.md) | Formatos de exportación |

### `07-non-functional/` — No funcional

| Archivo | Propósito |
|---|---|
| [`NON_FUNCTIONAL_REQUIREMENTS.md`](./07-non-functional/NON_FUNCTIONAL_REQUIREMENTS.md) | NFR generales |
| [`MULTITENANCY.md`](./07-non-functional/MULTITENANCY.md) | Multitenancy |
| [`AUDIT_AND_TRACEABILITY.md`](./07-non-functional/AUDIT_AND_TRACEABILITY.md) | Auditoría |
| [`SECURITY_AND_COMPLIANCE.md`](./07-non-functional/SECURITY_AND_COMPLIANCE.md) | Seguridad |
| [`INTERNATIONALIZATION.md`](./07-non-functional/INTERNATIONALIZATION.md) | i18n / localización |
| [`INTEGRATIONS_FUTURE.md`](./07-non-functional/INTEGRATIONS_FUTURE.md) | Integraciones futuras |

### `08-architecture/` — Arquitectura técnica

> Capa de **implementación**: cómo construir respetando la spec funcional. No reemplaza `01-domain/` ni `DECISION_LOG.md`.

| Archivo | Propósito |
|---|---|
| [`README.md`](./08-architecture/README.md) | Índice y orden de lectura |
| [`ARCHITECTURE_OVERVIEW.md`](./08-architecture/ARCHITECTURE_OVERVIEW.md) | Mapa y principios |
| [`TECH_STACK.md`](./08-architecture/TECH_STACK.md) | Stack preferido |
| [`MODULAR_MONOLITH.md`](./08-architecture/MODULAR_MONOLITH.md) | Límites del monolito modular |
| [`BACKEND_LAYERING.md`](./08-architecture/BACKEND_LAYERING.md) | Capas del servidor |
| [`FRONTEND_ARCHITECTURE.md`](./08-architecture/FRONTEND_ARCHITECTURE.md) | UI y datos |
| [`SERVICE_LAYER.md`](./08-architecture/SERVICE_LAYER.md) | Lógica de negocio obligatoria |
| [`MULTITENANCY_ARCHITECTURE.md`](./08-architecture/MULTITENANCY_ARCHITECTURE.md) | Aislamiento por tenant |
| [`AUTH_ARCHITECTURE.md`](./08-architecture/AUTH_ARCHITECTURE.md) | Autenticación y sesión |
| [`FILE_STORAGE_ARCHITECTURE.md`](./08-architecture/FILE_STORAGE_ARCHITECTURE.md) | R2 y metadatos |
| [`EMAIL_NOTIFICATIONS_ARCHITECTURE.md`](./08-architecture/EMAIL_NOTIFICATIONS_ARCHITECTURE.md) | Resend / React Email |
| [`I18N_STRATEGY.md`](./08-architecture/I18N_STRATEGY.md) | i18n-ready, es-AR primero |
| [`REPORTING_ARCHITECTURE.md`](./08-architecture/REPORTING_ARCHITECTURE.md) | Reportes y reconciliación |
| [`BACKGROUND_JOBS_ARCHITECTURE.md`](./08-architecture/BACKGROUND_JOBS_ARCHITECTURE.md) | Jobs y crons |
| [`OBSERVABILITY_ARCHITECTURE.md`](./08-architecture/OBSERVABILITY_ARCHITECTURE.md) | Logs, métricas, trazas |
| [`SECURITY_ARCHITECTURE.md`](./08-architecture/SECURITY_ARCHITECTURE.md) | Amenazas y controles |
| [`ARCHITECTURE_DECISION_RECORDS.md`](./08-architecture/ARCHITECTURE_DECISION_RECORDS.md) | ADRs técnicos |
| [`TECHNICAL_ERD.md`](./08-architecture/TECHNICAL_ERD.md) | ERD técnico (Mermaid), relaciones críticas |
| [`DATA_MODEL_OVERVIEW.md`](./08-architecture/DATA_MODEL_OVERVIEW.md) | Dominios y tablas conceptuales; tenant/company |
| [`DATABASE_CONVENTIONS.md`](./08-architecture/DATABASE_CONVENTIONS.md) | Convenciones SQL / tipos |
| [`TENANT_ISOLATION_MODEL.md`](./08-architecture/TENANT_ISOLATION_MODEL.md) | Aislamiento y `company_id` |
| [`ENTITY_ID_STRATEGY.md`](./08-architecture/ENTITY_ID_STRATEGY.md) | UUID y numeración |
| [`MONEY_AND_DECIMAL_STRATEGY.md`](./08-architecture/MONEY_AND_DECIMAL_STRATEGY.md) | NUMERIC, FX, derivados |
| [`ENUM_STRATEGY.md`](./08-architecture/ENUM_STRATEGY.md) | Enums técnicos |
| [`AUDIT_FIELDS_STRATEGY.md`](./08-architecture/AUDIT_FIELDS_STRATEGY.md) | Campos auditoría en filas |
| [`SOFT_DELETE_STRATEGY.md`](./08-architecture/SOFT_DELETE_STRATEGY.md) | Borrado vs anulación |
| [`LEDGER_TABLES_STRATEGY.md`](./08-architecture/LEDGER_TABLES_STRATEGY.md) | Ledger y AR/AP |
| [`DOCUMENT_STORAGE_DATA_MODEL.md`](./08-architecture/DOCUMENT_STORAGE_DATA_MODEL.md) | Metadata archivos + R2 |
| [`REPORTING_DATA_MODEL.md`](./08-architecture/REPORTING_DATA_MODEL.md) | Reportes: queries vs MV |
| [`INDEXING_STRATEGY.md`](./08-architecture/INDEXING_STRATEGY.md) | Índices multitenant |
| [`MIGRATION_STRATEGY.md`](./08-architecture/MIGRATION_STRATEGY.md) | Estrategia de migraciones |
| [`REPOSITORY_STRUCTURE.md`](./08-architecture/REPOSITORY_STRUCTURE.md) | Estructura del repo monorepo |
| [`PACKAGE_STRUCTURE.md`](./08-architecture/PACKAGE_STRUCTURE.md) | Paquetes y dependencias |
| [`DOMAIN_MODULE_STRUCTURE.md`](./08-architecture/DOMAIN_MODULE_STRUCTURE.md) | Módulos en `services`/`domain` |
| [`API_STRUCTURE.md`](./08-architecture/API_STRUCTURE.md) | Route Handlers vs Server Actions |
| [`FRONTEND_FEATURE_STRUCTURE.md`](./08-architecture/FRONTEND_FEATURE_STRUCTURE.md) | Organización de features UI |
| [`CODING_STANDARDS.md`](./08-architecture/CODING_STANDARDS.md) | Estándares de código |
| [`AI_DEVELOPMENT_WORKFLOW.md`](./08-architecture/AI_DEVELOPMENT_WORKFLOW.md) | Workflow con IA |
| [`AGENT_GUARDRAILS.md`](./08-architecture/AGENT_GUARDRAILS.md) | Guardrails agentes |
| [`TESTING_STRATEGY.md`](./08-architecture/TESTING_STRATEGY.md) | Estrategia de tests |
| [`CODE_REVIEW_CHECKLIST.md`](./08-architecture/CODE_REVIEW_CHECKLIST.md) | Checklist de revisión |
| [`PENDING_ARCHITECTURE_ITEMS.md`](./08-architecture/PENDING_ARCHITECTURE_ITEMS.md) | Pendientes técnicos |
| [`IMPLEMENTATION_ROADMAP.md`](./08-architecture/IMPLEMENTATION_ROADMAP.md) | Roadmap técnico por fases |
| [`MVP_TECHNICAL_SCOPE.md`](./08-architecture/MVP_TECHNICAL_SCOPE.md) | Alcance primer piloto técnico |
| [`PHASE_0_PROJECT_SETUP.md`](./08-architecture/PHASE_0_PROJECT_SETUP.md) … [`PHASE_5_HARDENING.md`](./08-architecture/PHASE_5_HARDENING.md) | Fases de implementación |
| [`DEPLOYMENT_PLAN.md`](./08-architecture/DEPLOYMENT_PLAN.md) | Plan de despliegue |
| [`DEPLOYMENT_SMOKE_TEST.md`](./08-architecture/DEPLOYMENT_SMOKE_TEST.md) | Smoke técnico post-deploy |
| [`OPERATIONAL_SMOKE_CHECKLIST_BY_ROLE.md`](./08-architecture/OPERATIONAL_SMOKE_CHECKLIST_BY_ROLE.md) | Smoke / UAT por rol (capacitación) |
| [`RISK_REGISTER.md`](./08-architecture/RISK_REGISTER.md) | Registro de riesgos |

*(Índice narrado: [`08-architecture/README.md`](./08-architecture/README.md).)*

### Planes de mejora (trabajo en curso)

| Archivo | Propósito |
|---|---|
| [`PLAN_MEJORAS_CORTO_PLAZO_BLOQER_V2.md`](./PLAN_MEJORAS_CORTO_PLAZO_BLOQER_V2.md) | Higiene, nav, exports (lotes 1–4 hechos) |
| [`PLAN_MEJORAS_OPERATIVAS_PROYECTO.md`](./PLAN_MEJORAS_OPERATIVAS_PROYECTO.md) | Hub compras, materiales look-ahead, integridad WBS ([D-055]) |

---

## 5. Convenciones del documento

- **Naming e idioma:** enums, estados y código futuro en **inglés**; UI y explicación en **es-AR** — [`AGENTS.md` §3](./AGENTS.md#3-canonical-naming-and-language-rules).
- Cada archivo de módulo sigue una **plantilla canónica de 19 secciones** definida en [`AGENTS.md`](./AGENTS.md#plantilla-de-modulos).
- **Fórmulas** se documentan siempre con: variables, expresión, ejemplo numérico, precisión decimal, casos borde.
- **Estados** en diagramas y tablas usan **valores canónicos en inglés**; las etiquetas en español en flechas Mermaid son acciones de usuario, no valores almacenados.
- **Lifecycle:** toda entidad operativa con máquina de estados vive en [`01-domain/STATE_MACHINES.md`](./01-domain/STATE_MACHINES.md) (tabla resumen §28); no inventar estados fuera de ese documento sin actualizarlo.
- **Referencias cruzadas** usan rutas relativas: `[Presupuestos](../02-modules/BUDGETS.md)`.
- **No se duplica información**: si una fórmula está en `04-formulas/`, el módulo solo la **referencia**.

---

## 6. Estado de generación

| Fase | Contenido | Estado |
|---|---|---|
| A | `00-product/` + `01-domain/` + `README.md` + `AGENTS.md` | Completa |
| B | `02-modules/` (operativos) | Completa |
| C | `02-modules/` (financieros) + `03-finance/` | Completa |
| D | `04-formulas/` + `05-workflows/` + `06-reports/` + `07-non-functional/` | Completa |
| E | `08-architecture/` (arquitectura + ERD técnico + repo/IA/tests, sin código) | Completa |

---

## 7. Glosario rápido (3 términos críticos)

- **Tenant**: instancia aislada de datos para una empresa cliente del SaaS. Bloqer 2.0 es **multitenant desde día 1**.
- **Proyecto / Obra**: la unidad central de negocio. Toda actividad de costo o ingreso está vinculada (directa o indirectamente) a un proyecto, salvo gastos generales de la empresa.
- **Certificación**: documento emitido al cliente que reconoce avance de obra y habilita facturación.

Glosario completo: [`00-product/GLOSSARY.md`](./00-product/GLOSSARY.md).

---

## 8. Cómo proponer cambios

1. Si la decisión es **producto** → editar el módulo o crear entrada en `DECISION_LOG.md`.
2. Si es **una pregunta abierta** → agregar a `OPEN_QUESTIONS.md`.
3. Si es **una contradicción detectada** → escribir un `## Hallazgo` al final del documento afectado y referenciarlo.
4. Nunca borrar decisiones lockeadas sin actualizar `DECISION_LOG.md` primero.
