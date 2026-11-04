# Tenant isolation model — Bloqer 2.0

## Decisión

Implementar **row-level logical isolation**: toda entidad operativa pertenece a un tenant. Las raíces operativas conservan columna **`tenant_id` (UUID, NOT NULL)**; los **22 hijos/configuraciones existentes del catálogo cerrado** de este documento heredan tenant mediante su padre dueño obligatorio, conforme a [ADR-018](./ARCHITECTURE_DECISION_RECORDS.md), confirmado por el usuario el 03/11/2026. No se amplía el catálogo por analogía.

Opcionalmente **`company_id`** bajo el tenant para multi-razón social ([`DATA_MODEL_OVERVIEW.md`](./DATA_MODEL_OVERVIEW.md)). La aplicación **nunca** confía en el cliente para el tenant activo: se toma del **contexto autenticado** y se valida membresía. El aislamiento absoluto no depende de que el hijo duplique físicamente la columna del padre.

## Justificación

- [D-001](../00-product/DECISION_LOG.md); alineado a [`MULTITENANCY_ARCHITECTURE.md`](./MULTITENANCY_ARCHITECTURE.md).
- Construcción y finanzas: error de tenant es **incidente grave**.

## Catálogo cerrado de pertenencia

### Identidad, raíz y administración de plataforma

`User`, `Account`, `Session`, `VerificationToken`, `Tenant`, `PlatformAdmin` y `PlatformAuditLog` conservan su propósito técnico, de raíz o de administración de plataforma. Sus accesos usan los guards de autenticación, membresía o plataforma correspondientes; este catálogo no los convierte en datos operativos compartidos ni habilita consultas indiscriminadas entre tenants.

### Los 22 hijos/configuraciones existentes con tenant heredado

En el schema actual, cada padre dueño de esta lista tiene `tenantId` obligatorio y cada FK de pertenencia indicada es obligatoria. Se conserva el modelo físico existente, sin agregar columnas ni migraciones:

- `ClientProfile`, `SupplierProfile`, `SubcontractorProfile` → `contactId` → `Contact` (3 modelos).
- `BudgetSettings`, `WbsNode`, `CostItem`, `CostAnalysisLine` → `budgetId` → `Budget` (4 modelos).
- `CertificationLine` → `certificationId` → `Certification`.
- `SalesInvoiceLine` → `invoiceId` → `SalesInvoice`.
- `JournalEntryLine` → `journalEntryId` → `JournalEntry`.
- `SupplierInvoiceLine` → `invoiceId` → `SupplierInvoice`.
- `CompanyProcurementSettings` → `companyId` → `Company`.
- `PurchaseRequestLine` → `purchaseRequestId` → `PurchaseRequest`.
- `ProcurementQuoteLine` → `procurementQuoteId` → `ProcurementQuote`.
- `PurchaseOrderLine` → `purchaseOrderId` → `PurchaseOrder`.
- `PurchaseReceiptLine` → `purchaseReceiptId` → `PurchaseReceipt`.
- `SubcontractLine` → `subcontractId` → `Subcontract`.
- `SubcontractCertificationLine` → `subcontractCertificationId` → `SubcontractCertification`.
- `JobsiteLogProgress`, `JobsiteLogLabor`, `JobsiteLogMaterialUsage`, `JobsiteLogIssue` → `jobsiteLogId` → `JobsiteLog` (4 modelos).

**Padre canónico y referencias adicionales:** `WbsNode.parentId` es jerarquía opcional, no determina un tenant alternativo. `CostItem` y `CostAnalysisLine` tienen pertenencia directa a `Budget`; sus vínculos WBS/costItem y la cadena APU deben ser coherentes con ese presupuesto. Tampoco basta comprobar solo la cabecera en `CertificationLine` (WBS), `JournalEntryLine` (cuenta/proyecto), `ProcurementQuoteLine` (línea SC), `PurchaseReceiptLine` (línea OC) o `SubcontractCertificationLine` (línea de subcontrato): las referencias adicionales deben corresponder al mismo tenant y agregado/ámbito que exige el flujo. El mismo requisito se aplica a los vínculos opcionales de los demás hijos. Una FK simple no demuestra esa coherencia.

Los IDs de hijos recibidos del cliente se comprueban contra su padre autorizado. **No** se permite crear otra relación de pertenencia, usar un padre de otro tenant ni tratar este catálogo como permiso para nuevos modelos sin columna propia. Fuera de la lista, las raíces operativas conservan `tenant_id` obligatorio y cualquier excepción nueva requiere decisión explícita.

## Estrategia de enforcement

1. **Contexto de servidor:** resolver tenant permitido mediante autenticación/membresía; los IDs del cliente no lo sustituyen.
2. **Servicios/repositorios explícitos:** acotar lecturas masivas desde la consulta y comprobar pertenencia de cargas por ID antes de usar/devolver datos o mutar. Las escrituras conservan tenant del agregado autorizado; se rechaza toda relación cross-tenant.
3. **Hijos:** cargar o filtrar mediante el padre dueño, verificar su tenant y la coherencia de referencias adicionales. No autorizar un hijo solamente porque su ID exista.
4. **Cliente Prisma:** el cliente simple exportado por database no auto-inyecta tenant ni rechaza globalmente consultas sin scope. No usar esa garantía como supuesto. Un middleware/extensión/control automático adicional requiere diseño y ADR propios, incluyendo compatibilidad con consultas técnicas, transacciones e hijos.
5. **Tests:** los casos de lectura/escritura cross-tenant deben rechazarse. Las pruebas de helpers/políticas sin DB no acreditan el SQL ni que todas las entradas invoquen los controles; la integración aislada se verifica por recorrido.
6. **Índices:** las raíces usan tenant en índices de listados y los hijos la relación a su padre, según [`INDEXING_STRATEGY.md`](./INDEXING_STRATEGY.md). La documentación del contrato no acredita los objetos efectivos de una DB.

## `company_id` (opcional)

- Si **Alternativa B** ([`DATA_MODEL_OVERVIEW.md`](./DATA_MODEL_OVERVIEW.md)): `company_id` en `project`, y potencialmente en `sales_invoice`, `purchase_invoice`, `account` cuando el producto distinga emisor.
- **Invariante:** `company.tenant_id` debe coincidir con el tenant del agregado dueño, incluido cuando un hijo lo hereda por la relación de pertenencia. El alcance por empresa/proyecto conserva [TENANT_COMPANY_SCOPING](./TENANT_COMPANY_SCOPING.md); `companyId` nunca sustituye el aislamiento por tenant.

## Problemas que evita

- Data leaks por query olvidada.
- APIs que aceptan `tenant_id` del body.

## Qué NO hacer

- No usar `tenant_id` nullable “temporalmente”.  
- No compartir **secuencias de numeración** entre tenants sin prefijo o tabla de secuencias por tenant ([Q-002](../00-product/OPEN_QUESTIONS.md)).  
- No cachear agregados **sin** clave de tenant.

## Referencias

- [`../07-non-functional/MULTITENANCY.md`](../07-non-functional/MULTITENANCY.md)  
- [`../01-domain/ENTITY_RELATIONSHIPS.md`](../01-domain/ENTITY_RELATIONSHIPS.md) §8–9

## Hallazgo

**03/11/2026 — GA-AG-00-006 / P-AG00-02:** falta reconciliar la exigencia de columna `tenant_id` en todas las entidades operativas de este documento y de [AGENTS raíz](../../../AGENTS.md) con la aceptación histórica de hijos sin columna redundante, heredando tenant por FK al padre, en [PRISMA_ERD_AUDIT §1](./PRISMA_ERD_AUDIT.md). El schema local tiene 22 modelos hijos/configuraciones con ese patrón; inventario y límites en el [subanálisis AG-00](./platform-audit/2026-11-03-ag-00-architecture.md).

La anotación registra una ambigüedad documental pendiente de definición explícita. **No relaja la norma de aislamiento, no autoriza nuevas excepciones y no aprueba agregar columnas o ejecutar migraciones.** La pertenencia y autorización de las consultas actuales deben verificarse por recorrido. Seguimiento: [P-AG00-02](./PENDING_ARCHITECTURE_ITEMS.md).

**Resolución 03/11/2026 — ADR-018:** el usuario confirmó explícitamente la [propuesta de reconciliación](./platform-audit/2026-11-03-ag-00-isolation-proposal.md). Se actualizaron la decisión, el catálogo y el mecanismo de este documento para distinguir pertenencia obligatoria, columna física y guards explícitos. GA-AG-00-005/006 y P-AG00-01/02 quedan resueltos en su alcance documental/arquitectónico por [ADR-018](./ARCHITECTURE_DECISION_RECORDS.md); se conserva arriba el hallazgo inicial como historial. No se implementó middleware ni se modificó schema; la comprobación SQL y de entradas reales sigue siendo trabajo de AG-01 y de los recorridos correspondientes.
