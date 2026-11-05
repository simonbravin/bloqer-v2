# AG-09 — Ventas, cobranzas, CxC, CxP y pagos

**Estado: AG-09 cerrada localmente el 05/11/2026.** Se corrigieron **30 grupos**. Verificación general, SQL aislado, compilación, muestra visual y revisión independiente aprobadas. AG-09 queda sin publicar; AG-10 no iniciada.

Informe complementario: [evidencia estructurada](./2026-11-05-ag-09-ar-ap-payments.json). Procedimiento: [plantilla](./REPORT_TEMPLATE.md), [plan](../PLATFORM_AUDIT_PLAN.md) y [runbook](../PLATFORM_AUDIT_RUNBOOK.md). No se suman intentos repetidos ni pruebas omitidas.

## 1. Encargo y base

El Owner pidió publicar el lote anterior y después auditar, corregir y verificar AG-09, con aviso antes de continuar. Primero se publicó **AG-08**, fuera del diff nuevo: [PR #6 / Production e817d82f](./2026-11-05-ag-08-publication.md), 94 archivos y el mismo árbol en entrega/merge.

- **Fecha / modo:** 05/11/2026; etapa de auditoría global con corrección autorizada.
- **Rama / base:** `codex/pruebas`, **4f5b672e74bb9df133b1dc83f68918fa2b32555e**; árbol **0e6a71495af4bb28142686b458fbd1dc312c4682**.
- **Árbol inicial:** limpio después del commit AG-08; sin archivos sin seguimiento. Diff base→worktree, incluidos archivos nuevos.
- **Manifiesto de código:** `source-freeze-05.json`, **139 archivos**. Freeze 04 acreditó los recorridos operativos. El delta final de presentación (seis pantallas, Ayuda e índice; Guía aparte) se contrastó con la compilación y se revalidó en navegador.
- **SQL:** `bloqer_audit_ag01_20261103`, host `ep-curly-math-aptjniho.c-7.us-east-1.aws.neon.tech`. Ambas URLs explícitas y `assertAuditDatabaseIdentity` comprueban la base efectiva antes de escribir fixtures sintéticos. La retención para UI es un flag del fixture mantenido.
- **Límites operativos:** proveedores externos desactivados; sin pruebas mutantes de producción, migraciones, campos nuevos, enums nuevos o dependencias nuevas por AG-09. El reporte no contiene credenciales.
- **Evidencia:** `output/platform-audit/ag-09-2026-11-05/`. No se confunde la publicación AG-08 con los cambios AG-09 locales. La autorización visual local aislada de AG-02 sigue vigente; aún falta la muestra de esta etapa.

### Responsabilidades

- `/root`: Coordinación; helpers compartidos, reportes/CSV/AI, Guide/help, ejecución SQL y verificaciones generales/finales.

- `/root/ag09_ar`: Contratos y recorridos AR, Collection, validators AR y suites; restauración focal de política NC AR/AP y test heredado.

- `/root/ag09_ap`: AP, integridad, pago/composiciones, validators AP y frontera compartida de cancelación/posting GL.

- `/root/ag09_frontend`: UI/Actions/invalidación de obra/empresa, precisión, razones/confirmaciones, RSC; revisión independiente de consumidores de motivos.

- `/root/ag09_verify`: Revisión independiente de causas, selección offline y contraste de política NC con base/documentación.

- `/root/ag09_docs_ai`: Armonización funcional, D-133/Q-080, workflows, evals y prueba de knowledge.

- `/root/ag09_report`: Consolidación de evidencia existente en este reporte; sin ejecución SQL/UI/build ni cambios de producto.

## 2. Fuentes y alcance

Fuentes: [Ventas/cobranzas](../../02-modules/SALES_AND_COLLECTIONS.md), [Gastos/pagos](../../02-modules/EXPENSES_AND_PAYMENTS.md), [AR](../../03-finance/ACCOUNTS_RECEIVABLE.md), [AP](../../03-finance/ACCOUNTS_PAYABLE.md), [dinero](../../03-finance/MONEY_MODEL.md), [moneda](../../03-finance/MULTI_CURRENCY_RULES.md), [impuestos](../../03-finance/TAXES_AND_WITHHOLDINGS.md), [estados](../../01-domain/STATE_MACHINES.md), [reglas](../../01-domain/BUSINESS_RULES.md), [permisos](../../00-product/PERMISSIONS_MATRIX.md), workflows y schema real. ADR-018 rige pertenencia y referencias adicionales.

Decisiones: D-008 FX manual; D-053 precisión; D-056/D-111 contexto; D-061/D-063 frontera GL; D-077 cobro inmediato; D-084 letra; D-089/D-131 subcert→factura borrador; D-093 descuento; D-112 IIBB; D-115 crédito separado de caja; D-117 conservación. **D-133/Q-080 fue aprobada expresamente**: [propuesta](./2026-11-05-ag-09-nonnegative-invoice-tax-proposal.md).

### Cuatro inventarios por recorrido

### AG09-R01 — Factura de venta de obra, manual o desde certificación

- **Documentado:** `02-modules/SALES_AND_COLLECTIONS.md §§8–11`; `05-workflows/CERTIFY_TO_COLLECT.md`; `D-053/D-077/D-084/D-115/D-117/D-119`.
- **Implementado:** [apps/web/features/sales-invoices/components/manual-invoice-form.tsx](<../../../../apps/web/features/sales-invoices/components/manual-invoice-form.tsx>); [apps/web/features/sales-invoices/components/certification-invoice-form.tsx](<../../../../apps/web/features/sales-invoices/components/certification-invoice-form.tsx>); [apps/web/app/(app)/proyectos/[id]/facturas/actions.ts](<../../../../apps/web/app/(app)/proyectos/[id]/facturas/actions.ts>) → `packages/validators/src/sales-invoice.ts` → `ar/sales-invoice.service.ts:createSalesInvoice/createInvoiceFromCertification/updateSalesInvoice/issueSalesInvoice/cancelSalesInvoice`; `ar/register-ar-sale.service.ts:registerArSale`.
- **Persistencia real:** Prisma SalesInvoice/SalesInvoiceLine; Receivable; Collection/AccountMovement opcionales; AuditLog. No se inventa un repositorio intermedio.
- **Expuesto:** `/proyectos/[id]/facturas`; `/proyectos/[id]/facturas/nueva`; `/proyectos/[id]/facturas/[invoiceId]`; `/proyectos/[id]/facturas/[invoiceId]/editar`. Acceso: AR VIEW/EDIT según operación; ACL de obra; AR y Tesorería para collectNow.
- **Lectura y retorno:** Detalle/lista de factura y CxC; Estado financiero derivado de certificación; Snapshots/aging/reportes; Invalidación del proyecto financiero autorizado. El alta normal conserva borrador; D-077 permite emitir y cobrar inmediatamente con autorización. No se agregó una entidad de anticipo.
- **Probado previamente:** AG-08 cubría conexiones certificación→factura y numeración, no toda AR.
- **Probado en esta ejecución:** `output/platform-audit/ag-09-2026-11-05/sql-ar-third.log`; [packages/services/src/ar/certification-invoice-status.test.ts](<../../../../packages/services/src/ar/certification-invoice-status.test.ts>); [apps/web/lib/certification-ar-invalidation.test.ts](<../../../../apps/web/lib/certification-ar-invalidation.test.ts>). Resultados por revisión en §6.
- **Cobertura final:** 17 casos de conexiones AG-08 aprobados. Certificación→factura comprobada por pruebas; ver la muestra de AR en §6.
- **IDs asociados:** `GA-AG-09-001`, `GA-AG-09-002`, `GA-AG-09-003`, `GA-AG-09-004`, `GA-AG-09-005`, `GA-AG-09-006`, `GA-AG-09-007`, `GA-AG-09-008`, `GA-AG-09-013`, `GA-AG-09-015`, `GA-AG-09-017`, `GA-AG-09-022`, `GA-AG-09-024`, `GA-AG-09-025`, `GA-AG-09-026`, `GA-AG-09-029`.

### AG09-R02 — Ingreso corporativo y anticipo/venta rápida

- **Documentado:** `02-modules/SALES_AND_COLLECTIONS.md §§9/13`; `D-008/D-051/D-077/D-084`; `D-056 ámbito corporativo`.
- **Implementado:** [apps/web/features/finance/components/new-transaction-dialog.tsx](<../../../../apps/web/features/finance/components/new-transaction-dialog.tsx>); [apps/web/features/sales-invoices/components/advance-invoice-form.tsx](<../../../../apps/web/features/sales-invoices/components/advance-invoice-form.tsx>); `Actions corporativas de Transacciones/CxC y Actions de facturas de obra` → `registerTransactionSchema/registerArIncomeSchema`; `registerArAdvanceSchema` → `finance/register-transaction.service.ts:registerTransaction`; `ar/register-ar-income.service.ts:registerArIncome`; `ar/register-ar-advance.service.ts:registerArAdvance→registerArSale`.
- **Persistencia real:** SalesInvoice(projectId=null para empresa); Receivable; Collection/AccountMovement; AuditLog. No se inventa un repositorio intermedio.
- **Expuesto:** `/finanzas/transacciones`; `/finanzas/cuentas-por-cobrar`; `/finanzas/cuentas-por-cobrar/[receivableId]`; `/finanzas/facturas/[invoiceId]`; `/proyectos/[id]/facturas/anticipo/nueva`. Acceso: Company finance + permiso de operación para empresa; AR/ACL de obra para anticipo; Tesorería cuando crea o cancela caja.
- **Lectura y retorno:** CxC empresa y detalle de factura corporativa; Historial de cobros; KPI de finanzas/aging. El anticipo actual genera factura/CxC/cobranza; letra sugerida en servidor y FX manual extranjero. Solo caja es otra variante y su modelo FX físico queda en AG-10.
- **Probado previamente:** Cobro inmediato corporativo existía; falta de letra/FX de anticipo impedía su uso argentino/extranjero.
- **Probado en esta ejecución:** `output/platform-audit/ag-09-2026-11-05/sql-ar-third.log`; [apps/web/features/finance/lib/financial-actions.test.ts](<../../../../apps/web/features/finance/lib/financial-actions.test.ts>); [apps/web/features/finance/lib/financial-interactions.test.ts](<../../../../apps/web/features/finance/lib/financial-interactions.test.ts>). Resultados por revisión en §6.
- **Cobertura final:** anticipo verificado por SQL y pruebas de interacción; no forma parte de la muestra de navegador.
- **IDs asociados:** `GA-AG-09-001`, `GA-AG-09-003`, `GA-AG-09-015`, `GA-AG-09-016`, `GA-AG-09-017`, `GA-AG-09-021`, `GA-AG-09-024`, `GA-AG-09-025`, `GA-AG-09-027`.

### AG09-R03 — Factura/gasto AP corporativo y de obra, contra OC o subcontrato

- **Documentado:** `02-modules/EXPENSES_AND_PAYMENTS.md`; `03-finance/ACCOUNTS_PAYABLE.md`; `05-workflows/PURCHASE_TO_PAY.md`; `D-052/D-055/D-066/D-089/D-110/D-112/D-131`.
- **Implementado:** [apps/web/features/ap/components/supplier-invoice-form.tsx](<../../../../apps/web/features/ap/components/supplier-invoice-form.tsx>); [apps/web/features/ap/components/supplier-invoice-edit-form.tsx](<../../../../apps/web/features/ap/components/supplier-invoice-edit-form.tsx>); [apps/web/features/finance/components/new-transaction-dialog.tsx](<../../../../apps/web/features/finance/components/new-transaction-dialog.tsx>); `Actions de facturas-proveedor de empresa/obra` → `packages/validators/src/ap.ts` → `ap/supplier-invoice.service.ts:create/update/issue/cancelSupplierInvoice`; `ap/register-ap-expense.service.ts:registerApExpense`; `ap/supplier-invoice-from-po.service.ts`; `ap/supplier-invoice-po-reconciliation.service.ts`.
- **Persistencia real:** Prisma SupplierInvoice/SupplierInvoiceLine; Payable; Payment/AccountMovement opcionales; OC/recepción/subcert como padres existentes; AuditLog. No se inventa un repositorio intermedio.
- **Expuesto:** `/proyectos/[id]/facturas-proveedor`; `/proyectos/[id]/facturas-proveedor/nueva`; `/proyectos/[id]/facturas-proveedor/[supplierInvoiceId]`; `/finanzas/facturas-proveedor`; `/finanzas/transacciones`. Acceso: AP VIEW/EDIT y ámbito de empresa/obra; ACL de proyecto; canRegisterApPayment y Tesorería para payNow.
- **Lectura y retorno:** Factura/CxP/Field/Payment DTO; Cobertura de OC y liquidación de subcert; Aging/proyección/snapshot corporativo; Layouts financieros invalidados. Aprobar subcert habilita factura DRAFT; emitir factura genera CxP. No se agrega APPROVED a SupplierInvoice ni se simula un pago sin deuda.
- **Probado previamente:** AG-06/08 cubrían vínculo OC/recepción/subcert y settlement; sus casos afectados se revalidan por selección.
- **Probado en esta ejecución:** `output/platform-audit/ag-09-2026-11-05/sql-ap-second.log`; [packages/services/src/ap/ap-platform-audit.test.ts](<../../../../packages/services/src/ap/ap-platform-audit.test.ts>). Resultados por revisión en §6.
- **Cobertura final:** selección de liquidación AG-08 aprobada y AP incluido en la muestra de navegador (§6).
- **IDs asociados:** `GA-AG-09-001`, `GA-AG-09-002`, `GA-AG-09-003`, `GA-AG-09-004`, `GA-AG-09-005`, `GA-AG-09-007`, `GA-AG-09-008`, `GA-AG-09-013`, `GA-AG-09-015`, `GA-AG-09-017`, `GA-AG-09-019`, `GA-AG-09-022`, `GA-AG-09-024`, `GA-AG-09-025`, `GA-AG-09-026`, `GA-AG-09-028`, `GA-AG-09-029`.

### AG09-R04 — Notas de crédito y débito AR/AP

- **Documentado:** `D-115`; `01-domain/STATE_MACHINES.md`; `D-042/BR-PROJ-003`; `D-053/D-093/D-117`; `D-133/Q-080`.
- **Implementado:** [apps/web/features/finance/components/create-fiscal-note-dialog.tsx](<../../../../apps/web/features/finance/components/create-fiscal-note-dialog.tsx>); `Editores y detalles de factura AR/AP de obra/empresa`; `Actions contextuales AR/AP` → `createSalesNoteSchema/createSupplierFiscalNoteSchema`; `Schemas de edición de factura` → `ar/credit-debit-note.service.ts:createNoteDraft/issue/cancel`; `ap/credit-debit-note.service.ts:createNoteDraft/issue/cancel`.
- **Persistencia real:** SalesInvoice/SupplierInvoice documentKind=CREDIT_NOTE o DEBIT_NOTE; ReceivableCreditApplication/PayableCreditApplication; Receivable/Payable nueva para ND; AuditLog/GL DRAFT vinculado. No se inventa un repositorio intermedio.
- **Expuesto:** `Detalles de factura /proyectos/[id]/facturas y /facturas-proveedor`; `Detalles corporativos /finanzas/facturas y /finanzas/facturas-proveedor`. Acceso: Permiso de edición correspondiente; Padre y todas las relaciones del mismo ámbito; NC de obra conserva ACTIVE en preflight y TX.
- **Lectura y retorno:** Notas vinculadas; Saldo neto y estado derivado; NC anulada sin crédito activo; Series y códigos NC/ND correctos. NC reduce deuda sin caja; ND crea deuda propia. No se habilitan notas sin padre ni crédito abierto. No se extendió una excepción de proyecto por analogía.
- **Probado previamente:** Numeración/conexiones parciales AG-08.
- **Probado en esta ejecución:** `output/platform-audit/ag-09-2026-11-05/sql-ar-third.log`; `output/platform-audit/ag-09-2026-11-05/sql-ap-second.log`; `output/platform-audit/ag-09-2026-11-05/nc-project-policy-restoration.json`; [packages/services/src/idempotency/idempotency.test.ts](<../../../../packages/services/src/idempotency/idempotency.test.ts>). Resultados por revisión en §6.
- **Cobertura final:** manifiesto revisado. Notas verificadas por pruebas generales y SQL.
- **IDs asociados:** `GA-AG-09-002`, `GA-AG-09-003`, `GA-AG-09-004`, `GA-AG-09-005`, `GA-AG-09-006`, `GA-AG-09-011`, `GA-AG-09-012`, `GA-AG-09-013`, `GA-AG-09-018`, `GA-AG-09-022`, `GA-AG-09-023`, `GA-AG-09-027`, `GA-AG-09-029`, `GA-AG-09-030`.

### AG09-R05 — Cobros/pagos parciales, totales e inmediatos y su reversión

- **Documentado:** `03-finance/ACCOUNTS_RECEIVABLE.md`; `03-finance/ACCOUNTS_PAYABLE.md`; `05-workflows/REGISTER_PAYMENT.md`; `D-008/D-010/D-052/D-061/D-069/D-115`; `BR-TRZ-003/004/005`.
- **Implementado:** [apps/web/features/collections/components/collection-form.tsx](<../../../../apps/web/features/collections/components/collection-form.tsx>); [apps/web/features/ap/components/payment-form.tsx](<../../../../apps/web/features/ap/components/payment-form.tsx>); `Historial corporativo de CxC`; `Actions de caja de obra/empresa` → `createCollectionSchema/createPaymentSchema`; `collectNow/payNow` → `treasury/collection.service.ts:createCollection/cancelCollection`; `ap/payment.service.ts:createPayment/cancelPayment`; `ap/apply-payment-to-payable.ts`; `accounting/accounting-cancel-sync.service.ts`; `accounting/journal-entry.service.ts`.
- **Persistencia real:** Receivable/Payable paidAmount; Collection/Payment; AccountMovement INFLOW/OUTFLOW; AuditLog; JournalEntry/Line cuando corresponde. No se inventa un repositorio intermedio.
- **Expuesto:** `/proyectos/[id]/cuentas-por-cobrar/[receivableId]/cobrar`; `/proyectos/[id]/cuentas-por-pagar/[payableId]/pagar`; `/proyectos/[id]/cobranzas/[collectionId]`; `/proyectos/[id]/pagos/[paymentId]`; `/finanzas/cuentas-por-cobrar/[receivableId]`; `/finanzas/pagos-proveedor/[paymentId]`. Acceso: AR/AP según operación y D-069 para pago; Ámbito de empresa/obra y ACL; Tesorería en preview y TX; Período/reconciliación/GL como límites existentes.
- **Lectura y retorno:** Historial con estado de cada movimiento; Saldo original−caja−crédito; Trazabilidad de factura/deuda/pago; Reportes de caja y GL enlazado. Pagar/Cobrar saldo total usa saldo almacenado en servidor. No se agrega una regla nueva de fondos para cancelar un ingreso. La reversión neutral de factura/pago/cobranza conserva la base; NC conserva su guard ACTIVE.
- **Probado previamente:** Matriz de acceso e invalidación AG-08.
- **Probado en esta ejecución:** `output/platform-audit/ag-09-2026-11-05/sql-ar-third.log`; `output/platform-audit/ag-09-2026-11-05/sql-ap-second.log`; [packages/services/src/finance/payment-collection-access.test.ts](<../../../../packages/services/src/finance/payment-collection-access.test.ts>); [packages/services/src/accounting/accounting-ar-ap-cancel-atomic.test.ts](<../../../../packages/services/src/accounting/accounting-ar-ap-cancel-atomic.test.ts>); [apps/web/features/ap/lib/payment-detail-rsc.test.mjs](<../../../../apps/web/features/ap/lib/payment-detail-rsc.test.mjs>). Resultados por revisión en §6.
- **Cobertura final:** regresión de liquidación aprobada; ver operaciones muestreadas y límites en §6.
- **IDs asociados:** `GA-AG-09-001`, `GA-AG-09-002`, `GA-AG-09-004`, `GA-AG-09-008`, `GA-AG-09-013`, `GA-AG-09-014`, `GA-AG-09-015`, `GA-AG-09-017`, `GA-AG-09-020`, `GA-AG-09-021`, `GA-AG-09-022`, `GA-AG-09-023`, `GA-AG-09-024`, `GA-AG-09-026`, `GA-AG-09-027`.

### AG09-R06 — Aging, snapshots, proyecciones, reportes, CSV, avisos y tools AI

- **Documentado:** `MONEY_MODEL`; `MULTI_CURRENCY_RULES`; `D-008/D-053/D-115`; `TENANT_COMPANY_SCOPING`; `CHANGE_IMPACT_POLICY`.
- **Implementado:** `features/aging`; `features/project-cash-flow`; `Finanzas de obra/empresa`; `Exportadores CSV`; `AI get_payables/get_receivables` → `parseObligationAsOfDate`; `Filtros existentes de reportes` → `aging/aging.service.ts`; `project-cash-flow/project-cash-flow.service.ts`; `project-cash-flow/project-cash-position-projection.service.ts`; `project-finance/project-attributed-cash.service.ts`; `reports/project-cash-projection.service.ts`; `reports/project-supplier-report.service.ts`; `reports/certification-evolution.service.ts`; `notifications/operational-alerts.service.ts`; `notifications/notification-email-context.ts`; `report-exports/report-export.service.ts`; `ai/tools/finance-tools.ts`.
- **Persistencia real:** Prisma read de obligaciones y caja confirmada; Snapshots derivados sin segunda fuente operativa; CAS de estado overdue sin alterar importes. No se inventa un repositorio intermedio.
- **Expuesto:** `/finanzas/cuentas-por-cobrar`; `/finanzas/cuentas-por-pagar`; `/proyectos/[id]/cuentas-por-cobrar`; `/proyectos/[id]/cuentas-por-pagar`; `Reportes y exportaciones financieros existentes`. Acceso: Capacidad financiera de proyecto o corporativa según vista; ACL del proyecto; Filtro explícito de empresa dentro del anclaje autorizado; Gates AR/AP de cada sección.
- **Lectura y retorno:** byCurrency y totales no mezclados; creditedAmount visible/exportado; Deuda neta en proyección/KPI/aviso; Contexto/ACL del mismo service también para AI. Los filtros del bloque Antigüedad de saldos no se prometen como filtros de otros listados. No disponible no equivale a cero/vacío. La IA reutiliza services; no se agregó escritura AI.
- **Probado previamente:** Selecciones históricas no sustituyen los casos AR/AP actuales.
- **Probado en esta ejecución:** `output/platform-audit/ag-09-2026-11-05/sql-ar-consumers-first.log`; [packages/services/src/finance/obligation-date.test.ts](<../../../../packages/services/src/finance/obligation-date.test.ts>); [packages/services/src/notifications/financial-notification-balance.test.ts](<../../../../packages/services/src/notifications/financial-notification-balance.test.ts>); [apps/web/features/finance/lib/financial-interactions.test.ts](<../../../../apps/web/features/finance/lib/financial-interactions.test.ts>). Resultados por revisión en §6.
- **Cobertura final:** 8 casos de consumidores aprobados, incluida la herramienta AI sin modelo; aging incluido en la muestra visual.
- **IDs asociados:** `GA-AG-09-001`, `GA-AG-09-002`, `GA-AG-09-003`, `GA-AG-09-008`, `GA-AG-09-009`, `GA-AG-09-010`, `GA-AG-09-021`, `GA-AG-09-026`, `GA-AG-09-027`, `GA-AG-09-028`.

### Dimensiones y fronteras

- **Contrato completo:** Forms/Actions → schemas → services → Prisma real → efectos → DTO → invalidación/listas/reportes. Evidencia: `reviewed_with_final_verification_pending`.

- **Schema/relaciones:** Modelos operativos AR/AP/Collection/Payment y FKs simples; guards de padre y referencias adicionales. Sin cambio de schema/migración. Evidencia: `reviewed_in_scope`.

- **Tenant/empresa/proyecto/RBAC/gates:** Tenants y empresas sintéticos, obra compartida, ACL, corporativo, URL/Action directa y gate después de preflight; no se revisa toda identidad de plataforma. Evidencia: `reviewed_with_SQL`.

- **Finanzas/estados/concurrencia:** Dinero2/FX6/qty4, impuestos, cash vs credit, idempotencia, CAS, series, locks, rollback/GL y fuente fresca. Evidencia: `reviewed_with_SQL`.

- **Consumidores:** Aging, snapshot, cash projection, proveedor, evolución, avisos/email, CSV y tools AI. La selección final de 8 casos pasó, incluida la herramienta AI sin modelo externo.

- **UI/UX/visual/a11y:** Controles, etiquetas, error/pending, confirmaciones, Field/RSC y límites de filtros; muestra de navegador con viewports, temas y capturas en §6.

- **Archivos/proveedores:** Recuperación create-then-upload; no envío real de email, R2, AI modelo ni proveedor externo. Evidencia: `bounded_static`.

- **Ayuda/Guide/AI:** D-090 y policy: Guide§12, help finance, módulos/workflows, D-133; índice de 583 fragmentos verificado, seis pruebas de recuperación en la corrida general y cinco evals preparados sin ejecución con modelo. Evidencia: `updated_index_checked`.

- **Rendimiento/observabilidad:** P2028 real y tiempos transaccionales acotados; no benchmark de volumen, carga o producción. Evidencia: `bounded_evidence_only`.

La revisión de UI incluye pruebas de interacción, RSC y la muestra visual de §6. No certifica WCAG ni todas las combinaciones de rol, viewport, histórico o volumen.

**AG-10 no comenzó.** Se incluyen solo consumidores demostrados de AG-06/08 y la frontera de tesorería/GL conectada con AR/AP. Cuentas, transferencias, conciliación, cierres, libros y otras fuentes contables quedan fuera de una auditoría completa. [P-AG10-01](../PENDING_ARCHITECTURE_ITEMS.md) conserva el diseño pendiente de snapshots FX de AccountMovement/InternalTransfer: no se agrega captura sin persistencia ni se supone FX 1 extranjero.

No se habilitan conversión entre monedas, diferencias de cambio automáticas, TaxLine fino, cuentas puente o pagos batch; tampoco se reconcilian masivamente históricos productivos. Las evidencias anteriores se revalidan según dependencia, no se heredan por tener el mismo módulo.

## 3. Evidencia de recorridos

AG09-R01…R06 registran entrada, capacidad, schema, service, tablas, efectos y lectura posterior. Las suites citadas prueban caminos positivos/negativos, tenant/empresa/obra ajenos, capacidad corporativa, módulo deshabilitado antes/después del preflight, motivo, reintento, simultaneidad y rollback según su selección.

- **Documental:** emitir factura crea deuda; NC aplica crédito sin caja; ND abre deuda propia, con códigos/orígenes correctos.
- **Caja:** parcial/total usa saldo almacenado; reversión con movimiento exacto conserva caja/deuda/GL si falla.
- **GL vinculado:** auditoría fallida revierte también la operación; POSTED concurrente bloquea anulación y auto-DRAFT tardío sobre fuente cancelada no queda posteable.
- **Lectura:** original−caja−crédito, snapshot con padres; el polvo legado puede proyectarse saldado sin escribir dinero/estado/timestamp.
- **UI/consumidores:** DTO planos, confirmaciones/motivos, mutex, invalidación, estados anulados/saldados y agrupación por moneda.

El código usa Prisma realmente dentro de services; no se dibuja una capa inexistente. Un test preparado no se cuenta como SQL aprobado y el smoke público AG-08 no comprueba AG-09 local.

## 4. Hallazgos consolidados

Un ID por causa, conservando aliases AR/AP/FE para trazabilidad. P1 identifica autorización, integridad financiera o flujo central bloqueado; P2, una inconsistencia funcional acotada. No se asigna P0 sin impacto crítico demostrado.

<a id="ga-ag-09-001"></a>
### GA-AG-09-001 — Ámbito de empresa, obra y acceso corporativo

- **Tipo / prioridad / origen:** desviación confirmada; **P1**; previo a la base; confirmado durante AG-09. Aliases: `AR-ACCESS`, `FE-corporate-scope`, `ap-cancellation-permissions-audit-and-identifiers`.
- **Fuente / ubicación:** `ADR-018`; `D-056`; `D-111`; `TENANT_COMPANY_SCOPING`. [packages/services/src/ar/sales-invoice.service.ts](<../../../../packages/services/src/ar/sales-invoice.service.ts>); [packages/services/src/ar/receivable.service.ts](<../../../../packages/services/src/ar/receivable.service.ts>); [packages/services/src/ar/project-ar-summary.service.ts](<../../../../packages/services/src/ar/project-ar-summary.service.ts>); [packages/services/src/treasury/collection.service.ts](<../../../../packages/services/src/treasury/collection.service.ts>); [packages/services/src/ap/payable.service.ts](<../../../../packages/services/src/ap/payable.service.ts>); [apps/web/app/(app)/finanzas/cuentas-por-cobrar/actions.ts](<../../../../apps/web/app/(app)/finanzas/cuentas-por-cobrar/actions.ts>); [apps/web/app/(app)/finanzas/cuentas-por-pagar/actions.ts](<../../../../apps/web/app/(app)/finanzas/cuentas-por-pagar/actions.ts>).
- **Reproducción y observado:** Consultar empresa A con una obra compartida y documentos de B; llamar un ID corporativo con capacidad solo de proyecto; cancelar una deuda sin asignación a la obra. Algunas listas y getters no comprobaban empresa/capacidad corporativa y ciertas cancelaciones carecían de ACL de obra.
- **Esperado:** Solo devolver o mutar documentos de empresa/obra autorizada; un contexto de proyecto no obtiene capacidad corporativa por conocer un ID.
- **Corrección:** Aplicar filtros no nullable, guards por ámbito, ACL antes de mutación o replay y wrappers corporativos que rechazan fuentes de proyecto.
- **Pruebas / consumidores:** [packages/services/src/ar/ar-audit.live.test.ts](<../../../../packages/services/src/ar/ar-audit.live.test.ts>); [packages/services/src/finance/payment-collection-access.test.ts](<../../../../packages/services/src/finance/payment-collection-access.test.ts>); [apps/web/features/finance/lib/financial-actions.test.ts](<../../../../apps/web/features/finance/lib/financial-actions.test.ts>). Su existencia no acredita ejecución; resultados en §6.
- **Situación:** corregido y verificado en AG-09; evidencias y límites en §6.

<a id="ga-ag-09-002"></a>
### GA-AG-09-002 — Pertenencia de padres y referencias adicionales

- **Tipo / prioridad / origen:** desviación confirmada; **P1**; previo a la base; confirmado durante AG-09. Aliases: `AR-PARENTS`, `ap-parent-and-line-integrity`.
- **Fuente / ubicación:** `ADR-018`; `D-055`; `D-066`; `D-110`; `D-115`. [packages/services/src/ar/ar-integrity.ts](<../../../../packages/services/src/ar/ar-integrity.ts>); [packages/services/src/ap/ap-integrity.ts](<../../../../packages/services/src/ap/ap-integrity.ts>); [packages/services/src/ap/supplier-invoice.service.ts](<../../../../packages/services/src/ap/supplier-invoice.service.ts>); [packages/services/src/ap/payment.service.ts](<../../../../packages/services/src/ap/payment.service.ts>); [packages/services/src/ap/corporate-ap-snapshot.ts](<../../../../packages/services/src/ap/corporate-ap-snapshot.ts>); [packages/services/src/ar/company-ar-snapshot.ts](<../../../../packages/services/src/ar/company-ar-snapshot.ts>); [packages/services/src/finance/obligation-read-integrity.ts](<../../../../packages/services/src/finance/obligation-read-integrity.ts>); [packages/services/src/aging/aging.service.ts](<../../../../packages/services/src/aging/aging.service.ts>).
- **Reproducción y observado:** Usar una FK simple válida hacia contacto, factura, WBS, APU, OC o subcert de otro ámbito; alterar un padre de una obligación antes de leerla o pagarla. La FK aislada no garantizaba coherencia tenant/empresa/obra entre ambos extremos; algunas lecturas podían exponer etiquetas o utilizar dinero con padre incoherente.
- **Esperado:** Cada relación utilizada pertenece al tenant y conserva empresa/obra/contacto y trazabilidad monetaria coherentes.
- **Corrección:** Validar raíces y grafos unidos, líneas WBS/APU/OC y obligación-factura antes de serializar o mutar; revalidar dentro de TX y retirar joins internos de DTO. El pago valida también líneas históricas antes de crear caja.
- **Pruebas / consumidores:** [packages/services/src/ar/ar-integrity.test.ts](<../../../../packages/services/src/ar/ar-integrity.test.ts>); [packages/services/src/ap/ap-platform-audit.test.ts](<../../../../packages/services/src/ap/ap-platform-audit.test.ts>); [packages/services/src/finance/obligation-read-integrity.test.ts](<../../../../packages/services/src/finance/obligation-read-integrity.test.ts>); [packages/services/src/ar/ar-finance-consumers-audit.live.test.ts](<../../../../packages/services/src/ar/ar-finance-consumers-audit.live.test.ts>); [packages/services/src/ap/ap-platform-audit.live.test.ts](<../../../../packages/services/src/ap/ap-platform-audit.live.test.ts>). Su existencia no acredita ejecución; resultados en §6.
- **Situación:** corregido y verificado en AG-09; evidencias y límites en §6.

<a id="ga-ag-09-003"></a>
### GA-AG-09-003 — Validación de servicios, fechas reales y borrado explícito

- **Tipo / prioridad / origen:** desviación confirmada; **P1**; previo a la base; confirmado durante AG-09. Aliases: `AR-INPUTS`, `ap-decimal-contracts-and-input-validation`.
- **Fuente / ubicación:** `API_STRUCTURE`; `D-084`; `D-117`. [packages/validators/src/sales-invoice.ts](<../../../../packages/validators/src/sales-invoice.ts>); [packages/validators/src/ap.ts](<../../../../packages/validators/src/ap.ts>); [packages/validators/src/ar-advance.ts](<../../../../packages/validators/src/ar-advance.ts>); [packages/validators/src/treasury.ts](<../../../../packages/validators/src/treasury.ts>); [packages/services/src/ar/ar-integrity.ts](<../../../../packages/services/src/ar/ar-integrity.ts>); [packages/services/src/ap/ap-input.ts](<../../../../packages/services/src/ap/ap-input.ts>); [packages/services/src/finance/obligation-date.ts](<../../../../packages/services/src/finance/obligation-date.ts>); [packages/services/src/finance/pagination.ts](<../../../../packages/services/src/finance/pagination.ts>); [packages/services/src/finance/pagination.test.ts](<../../../../packages/services/src/finance/pagination.test.ts>); [apps/web/app/(app)/finanzas/cuentas-por-cobrar/page.tsx](<../../../../apps/web/app/(app)/finanzas/cuentas-por-cobrar/page.tsx>); [apps/web/app/(app)/finanzas/cuentas-por-pagar/page.tsx](<../../../../apps/web/app/(app)/finanzas/cuentas-por-pagar/page.tsx>); [apps/web/app/(app)/finanzas/transacciones/page.tsx](<../../../../apps/web/app/(app)/finanzas/transacciones/page.tsx>).
- **Reproducción y observado:** Invocar un service directamente con 2026-02-30, datos no válidos o notes=null; pedir un aging con fecha de corte imposible. Probar además page/pageSize NaN, Infinity o fraccionarios y parámetros de URL no numéricos. Se confiaba en el transporte o en tipos TypeScript; regex de fecha normalizaba días inexistentes y null podía no limpiar notas. La paginación podía pasar valores no enteros o skip fuera del rango de Prisma y terminar en error de consulta.
- **Esperado:** Una llamada directa al service respeta el mismo contrato que la Action; fechas imposibles se rechazan y null limpia el campo nullable. La paginación usa valores enteros seguros y vuelve a la primera página ante una URL inválida.
- **Corrección:** Parsear schemas en la frontera del service, validar calendario y orden manual de fechas, conservar vencimientos heredados de notas y respetar null explícito. La fecha de corte inválida se rechaza. Normalizar enteros y límites en resolvePagination y reutilizar parsePage en las tres páginas corporativas afectadas, sin cambiar el flujo válido.
- **Pruebas / consumidores:** [packages/services/src/ar/ar-audit.live.test.ts](<../../../../packages/services/src/ar/ar-audit.live.test.ts>); [packages/services/src/ar/ar-integrity.test.ts](<../../../../packages/services/src/ar/ar-integrity.test.ts>); [packages/services/src/ap/ap-platform-audit.test.ts](<../../../../packages/services/src/ap/ap-platform-audit.test.ts>); [packages/services/src/finance/obligation-date.test.ts](<../../../../packages/services/src/finance/obligation-date.test.ts>); [packages/services/src/finance/pagination.test.ts](<../../../../packages/services/src/finance/pagination.test.ts>); `Muestra de URL con page fuera de rango, §6`. Su existencia no acredita ejecución; resultados en §6.
- **Situación:** corregido y verificado en AG-09; evidencias y límites en §6.

<a id="ga-ag-09-004"></a>
### GA-AG-09-004 — DTO financieros serializables en RSC y cliente

- **Tipo / prioridad / origen:** desviación confirmada; **P1**; previo a la base; confirmado durante AG-09. Aliases: `ap-decimal-contracts-and-input-validation`, `AR-NOTE-MONEY`.
- **Fuente / ubicación:** `D-053`; `FRONTEND_ARCHITECTURE`. [packages/services/src/ar/sales-invoice.service.ts](<../../../../packages/services/src/ar/sales-invoice.service.ts>); [packages/services/src/ar/receivable.service.ts](<../../../../packages/services/src/ar/receivable.service.ts>); [packages/services/src/treasury/collection.service.ts](<../../../../packages/services/src/treasury/collection.service.ts>); [packages/services/src/ap/supplier-invoice.service.ts](<../../../../packages/services/src/ap/supplier-invoice.service.ts>); [packages/services/src/ap/payment.service.ts](<../../../../packages/services/src/ap/payment.service.ts>); [packages/services/src/ap/credit-debit-note.service.ts](<../../../../packages/services/src/ap/credit-debit-note.service.ts>).
- **Reproducción y observado:** Pasar vistas que extendían un modelo Prisma con fxRate/amountArs Decimal hacia un formulario o React Flight. Parte del dinero/FX quedaba como objeto Decimal, aunque otros importes ya estaban convertidos a string.
- **Esperado:** Las props y DTO contienen strings monetarios/FX o valores JSON planos, nunca Prisma.Decimal ni joins internos.
- **Corrección:** Serializar money a 2 dp y FX a 6 dp, devolver contratos planos y preservar la identidad/código documental de deuda y pago.
- **Pruebas / consumidores:** [packages/services/src/ap/ap-platform-audit.test.ts](<../../../../packages/services/src/ap/ap-platform-audit.test.ts>); [packages/services/src/ar/ar-audit.live.test.ts](<../../../../packages/services/src/ar/ar-audit.live.test.ts>); [apps/web/features/ap/lib/payment-detail-rsc.test.mjs](<../../../../apps/web/features/ap/lib/payment-detail-rsc.test.mjs>). Su existencia no acredita ejecución; resultados en §6.
- **Situación:** corregido y verificado en AG-09; evidencias y límites en §6.

<a id="ga-ag-09-005"></a>
### GA-AG-09-005 — Redondeo y conservación de líneas en NC/ND

- **Tipo / prioridad / origen:** desviación confirmada; **P1**; previo a la base; confirmado durante AG-09. Aliases: `AR-NOTE-MONEY`, `ap-notes-money-kernel`.
- **Fuente / ubicación:** `D-053`; `D-086`; `D-093`; `D-117`. [packages/services/src/ar/credit-debit-note.service.ts](<../../../../packages/services/src/ar/credit-debit-note.service.ts>); [packages/services/src/ar/sales-invoice.service.ts](<../../../../packages/services/src/ar/sales-invoice.service.ts>); [packages/services/src/ap/credit-debit-note.service.ts](<../../../../packages/services/src/ap/credit-debit-note.service.ts>).
- **Reproducción y observado:** Crear dos líneas con importes pequeños e IVA o copiar una ND sin cambiar los datos monetarios guardados. Las notas sumaban componentes Decimal crudos antes de redondear; la copia podía recalcular snapshots y la edición podía omitir precios con IVA incluido.
- **Esperado:** Redondear cada componente antes de sumar y conservar los componentes guardados cuando los datos monetarios no cambian.
- **Corrección:** Usar resolveInvoiceLineMoney por componente, conservar snapshots cuando corresponde y honrar la captura bruto/neto al editar.
- **Pruebas / consumidores:** [packages/services/src/ar/ar-audit.live.test.ts](<../../../../packages/services/src/ar/ar-audit.live.test.ts>); [packages/services/src/ap/ap-platform-audit.test.ts](<../../../../packages/services/src/ap/ap-platform-audit.test.ts>); [packages/services/src/ap/ap-platform-audit.live.test.ts](<../../../../packages/services/src/ap/ap-platform-audit.live.test.ts>). Su existencia no acredita ejecución; resultados en §6.
- **Situación:** corregido y verificado en AG-09; evidencias y límites en §6.

<a id="ga-ag-09-006"></a>
### GA-AG-09-006 — Decimales canónicos reinterpretados como miles

- **Tipo / prioridad / origen:** desviación confirmada; **P1**; previo en el validator compartido; expuesto y amplificado por la nueva validación de servicios de AG-09. Aliases: `ROOT-CANONICAL-DECIMAL`, `AR-NOTE-MONEY`.
- **Fuente / ubicación:** `D-053`; `D-093`; `API_STRUCTURE`. [packages/validators/src/money.ts](<../../../../packages/validators/src/money.ts>); [packages/validators/src/money-unit-price.test.ts](<../../../../packages/validators/src/money-unit-price.test.ts>); [packages/validators/src/inventory-inputs.test.ts](<../../../../packages/validators/src/inventory-inputs.test.ts>).
- **Reproducción y observado:** Revalidar unitPrice='0.025' o discountPct='0.025' recibido como decimal técnico canónico. El parser localizado transformaba 0.025 en 25; 1.255 se convertía en 1255 o se rechazaba como descuento superior a 100.
- **Esperado:** El string técnico 0.025 conserva ese valor en cada parseo; la captura localizada se normaliza en su borde correspondiente.
- **Corrección:** Priorizar el decimal canónico antes del parser de entrada localizada; conservar 1.234,56 explícito y el parser de teclado es-AR. Parsear repetidamente mantiene el importe.
- **Pruebas / consumidores:** [packages/validators/src/money-unit-price.test.ts](<../../../../packages/validators/src/money-unit-price.test.ts>); [packages/validators/src/inventory-inputs.test.ts](<../../../../packages/validators/src/inventory-inputs.test.ts>); [packages/services/src/finance/discount-pct-string.test.ts](<../../../../packages/services/src/finance/discount-pct-string.test.ts>); [packages/utils/src/money.test.ts](<../../../../packages/utils/src/money.test.ts>). Su existencia no acredita ejecución; resultados en §6.
- **Situación:** corregido y verificado en AG-09; evidencias y límites en §6.

<a id="ga-ag-09-007"></a>
### GA-AG-09-007 — Captura y edición con precisión de cuatro decimales

- **Tipo / prioridad / origen:** desviación confirmada; **P2**; previo a la base; confirmado durante AG-09. Aliases: `FE-precision`.
- **Fuente / ubicación:** `D-053`; `MONEY_MODEL`. [apps/web/features/sales-invoices/components/manual-invoice-form.tsx](<../../../../apps/web/features/sales-invoices/components/manual-invoice-form.tsx>); [apps/web/features/sales-invoices/components/invoice-edit-form.tsx](<../../../../apps/web/features/sales-invoices/components/invoice-edit-form.tsx>); [apps/web/features/ap/components/invoice-lines-editor.tsx](<../../../../apps/web/features/ap/components/invoice-lines-editor.tsx>).
- **Reproducción y observado:** Editar cantidad, precio unitario o descuento con más de dos decimales o usar coma decimal en una nota. Algunos controles recortaban a 2 dp o enviaban texto localizado sin normalización.
- **Esperado:** Capturar y conservar hasta 4 dp donde el contrato los permite, sin alterar la presentación monetaria 2 dp.
- **Corrección:** Reutilizar DecimalInput con precisión 4 y labels coherentes; mantener presentación es-AR y dinero operativo a 2 dp.
- **Pruebas / consumidores:** [apps/web/features/finance/lib/financial-interactions.test.ts](<../../../../apps/web/features/finance/lib/financial-interactions.test.ts>). Su existencia no acredita ejecución; resultados en §6.
- **Situación:** corregido y verificado en AG-09; evidencias y límites en §6.

<a id="ga-ag-09-008"></a>
### GA-AG-09-008 — Las lecturas no deben crear caja ni regularizar históricos

- **Tipo / prioridad / origen:** desviación confirmada; **P1**; previo a la base; confirmado durante AG-09. Aliases: `AR-NC-SNAPSHOT`, `ap-read-must-not-invent-cash`.
- **Fuente / ubicación:** `D-053`; `D-115`; `D-117`. [packages/services/src/ar/receivable.service.ts](<../../../../packages/services/src/ar/receivable.service.ts>); [packages/services/src/ap/payable.service.ts](<../../../../packages/services/src/ap/payable.service.ts>).
- **Reproducción y observado:** Leer una deuda 100 con pago 40 y crédito 60, o un legado con paidAmount=49.999 y creditedAmount=50. La reconciliación en lectura escribía paidAmount/status; podía convertir crédito o polvo subcentavo en caja persistida sin una operación de tesorería.
- **Esperado:** Una consulta no modifica dinero, estado persistido ni timestamp; la proyección puede derivar saldada sin crear caja.
- **Corrección:** Derivar saldo y estado solo en DTO. Conservar original, paid, credited, status y updatedAt persistidos durante la consulta. No hay reparación masiva de históricos.
- **Pruebas / consumidores:** [packages/services/src/ap/ap-platform-audit.test.ts](<../../../../packages/services/src/ap/ap-platform-audit.test.ts>); [packages/services/src/ar/ar-audit.live.test.ts](<../../../../packages/services/src/ar/ar-audit.live.test.ts>); [packages/services/src/ap/ap-platform-audit.live.test.ts](<../../../../packages/services/src/ap/ap-platform-audit.live.test.ts>). Su existencia no acredita ejecución; resultados en §6.
- **Situación:** corregido y verificado en AG-09; evidencias y límites en §6.

<a id="ga-ag-09-009"></a>
### GA-AG-09-009 — Créditos omitidos en saldos, proyecciones y avisos

- **Tipo / prioridad / origen:** desviación confirmada; **P1**; previo a la base; confirmado durante AG-09. Aliases: `AR-NC-SNAPSHOT`, `ROOT-CREDIT-CONSUMERS`.
- **Fuente / ubicación:** `D-115`; `ACCOUNTS_RECEIVABLE`; `ACCOUNTS_PAYABLE`. [packages/services/src/ar/company-ar-snapshot.ts](<../../../../packages/services/src/ar/company-ar-snapshot.ts>); [packages/services/src/project-cash-flow/project-cash-position-projection.service.ts](<../../../../packages/services/src/project-cash-flow/project-cash-position-projection.service.ts>); [packages/services/src/reports/project-cash-projection.service.ts](<../../../../packages/services/src/reports/project-cash-projection.service.ts>); [packages/services/src/reports/project-supplier-report.service.ts](<../../../../packages/services/src/reports/project-supplier-report.service.ts>); [packages/services/src/reports/certification-evolution.service.ts](<../../../../packages/services/src/reports/certification-evolution.service.ts>); [packages/services/src/notifications/operational-alerts.service.ts](<../../../../packages/services/src/notifications/operational-alerts.service.ts>); [packages/services/src/notifications/notification-email-context.ts](<../../../../packages/services/src/notifications/notification-email-context.ts>); [packages/services/src/finance/obligation-date.ts](<../../../../packages/services/src/finance/obligation-date.ts>).
- **Reproducción y observado:** Aplicar una NC parcial y consultar snapshot, proyección, vencimientos, evolución, email o estado con paid=0. Algunos consumidores usaban original-paid y mostraban deuda excesiva; un crédito parcial podía verse OPEN. El job podía marcar OVERDUE desde un saldo ya cambiado.
- **Esperado:** Todos los consumidores descuentan créditos; caja y crédito parcial explican correctamente saldo/estado y avisos.
- **Corrección:** Usar original-paid-credited, derivar PARTIAL por caja o crédito y proteger el cambio a OVERDUE con CAS de los importes leídos. Los emails muestran el saldo neto.
- **Pruebas / consumidores:** [packages/services/src/ar/ar-finance-consumers-audit.live.test.ts](<../../../../packages/services/src/ar/ar-finance-consumers-audit.live.test.ts>); [packages/services/src/finance/obligation-date.test.ts](<../../../../packages/services/src/finance/obligation-date.test.ts>); [packages/services/src/notifications/financial-notification-balance.test.ts](<../../../../packages/services/src/notifications/financial-notification-balance.test.ts>). Su existencia no acredita ejecución; resultados en §6.
- **Situación:** corregido y verificado en AG-09; evidencias y límites en §6.

<a id="ga-ag-09-010"></a>
### GA-AG-09-010 — Aging, CSV y herramientas AI sin sumar monedas distintas

- **Tipo / prioridad / origen:** desviación confirmada; **P1**; previo a la base; confirmado durante AG-09. Aliases: `FE-currency-aging`, `ROOT-AGING-CURRENCY`.
- **Fuente / ubicación:** `D-008`; `D-053`; `MONEY_MODEL`. [packages/services/src/aging/aging.service.ts](<../../../../packages/services/src/aging/aging.service.ts>); [packages/services/src/ai/tools/finance-tools.ts](<../../../../packages/services/src/ai/tools/finance-tools.ts>); [packages/services/src/report-exports/report-export.service.ts](<../../../../packages/services/src/report-exports/report-export.service.ts>); [apps/web/features/aging/components/aging-summary-cards.tsx](<../../../../apps/web/features/aging/components/aging-summary-cards.tsx>); [apps/web/features/aging/components/aging-table.tsx](<../../../../apps/web/features/aging/components/aging-table.tsx>).
- **Reproducción y observado:** Consultar aging de ARS 100 y USD 10 sin filtro de moneda. El total general sumaba unidades originales incompatibles y podía presentarse en UI/AI como un único importe.
- **Esperado:** No existe una suma escalar ARS+USD original; UI/CSV/AI identifican y agrupan cada moneda.
- **Corrección:** Usar byCurrency; totals=null con más de una moneda. Mostrar moneda explícita, agregar creditedAmount al detalle/CSV y conservar separadas las fuentes de dashboard/AI.
- **Pruebas / consumidores:** [packages/services/src/ar/ar-finance-consumers-audit.live.test.ts](<../../../../packages/services/src/ar/ar-finance-consumers-audit.live.test.ts>); [apps/web/features/finance/lib/financial-interactions.test.ts](<../../../../apps/web/features/finance/lib/financial-interactions.test.ts>). Su existencia no acredita ejecución; resultados en §6.
- **Situación:** corregido y verificado en AG-09; evidencias y límites en §6.

<a id="ga-ag-09-011"></a>
### GA-AG-09-011 — Numeración NC/ND simultánea entre obras y corporativo

- **Tipo / prioridad / origen:** desviación confirmada; **P1**; previo a la base; confirmado durante AG-09. Aliases: `AR-NUMBER-RACE`, `ap-note-numbering-and-cancel-races`.
- **Fuente / ubicación:** `D-115`; `ENTITY_ID_STRATEGY`. [packages/services/src/ar/credit-debit-note.service.ts](<../../../../packages/services/src/ar/credit-debit-note.service.ts>); [packages/services/src/ap/credit-debit-note.service.ts](<../../../../packages/services/src/ap/credit-debit-note.service.ts>); [packages/services/src/treasury/treasury-write-locks.ts](<../../../../packages/services/src/treasury/treasury-write-locks.ts>).
- **Reproducción y observado:** Crear notas del mismo tipo y empresa al mismo tiempo desde distintas obras o sin proyecto. max(number)+1 sin bloqueo de empresa podía producir P2002; el bloqueo de una sola obra no protegía la serie común.
- **Esperado:** Cada creador obtiene un número distinto de la serie de su empresa y tipo, incluso desde obras distintas o corporativo.
- **Corrección:** Tomar Company tras Project cuando existe, calcular dentro de TX y conservar series separadas por documentKind.
- **Pruebas / consumidores:** [packages/services/src/ar/ar-audit.live.test.ts](<../../../../packages/services/src/ar/ar-audit.live.test.ts>); [packages/services/src/ap/ap-platform-audit.live.test.ts](<../../../../packages/services/src/ap/ap-platform-audit.live.test.ts>). Su existencia no acredita ejecución; resultados en §6.
- **Situación:** corregido y verificado en AG-09; evidencias y límites en §6.

<a id="ga-ag-09-012"></a>
### GA-AG-09-012 — Transiciones de notas y padre bajo datos frescos y CAS

- **Tipo / prioridad / origen:** desviación confirmada; **P1**; previo a la base; confirmado durante AG-09. Aliases: `AR-NUMBER-RACE`, `ap-note-numbering-and-cancel-races`.
- **Fuente / ubicación:** `D-115`; `STATE_MACHINES`. [packages/services/src/ar/credit-debit-note.service.ts](<../../../../packages/services/src/ar/credit-debit-note.service.ts>); [packages/services/src/ar/sales-invoice.service.ts](<../../../../packages/services/src/ar/sales-invoice.service.ts>); [packages/services/src/ap/credit-debit-note.service.ts](<../../../../packages/services/src/ap/credit-debit-note.service.ts>); [packages/services/src/ap/supplier-invoice.service.ts](<../../../../packages/services/src/ap/supplier-invoice.service.ts>).
- **Reproducción y observado:** Competir emisión de NC con anulación del padre o emisión/anulación de la misma NC borrador. Lecturas anteriores al lock y updates incondicionales podían dejar un documento cancelado con crédito confirmado o una nota emitida sobre padre cancelado.
- **Esperado:** Documento, padre y aplicación permanecen coherentes cualquiera sea el ganador de la carrera.
- **Corrección:** Serializar por empresa/documento, releer padre/saldo dentro de TX y reclamar estados con CAS; conservar documento y aplicación coherentes.
- **Pruebas / consumidores:** [packages/services/src/ar/ar-audit.live.test.ts](<../../../../packages/services/src/ar/ar-audit.live.test.ts>); [packages/services/src/ap/ap-platform-audit.live.test.ts](<../../../../packages/services/src/ap/ap-platform-audit.live.test.ts>). Su existencia no acredita ejecución; resultados en §6.
- **Situación:** corregido y verificado en AG-09; evidencias y límites en §6.

<a id="ga-ag-09-013"></a>
### GA-AG-09-013 — Motivo, confirmación y repetición segura de anulaciones

- **Tipo / prioridad / origen:** desviación confirmada; **P1**; previo a la base; confirmado durante AG-09. Aliases: `AR-CANCELLATION`, `ap-cancellation-permissions-audit-and-identifiers`, `FE-cancellation-confirmation`.
- **Fuente / ubicación:** `BR-AUD-002`; `BR-AUD-003`; `D-115`. [packages/services/src/ar/sales-invoice.service.ts](<../../../../packages/services/src/ar/sales-invoice.service.ts>); [packages/services/src/ar/receivable.service.ts](<../../../../packages/services/src/ar/receivable.service.ts>); [packages/services/src/ar/credit-debit-note.service.ts](<../../../../packages/services/src/ar/credit-debit-note.service.ts>); [packages/services/src/treasury/collection.service.ts](<../../../../packages/services/src/treasury/collection.service.ts>); [packages/services/src/ap/supplier-invoice.service.ts](<../../../../packages/services/src/ap/supplier-invoice.service.ts>); [packages/services/src/ap/payment.service.ts](<../../../../packages/services/src/ap/payment.service.ts>); [packages/services/src/ap/payable.service.ts](<../../../../packages/services/src/ap/payable.service.ts>); [apps/web/components/feedback/reason-action-button.tsx](<../../../../apps/web/components/feedback/reason-action-button.tsx>).
- **Reproducción y observado:** Anular un emitido/confirmado sin motivo, hacerlo desde un botón directo o repetir después de perder la respuesta. Faltaba trazabilidad del motivo y el reintento podía devolver conflicto pese al primer éxito.
- **Esperado:** Anular emitido/confirmado conserva motivo auditado y el replay autorizado no duplica efectos.
- **Corrección:** Exigir motivo en emitidos/confirmados, conservar confirmación de borrador sin motivo obligatorio, auditar y devolver el resultado de un replay ya cancelado solo después de comprobar acceso.
- **Pruebas / consumidores:** [packages/services/src/finance/payment-collection-access.test.ts](<../../../../packages/services/src/finance/payment-collection-access.test.ts>); [apps/web/features/finance/lib/financial-actions.test.ts](<../../../../apps/web/features/finance/lib/financial-actions.test.ts>); [apps/web/features/ap/lib/payment-detail-rsc.test.mjs](<../../../../apps/web/features/ap/lib/payment-detail-rsc.test.mjs>); [packages/services/src/ar/ar-audit.live.test.ts](<../../../../packages/services/src/ar/ar-audit.live.test.ts>); [packages/services/src/ap/ap-platform-audit.live.test.ts](<../../../../packages/services/src/ap/ap-platform-audit.live.test.ts>). Su existencia no acredita ejecución; resultados en §6.
- **Situación:** corregido y verificado en AG-09; evidencias y límites en §6.

<a id="ga-ag-09-014"></a>
### GA-AG-09-014 — Reversión de caja con un único movimiento exacto

- **Tipo / prioridad / origen:** desviación confirmada; **P1**; previo a la base; confirmado durante AG-09. Aliases: `AR-CANCELLATION`, `ap-parent-and-line-integrity`, `ROOT-COLLECTION-CASH-LEG`.
- **Fuente / ubicación:** `D-010`; `D-115`; `BR-TRZ-003`; `BR-TRZ-005`. [packages/services/src/treasury/collection.service.ts](<../../../../packages/services/src/treasury/collection.service.ts>); [packages/services/src/ar/ar-integrity.ts](<../../../../packages/services/src/ar/ar-integrity.ts>); [packages/services/src/ap/payment.service.ts](<../../../../packages/services/src/ap/payment.service.ts>); [packages/services/src/ap/ap-integrity.ts](<../../../../packages/services/src/ap/ap-integrity.ts>).
- **Reproducción y observado:** Eliminar, duplicar o alterar el movimiento vinculado; intentar revertir un importe mayor a la caja aplicada a la deuda. Una reversión podía bajar paidAmount aunque no existiera un movimiento correspondiente, o normalizar un resultado inválido mediante clamp.
- **Esperado:** Revertir una aplicación solo con su movimiento único y exacto, sin caja/deuda parcial ni clamp que esconda inconsistencias.
- **Corrección:** Exigir un movimiento compatible en tenant/empresa/obra/cuenta/moneda/importe/estado y saldo aplicado suficiente; bloquear Company→Account, releer y reclamar por CAS sin efectos parciales.
- **Pruebas / consumidores:** [packages/services/src/ar/ar-integrity.test.ts](<../../../../packages/services/src/ar/ar-integrity.test.ts>); [packages/services/src/ar/ar-audit.live.test.ts](<../../../../packages/services/src/ar/ar-audit.live.test.ts>); [packages/services/src/ap/ap-platform-audit.live.test.ts](<../../../../packages/services/src/ap/ap-platform-audit.live.test.ts>). Su existencia no acredita ejecución; resultados en §6.
- **Situación:** corregido y verificado en AG-09; evidencias y límites en §6.

<a id="ga-ag-09-015"></a>
### GA-AG-09-015 — FX manual en comprobantes y aplicaciones no ARS

- **Tipo / prioridad / origen:** desviación confirmada; **P1**; previo a la base; confirmado durante AG-09. Aliases: `AR-FX-ADVANCE`, `ap-payment-manual-fx`, `FE-fx-consumer`.
- **Fuente / ubicación:** `D-008`; `MULTI_CURRENCY_RULES`; `D-052`. [packages/validators/src/sales-invoice.ts](<../../../../packages/validators/src/sales-invoice.ts>); [packages/validators/src/ap.ts](<../../../../packages/validators/src/ap.ts>); [packages/validators/src/ar-advance.ts](<../../../../packages/validators/src/ar-advance.ts>); [packages/services/src/ar/register-ar-sale.service.ts](<../../../../packages/services/src/ar/register-ar-sale.service.ts>); [packages/services/src/ar/register-ar-income.service.ts](<../../../../packages/services/src/ar/register-ar-income.service.ts>); [packages/services/src/ap/apply-payment-to-payable.ts](<../../../../packages/services/src/ap/apply-payment-to-payable.ts>); [apps/web/features/ap/components/payment-form.tsx](<../../../../apps/web/features/ap/components/payment-form.tsx>); [apps/web/features/sales-invoices/components/advance-invoice-form.tsx](<../../../../apps/web/features/sales-invoices/components/advance-invoice-form.tsx>).
- **Reproducción y observado:** Pagar una deuda USD con cuenta USD o crear un anticipo extranjero sin posibilidad de aportar el FX. Unos caminos fallaban por ausencia de FX y otros podían usar el default 1 de factura extranjera.
- **Esperado:** Un comprobante/pago/cobro extranjero conserva el FX manual y su equivalente ARS, con cuenta/moneda compatibles.
- **Corrección:** Capturar FX de hasta 6 dp en los campos persistidos existentes; exigirlo para moneda extranjera y calcular amountArs. ARS conserva 1. La cuenta debe ser compatible y no hay conversión entre monedas.
- **Pruebas / consumidores:** [packages/services/src/ar/ar-audit.live.test.ts](<../../../../packages/services/src/ar/ar-audit.live.test.ts>); [packages/services/src/ap/ap-platform-audit.test.ts](<../../../../packages/services/src/ap/ap-platform-audit.test.ts>); [packages/services/src/ap/ap-platform-audit.live.test.ts](<../../../../packages/services/src/ap/ap-platform-audit.live.test.ts>); [apps/web/features/finance/lib/financial-interactions.test.ts](<../../../../apps/web/features/finance/lib/financial-interactions.test.ts>). Su existencia no acredita ejecución; resultados en §6.
- **Situación:** corregido y verificado en AG-09; evidencias y límites en §6.

<a id="ga-ag-09-016"></a>
### GA-AG-09-016 — Anticipo argentino sin letra de comprobante

- **Tipo / prioridad / origen:** desviación confirmada; **P1**; previo a la base; confirmado durante AG-09. Aliases: `AR-FX-ADVANCE`.
- **Fuente / ubicación:** `D-084`; `SALES_AND_COLLECTIONS`. [packages/services/src/ar/register-ar-advance.service.ts](<../../../../packages/services/src/ar/register-ar-advance.service.ts>); [packages/services/src/finance/resolve-suggested-invoice-letter.ts](<../../../../packages/services/src/finance/resolve-suggested-invoice-letter.ts>).
- **Reproducción y observado:** Crear un anticipo con empresa o cliente de Argentina. La composición no aportaba invoiceLetter y fallaba el guard obligatorio al emitir.
- **Esperado:** Un anticipo argentino resuelve una letra válida conforme D-084 antes de emitir.
- **Corrección:** Resolver en servidor la sugerencia ya documentada desde datos fiscales y conservar el circuito factura→CxC→cobranza.
- **Pruebas / consumidores:** [packages/services/src/ar/ar-audit.live.test.ts](<../../../../packages/services/src/ar/ar-audit.live.test.ts>). Su existencia no acredita ejecución; resultados en §6.
- **Situación:** corregido y verificado en AG-09; evidencias y límites en §6.

<a id="ga-ag-09-017"></a>
### GA-AG-09-017 — Reintento de la misma operación con datos financieros distintos

- **Tipo / prioridad / origen:** desviación confirmada; **P1**; previo a la base; confirmado durante AG-09. Aliases: `AR-REPLAY`, `ap-composite-policy-and-replay`.
- **Fuente / ubicación:** `D-008`; `D-112`; `D-115`; `API_STRUCTURE`. [packages/services/src/idempotency/idempotency.ts](<../../../../packages/services/src/idempotency/idempotency.ts>); [packages/services/src/ar/register-ar-sale.service.ts](<../../../../packages/services/src/ar/register-ar-sale.service.ts>); [packages/services/src/ar/register-ar-income.service.ts](<../../../../packages/services/src/ar/register-ar-income.service.ts>); [packages/services/src/ap/register-ap-expense.service.ts](<../../../../packages/services/src/ap/register-ap-expense.service.ts>); [packages/services/src/ap/payment.service.ts](<../../../../packages/services/src/ap/payment.service.ts>); [packages/services/src/treasury/collection.service.ts](<../../../../packages/services/src/treasury/collection.service.ts>).
- **Reproducción y observado:** Reusar una clave desde otra empresa, cambiar FX/IIBB/método/referencia/notas o intentar adoptar un pago independiente posterior como hijo de una composición. Los fingerprints y loaders omitían parte del ámbito/dato económico y la heurística temporal podía seleccionar otro cobro/pago.
- **Esperado:** La misma clave devuelve la misma operación solo con ámbito y payload económico/documental compatibles.
- **Corrección:** Validar primero el grafo autorizado; comparar FX, IIBB, override y metadata; usar child idempotencyKey exacta cuando se aporta. Conservar compatibilidad del camino legado sin esa clave.
- **Pruebas / consumidores:** [packages/services/src/idempotency/idempotency.test.ts](<../../../../packages/services/src/idempotency/idempotency.test.ts>); [packages/services/src/ar/ar-audit.live.test.ts](<../../../../packages/services/src/ar/ar-audit.live.test.ts>); [packages/services/src/ap/ap-platform-audit.live.test.ts](<../../../../packages/services/src/ap/ap-platform-audit.live.test.ts>). Su existencia no acredita ejecución; resultados en §6.
- **Situación:** corregido y verificado en AG-09; evidencias y límites en §6.

<a id="ga-ag-09-018"></a>
### GA-AG-09-018 — Replays de líneas empatadas y atributos de costo

- **Tipo / prioridad / origen:** desviación confirmada; **P2**; previo a la base; confirmado durante AG-09. Aliases: `ROOT-REPLAY-LINE-MULTISET`.
- **Fuente / ubicación:** `D-110`; `D-117`; `API_STRUCTURE`. [packages/services/src/idempotency/idempotency.ts](<../../../../packages/services/src/idempotency/idempotency.ts>); [packages/services/src/ap/register-ap-expense.service.ts](<../../../../packages/services/src/ap/register-ap-expense.service.ts>).
- **Reproducción y observado:** Reintentar dos renglones con igual descripción/sortOrder cargados en distinto orden por UUID, o cambiar APU/tipo de costo explícito. La posición física podía producir un conflicto falso; atributos de costo relevantes no se comparaban.
- **Esperado:** Un replay idéntico conserva igualdad aunque cambie el orden físico de líneas empatadas y rechaza atributos explícitos diferentes.
- **Corrección:** Comparar un multiconjunto de huellas canónicas conservando sortOrder, APU exacta y tipo explícito; mantener el snapshot del tipo derivado en servidor cuando el input lo omite.
- **Pruebas / consumidores:** [packages/services/src/idempotency/idempotency.test.ts](<../../../../packages/services/src/idempotency/idempotency.test.ts>). Su existencia no acredita ejecución; resultados en §6.
- **Situación:** corregido y verificado en AG-09; evidencias y límites en §6.

<a id="ga-ag-09-019"></a>
### GA-AG-09-019 — Umbral de gasto calculado antes de percepción IIBB

- **Tipo / prioridad / origen:** desviación confirmada; **P1**; previo a la base; confirmado durante AG-09. Aliases: `ap-composite-policy-and-replay`.
- **Fuente / ubicación:** `BR-APR-005`; `D-112`. [packages/services/src/ap/register-ap-expense.service.ts](<../../../../packages/services/src/ap/register-ap-expense.service.ts>).
- **Reproducción y observado:** Registrar neto 980 con IIBB 3% ante un umbral ARS 1000. El control anterior al impuesto evaluaba 980 aunque el total final era 1009.40.
- **Esperado:** El umbral compara el importe final con impuestos y no persiste una operación rechazada.
- **Corrección:** Evaluar autorización y política sobre el importe final con percepción, dentro de la transacción y sin crear documentos al rechazar.
- **Pruebas / consumidores:** [packages/services/src/ap/ap-platform-audit.live.test.ts](<../../../../packages/services/src/ap/ap-platform-audit.live.test.ts>). Su existencia no acredita ejecución; resultados en §6.
- **Situación:** corregido y verificado en AG-09; evidencias y límites en §6.

<a id="ga-ag-09-020"></a>
### GA-AG-09-020 — Orden común de locks y fondos bajo bloqueo de cuenta

- **Tipo / prioridad / origen:** desviación confirmada; **P1**; previo a la base; confirmado durante AG-09. Aliases: `AR-LOCK-TIMEOUT`, `ap-company-account-order-and-fresh-gates`.
- **Fuente / ubicación:** `BR-TRZ-004`; `D-052`; `D-111`. [packages/services/src/treasury/treasury-write-locks.ts](<../../../../packages/services/src/treasury/treasury-write-locks.ts>); [packages/services/src/treasury/collection.service.ts](<../../../../packages/services/src/treasury/collection.service.ts>); [packages/services/src/ar/register-ar-sale.service.ts](<../../../../packages/services/src/ar/register-ar-sale.service.ts>); [packages/services/src/ar/register-ar-income.service.ts](<../../../../packages/services/src/ar/register-ar-income.service.ts>); [packages/services/src/ap/apply-payment-to-payable.ts](<../../../../packages/services/src/ap/apply-payment-to-payable.ts>); [packages/services/src/treasury/internal-transfer.service.ts](<../../../../packages/services/src/treasury/internal-transfer.service.ts>); [packages/services/src/treasury/register-corporate-treasury-inflow.service.ts](<../../../../packages/services/src/treasury/register-corporate-treasury-inflow.service.ts>); [packages/services/src/treasury/register-manual-treasury-adjustment.service.ts](<../../../../packages/services/src/treasury/register-manual-treasury-adjustment.service.ts>).
- **Reproducción y observado:** Competir una aplicación normal Account→Company con una composición que ya retiene Company→Account; dos empresas pagan desde una cuenta compartida. Se podía interbloquear escritores o comprobar fondos sin la serialización común necesaria.
- **Esperado:** Todos los escritores relacionados usan el mismo orden de locks y los fondos se comprueban con la cuenta bloqueada.
- **Corrección:** Unificar Project→Company→Contact/Account donde corresponde, ordenar IDs de múltiples cuentas y releer la cuenta bloqueada. Las ampliaciones de tesorería se limitan a esta frontera.
- **Pruebas / consumidores:** [packages/services/src/ar/ar-audit.live.test.ts](<../../../../packages/services/src/ar/ar-audit.live.test.ts>); [packages/services/src/ap/ap-platform-audit.test.ts](<../../../../packages/services/src/ap/ap-platform-audit.test.ts>); [packages/services/src/ap/ap-platform-audit.live.test.ts](<../../../../packages/services/src/ap/ap-platform-audit.live.test.ts>). Su existencia no acredita ejecución; resultados en §6.
- **Situación:** corregido y verificado en AG-09; evidencias y límites en §6.

<a id="ga-ag-09-021"></a>
### GA-AG-09-021 — Tesorería deshabilitada y consulta de obligaciones

- **Tipo / prioridad / origen:** desviación confirmada; **P1**; previo a la base; confirmado durante AG-09. Aliases: `FE-treasury-gate`, `ROOT-COLLECTION-TREASURY-GATE`, `ap-company-account-order-and-fresh-gates`.
- **Fuente / ubicación:** `D-056`; `D-111`; `TENANT_MODULES`. [packages/services/src/treasury/collection.service.ts](<../../../../packages/services/src/treasury/collection.service.ts>); [packages/services/src/ar/ar-integrity.ts](<../../../../packages/services/src/ar/ar-integrity.ts>); [packages/services/src/ap/ap-integrity.ts](<../../../../packages/services/src/ap/ap-integrity.ts>); [apps/web/app/(app)/finanzas/cuentas-por-cobrar/[receivableId]/page.tsx](<../../../../apps/web/app/(app)/finanzas/cuentas-por-cobrar/[receivableId]/page.tsx>).
- **Reproducción y observado:** Con AR activo y TREASURY desactivado, enviar una cobranza directamente; consultar una CxC abierta sin Tesorería. El servicio de cobranza no cerraba el gate de caja y la pantalla de consulta podía fallar al cargar las cuentas.
- **Esperado:** Desactivar Tesorería bloquea nuevas mutaciones de caja también en llamadas directas, sin impedir consultar deuda AR/AP.
- **Corrección:** Exigir AR/AP y Tesorería en la mutación y revalidarlos dentro de TX; mantener la consulta de deuda disponible sin cargar cuentas ni ofrecer acciones de caja deshabilitadas.
- **Pruebas / consumidores:** [packages/services/src/ar/ar-integrity.test.ts](<../../../../packages/services/src/ar/ar-integrity.test.ts>); [packages/services/src/ar/ar-audit.live.test.ts](<../../../../packages/services/src/ar/ar-audit.live.test.ts>); [packages/services/src/ap/ap-platform-audit.test.ts](<../../../../packages/services/src/ap/ap-platform-audit.test.ts>); [apps/web/features/finance/lib/financial-interactions.test.ts](<../../../../apps/web/features/finance/lib/financial-interactions.test.ts>). Su existencia no acredita ejecución; resultados en §6.
- **Situación:** corregido y verificado en AG-09; evidencias y límites en §6.

<a id="ga-ag-09-022"></a>
### GA-AG-09-022 — Anulación operativa y asiento contable en una misma transacción

- **Tipo / prioridad / origen:** desviación confirmada; **P1**; previo a la base; confirmado durante AG-09. Aliases: `ar-ap-gl-cancellation-atomicity`.
- **Fuente / ubicación:** `D-061`; `D-063`; `ACCOUNTING`; `STATE_MACHINES`. [packages/services/src/accounting/accounting-cancel-sync.service.ts](<../../../../packages/services/src/accounting/accounting-cancel-sync.service.ts>); [packages/services/src/accounting/journal-entry.service.ts](<../../../../packages/services/src/accounting/journal-entry.service.ts>); [packages/services/src/ar/sales-invoice.service.ts](<../../../../packages/services/src/ar/sales-invoice.service.ts>); [packages/services/src/ar/credit-debit-note.service.ts](<../../../../packages/services/src/ar/credit-debit-note.service.ts>); [packages/services/src/treasury/collection.service.ts](<../../../../packages/services/src/treasury/collection.service.ts>); [packages/services/src/ap/supplier-invoice.service.ts](<../../../../packages/services/src/ap/supplier-invoice.service.ts>); [packages/services/src/ap/payment.service.ts](<../../../../packages/services/src/ap/payment.service.ts>); [packages/services/src/ap/credit-debit-note.service.ts](<../../../../packages/services/src/ap/credit-debit-note.service.ts>).
- **Reproducción y observado:** Contabilizar entre el preflight y la anulación, fallar la auditoría GL durante la reversión o generar un auto-DRAFT atrasado tras cancelar la fuente. El guard fuera de TX y la limpieza DRAFT posterior al commit dejaban una ventana con documento/caja cancelado y asiento posteable o POSTED.
- **Esperado:** Fuente operativa y GL se cancelan/auditan atómicamente; no se postea ni nace un DRAFT operativo tardío sobre fuente cancelada.
- **Corrección:** Componer guard, cancelación DRAFT y auditoría en la TX operativa bajo Company. Crear/postear asientos AR/AP revalida estado de la fuente, líneas, fecha y revisión. Conservar los orígenes correctos de ND.
- **Pruebas / consumidores:** [packages/services/src/accounting/accounting-ar-ap-cancel-atomic.test.ts](<../../../../packages/services/src/accounting/accounting-ar-ap-cancel-atomic.test.ts>); [packages/services/src/ar/ar-audit.live.test.ts](<../../../../packages/services/src/ar/ar-audit.live.test.ts>); [packages/services/src/ap/ap-platform-audit.live.test.ts](<../../../../packages/services/src/ap/ap-platform-audit.live.test.ts>). Su existencia no acredita ejecución; resultados en §6.
- **Situación:** corregido y verificado en AG-09; evidencias y límites en §6.

<a id="ga-ag-09-023"></a>
### GA-AG-09-023 — Transacciones financieras con tiempo implícito insuficiente

- **Tipo / prioridad / origen:** desviación confirmada; **P1**; timeout implícito previo; reproducción y ampliación de trabajo transaccional durante el diff AG-09. Aliases: `AR-LOCK-TIMEOUT`, `ap-bounded-financial-transactions`.
- **Fuente / ubicación:** `D-061`; `SERVICE_LAYER`. [packages/services/src/ar/credit-debit-note.service.ts](<../../../../packages/services/src/ar/credit-debit-note.service.ts>); [packages/services/src/ar/sales-invoice.service.ts](<../../../../packages/services/src/ar/sales-invoice.service.ts>); [packages/services/src/treasury/collection.service.ts](<../../../../packages/services/src/treasury/collection.service.ts>); [packages/services/src/ap/payment.service.ts](<../../../../packages/services/src/ap/payment.service.ts>); [packages/services/src/ap/credit-debit-note.service.ts](<../../../../packages/services/src/ap/credit-debit-note.service.ts>); [packages/services/src/ap/supplier-invoice.service.ts](<../../../../packages/services/src/ap/supplier-invoice.service.ts>); [packages/services/src/ap/payable.service.ts](<../../../../packages/services/src/ap/payable.service.ts>); [packages/services/src/accounting/journal-entry.service.ts](<../../../../packages/services/src/accounting/journal-entry.service.ts>).
- **Reproducción y observado:** Ejecutar en SQL aislado las nuevas comprobaciones de grafo y auditoría junto con emisión/reversión. Transacciones con timeout implícito de 5 s expiraban; se observó P2028/Transaction not found antes de completar efectos.
- **Esperado:** La transacción financiera puede completar las comprobaciones acotadas dentro de su límite explícito y falla sin efectos parciales.
- **Corrección:** Usar maxWait 10 s y timeout 30 s en los caminos financieros afectados; no modificar un ajuste global ni ocultar el fallo como una prueba aprobada.
- **Pruebas / consumidores:** `sql-ar-first.log`; `sql-ap-first.log`; [packages/services/src/ar/ar-audit.live.test.ts](<../../../../packages/services/src/ar/ar-audit.live.test.ts>); [packages/services/src/ap/ap-platform-audit.live.test.ts](<../../../../packages/services/src/ap/ap-platform-audit.live.test.ts>). Su existencia no acredita ejecución; resultados en §6.
- **Situación:** corregido y verificado en AG-09; evidencias y límites en §6.

<a id="ga-ag-09-024"></a>
### GA-AG-09-024 — Formularios con doble envío o respuesta de transporte incierta

- **Tipo / prioridad / origen:** desviación confirmada; **P2**; previo a la base; confirmado durante AG-09. Aliases: `FE-uncertain-action`, `FE-issue-feedback`.
- **Fuente / ubicación:** `PLATFORM_AUDIT_RUNBOOK §6`; `Patrón AG-08 useOperationalAction`. [apps/web/hooks/use-operational-action.ts](<../../../../apps/web/hooks/use-operational-action.ts>); [apps/web/features/sales-invoices/components/manual-invoice-form.tsx](<../../../../apps/web/features/sales-invoices/components/manual-invoice-form.tsx>); [apps/web/features/ap/components/supplier-invoice-form.tsx](<../../../../apps/web/features/ap/components/supplier-invoice-form.tsx>); [apps/web/features/collections/components/collection-form.tsx](<../../../../apps/web/features/collections/components/collection-form.tsx>); [apps/web/features/finance/components/new-transaction-dialog.tsx](<../../../../apps/web/features/finance/components/new-transaction-dialog.tsx>); [apps/web/features/finance/components/create-fiscal-note-dialog.tsx](<../../../../apps/web/features/finance/components/create-fiscal-note-dialog.tsx>).
- **Reproducción y observado:** Enviar dos veces antes del próximo render, cerrar un diálogo mientras guarda o perder la respuesta de una Action. Faltaba mutex inmediato/catch y podían desmontarse inputs durante una mutación; botones de emitir no mostraban confirmación/pending recuperable.
- **Esperado:** El usuario recibe pending/error/éxito coherentes y no puede duplicar ni desmontar accidentalmente una operación en curso.
- **Corrección:** Reutilizar el hook y confirmaciones existentes, bloquear controles/cierre durante pending, conservar inputs y claves en incertidumbre y mostrar el efecto de emitir.
- **Pruebas / consumidores:** [apps/web/features/finance/lib/financial-interactions.test.ts](<../../../../apps/web/features/finance/lib/financial-interactions.test.ts>); [apps/web/features/finance/lib/financial-actions.test.ts](<../../../../apps/web/features/finance/lib/financial-actions.test.ts>). Su existencia no acredita ejecución; resultados en §6.
- **Situación:** corregido y verificado en AG-09; evidencias y límites en §6.

<a id="ga-ag-09-025"></a>
### GA-AG-09-025 — Adjunto fallido después de crear la factura

- **Tipo / prioridad / origen:** desviación confirmada; **P2**; previo a la base; confirmado durante AG-09. Aliases: `FE-upload-postcommit`.
- **Fuente / ubicación:** `D-052`; `PLATFORM_AUDIT_RUNBOOK §6`. [apps/web/features/sales-invoices/components/manual-invoice-form.tsx](<../../../../apps/web/features/sales-invoices/components/manual-invoice-form.tsx>); [apps/web/features/ap/components/supplier-invoice-form.tsx](<../../../../apps/web/features/ap/components/supplier-invoice-form.tsx>); [apps/web/features/finance/components/new-transaction-dialog.tsx](<../../../../apps/web/features/finance/components/new-transaction-dialog.tsx>).
- **Reproducción y observado:** Crear una factura correctamente y fallar el transporte del upload posterior. El error genérico retenía el formulario de alta y podía invitar a crear otra factura.
- **Esperado:** Un fallo de adjunto posterior no se presenta como fallo de la factura ya creada.
- **Corrección:** Mostrar advertencia específica del adjunto y navegar al documento ya creado para recuperarlo; no simular fallo de la factura ni repetirla.
- **Pruebas / consumidores:** `Inspección estática del contrato create-then-upload; proveedores externos no ejecutados`. Su existencia no acredita ejecución; resultados en §6.
- **Situación:** corregido y verificado en AG-09; evidencias y límites en §6.

<a id="ga-ag-09-026"></a>
### GA-AG-09-026 — Invalidación del recorrido financiero después de mutar

- **Tipo / prioridad / origen:** desviación confirmada; **P2**; previo a la base; confirmado durante AG-09. Aliases: `FE-invalidation`.
- **Fuente / ubicación:** `PLATFORM_AUDIT_RUNBOOK §6`; `D-115`. [apps/web/lib/revalidate-project-paths.ts](<../../../../apps/web/lib/revalidate-project-paths.ts>); [apps/web/app/(app)/proyectos/[id]/cobranzas/actions.ts](<../../../../apps/web/app/(app)/proyectos/[id]/cobranzas/actions.ts>); [apps/web/app/(app)/proyectos/[id]/cuentas-por-pagar/actions.ts](<../../../../apps/web/app/(app)/proyectos/[id]/cuentas-por-pagar/actions.ts>); [apps/web/app/(app)/finanzas/cuentas-por-cobrar/actions.ts](<../../../../apps/web/app/(app)/finanzas/cuentas-por-cobrar/actions.ts>).
- **Reproducción y observado:** Cobrar, pagar, emitir una nota o anular y volver a factura/CxC/CxP/certificado/subcontrato/OC relacionado sin recargar manualmente. Algunas Actions invalidaban solo listados o resúmenes; el detalle derivado podía conservar datos viejos.
- **Esperado:** Los consumidores del mismo recorrido se actualizan tras la mutación sin una nueva lectura financiera después del commit.
- **Corrección:** Invalidar descendientes del proyecto autorizado y layouts financieros/tesorería/contabilidad/reportes después del éxito, sin lecturas financieras de descubrimiento posteriores al commit.
- **Pruebas / consumidores:** [apps/web/features/finance/lib/financial-actions.test.ts](<../../../../apps/web/features/finance/lib/financial-actions.test.ts>); [apps/web/lib/certification-ar-invalidation.test.ts](<../../../../apps/web/lib/certification-ar-invalidation.test.ts>). Su existencia no acredita ejecución; resultados en §6.
- **Situación:** corregido y verificado en AG-09; evidencias y límites en §6.

<a id="ga-ag-09-027"></a>
### GA-AG-09-027 — Estado saldado, crédito aplicado y caja anulada en pantalla

- **Tipo / prioridad / origen:** desviación confirmada; **P2**; previo a la base; confirmado durante AG-09. Aliases: `FE-settlement-vs-cash`, `FE-cancelled-note-narrative`.
- **Fuente / ubicación:** `D-115`; `STATE_MACHINES`. [apps/web/features/finance/components/related-fiscal-notes-panel.tsx](<../../../../apps/web/features/finance/components/related-fiscal-notes-panel.tsx>); [apps/web/features/collections](<../../../../apps/web/features/collections>); [apps/web/features/ap](<../../../../apps/web/features/ap>); [apps/web/app/(app)/finanzas/cuentas-por-cobrar/[receivableId]/page.tsx](<../../../../apps/web/app/(app)/finanzas/cuentas-por-cobrar/[receivableId]/page.tsx>).
- **Reproducción y observado:** Saldar una obligación solo con NC o consultar su historial después de anular un cobro/pago/nota. Pagada/Cobrada podía afirmar caja inexistente; movimientos anulados parecían vigentes y toda NC no borrador podía describirse como aplicada.
- **Esperado:** Saldada no afirma ingreso/egreso de caja; anulados y créditos se distinguen del movimiento confirmado.
- **Corrección:** Usar Saldada/Saldadas para la deuda, separar crédito de caja y mostrar el estado real de notas y movimientos. Conectar la cancelación corporativa existente de cobranza con motivo.
- **Pruebas / consumidores:** [apps/web/features/finance/lib/financial-interactions.test.ts](<../../../../apps/web/features/finance/lib/financial-interactions.test.ts>); [apps/web/features/finance/lib/financial-actions.test.ts](<../../../../apps/web/features/finance/lib/financial-actions.test.ts>). Su existencia no acredita ejecución; resultados en §6.
- **Situación:** corregido y verificado en AG-09; evidencias y límites en §6.

<a id="ga-ag-09-028"></a>
### GA-AG-09-028 — Identidad documental, datos no disponibles y alcance de filtros

- **Tipo / prioridad / origen:** desviación confirmada; **P2**; previo a la base; confirmado durante AG-09. Aliases: `FE-source-projections`.
- **Fuente / ubicación:** `D-102`; `D-115`; `PLATFORM_AUDIT_RUNBOOK §6`. [apps/web/app/(app)/proyectos/[id]/cuentas-por-cobrar/page.tsx](<../../../../apps/web/app/(app)/proyectos/[id]/cuentas-por-cobrar/page.tsx>); [apps/web/app/(app)/proyectos/[id]/cuentas-por-pagar/page.tsx](<../../../../apps/web/app/(app)/proyectos/[id]/cuentas-por-pagar/page.tsx>); [apps/web/features/aging/components/aging-filters.tsx](<../../../../apps/web/features/aging/components/aging-filters.tsx>); [packages/services/src/ap/payable.service.ts](<../../../../packages/services/src/ap/payable.service.ts>).
- **Reproducción y observado:** Ver NC/ND recientes, el vínculo de factura AP, un fallo de lectura relacionada o filtrar el bloque de aging. Se perdía documentKind/código de factura, un fallo se presentaba como lista vacía y los filtros parecían afectar otros bloques.
- **Esperado:** Identidad, estado de disponibilidad y alcance de filtros se describen según los datos y consultas reales.
- **Corrección:** Mapear identidad y código, distinguir indisponibilidad de vacío, delimitar Antigüedad de saldos y mantener el alcance de listas documentales; limpiar filtros reinicia su paginación.
- **Pruebas / consumidores:** [apps/web/features/finance/lib/financial-interactions.test.ts](<../../../../apps/web/features/finance/lib/financial-interactions.test.ts>); `Tipos web y regresión general`. Su existencia no acredita ejecución; resultados en §6.
- **Situación:** corregido y verificado en AG-09; evidencias y límites en §6.

<a id="ga-ag-09-029"></a>
### GA-AG-09-029 — IVA y percepción negativos en nuevos efectos de factura

- **Tipo / prioridad / origen:** brecha con decisión financiera aprobada; **P1**; brecha de contrato previa; definición financiera aprobada expresamente durante AG-09. Aliases: `ap-nonnegative-tax-d133`, `ROOT-D133`.
- **Fuente / ubicación:** `D-133`; `Q-080 aprobada`; `BR-TAX-002`; `BR-TAX-003`; `D-115`. [packages/validators/src/money.ts](<../../../../packages/validators/src/money.ts>); [packages/validators/src/sales-invoice.ts](<../../../../packages/validators/src/sales-invoice.ts>); [packages/validators/src/ap.ts](<../../../../packages/validators/src/ap.ts>); [packages/services/src/finance/invoice-tax-guards.ts](<../../../../packages/services/src/finance/invoice-tax-guards.ts>); [packages/services/src/ar/sales-invoice.service.ts](<../../../../packages/services/src/ar/sales-invoice.service.ts>); [packages/services/src/ar/credit-debit-note.service.ts](<../../../../packages/services/src/ar/credit-debit-note.service.ts>); [packages/services/src/ap/supplier-invoice.service.ts](<../../../../packages/services/src/ap/supplier-invoice.service.ts>); [packages/services/src/ap/credit-debit-note.service.ts](<../../../../packages/services/src/ap/credit-debit-note.service.ts>).
- **Reproducción y observado:** Enviar IVA o percepción negativos, o emitir un borrador legado que los conserva. Los contratos podían reducir el total mediante un impuesto negativo; la semántica no estaba expresada con precisión suficiente para decidir sin Owner. La revisión final detectó además que recalcular la cabecera antes del guard podía reemplazar un componente monetario legado negativo con tasas positivas.
- **Esperado:** D-133 aplica signo no negativo en nuevas operaciones/emisiones sin un máximo nuevo ni alteración de históricos emitidos.
- **Corrección:** Implementar D-133 aprobada: IVA/percepción y ajuste explícito no negativos, cero permitido y sin máximo nuevo; validar altas/ediciones/emisión de borradores y notas. No reescribir emitidos históricos ni copiar su impuesto negativo a un nuevo documento. Se agrega la validación previa al recálculo y se conserva la posterior; el borrador debe corregirse explícitamente antes de emitir.
- **Pruebas / consumidores:** [packages/validators/src/invoice-tax-inputs.test.ts](<../../../../packages/validators/src/invoice-tax-inputs.test.ts>); [packages/services/src/finance/invoice-tax-guards.test.ts](<../../../../packages/services/src/finance/invoice-tax-guards.test.ts>); [packages/services/src/ar/ar-audit.live.test.ts](<../../../../packages/services/src/ar/ar-audit.live.test.ts>); [packages/services/src/ap/ap-platform-audit.live.test.ts](<../../../../packages/services/src/ap/ap-platform-audit.live.test.ts>). Su existencia no acredita ejecución; resultados en §6.
- **Situación:** corregido y verificado en AG-09; evidencias y límites en §6.

<a id="ga-ag-09-030"></a>
### GA-AG-09-030 — Regresión local de cancelación NC fuera de obra ACTIVE

- **Tipo / prioridad / origen:** desviación confirmada; **P1**; introducido por el diff AG-09, detectado por revisión independiente y restaurado antes de cierre. Aliases: `NC-PROJECT-POLICY-RESTORATION`.
- **Fuente / ubicación:** `D-042 §5`; `BR-PROJ-003`; `D-115`. [packages/services/src/ar/credit-debit-note.service.ts](<../../../../packages/services/src/ar/credit-debit-note.service.ts>); [packages/services/src/ap/credit-debit-note.service.ts](<../../../../packages/services/src/ap/credit-debit-note.service.ts>); [packages/services/src/finance/project-lifecycle-interleaving.test.ts](<../../../../packages/services/src/finance/project-lifecycle-interleaving.test.ts>).
- **Reproducción y observado:** Comparar base 4f5b672e con el cambio intermedio y anular una NC en DRAFT/ON_HOLD/COMPLETED/CANCELLED de proyecto. El diff había extendido por analogía la reversión neutral de factura/pago/cobranza a NC; la política previa exigía ACTIVE. La adaptación intermedia de 53 tests no acreditaba esa excepción.
- **Esperado:** NC conserva la exigencia ACTIVE original en preflight y TX; no se extiende una excepción por analogía.
- **Corrección:** Restaurar guard ACTIVE en preflight y TX para NC AR/AP, conservar ACL/CAS/motivos/GL y devolver los casos a su expectativa original. Las otras reversiones mantienen solo su comportamiento previo.
- **Pruebas / consumidores:** [packages/services/src/finance/project-lifecycle-interleaving.test.ts](<../../../../packages/services/src/finance/project-lifecycle-interleaving.test.ts>); `output/platform-audit/ag-09-2026-11-05/nc-project-policy-restoration.json`. Su existencia no acredita ejecución; resultados en §6.
- **Situación:** corregido y verificado en AG-09; evidencias y límites en §6.

## 5. Cambios aplicados e impacto

Las correcciones están descritas por ID. Se mantienen locales: no se declara publicación AG-09.

- **Servicios/datos:** ámbito/grafos, contratos/calendario, D-053/D-115, FX existente, series/CAS, replay, umbral final y composición TX con GL.
- **UI/Actions:** edición 4 dp, DTO/RSC, confirmación/motivo, pending/mutex/cierre, recuperación de adjunto, invalidación y rotulación. Reutiliza tokens/componentes AG-08, sin rediseño global.
- **Guide/Ayuda:** [Guía §12](../../GUIA_OPERATIVA_BLOQER_V2.md) y [apps/web/features/help/lib/articles/finance.ts](<../../../../apps/web/features/help/lib/articles/finance.ts>). Saldada no implica caja; motivo, FX manual, alcance de aging y consulta sin Tesorería.
- **Docs funcionales:** factura≠deuda, INFLOW/OUTFLOW, una obligación por aplicación actual, anticipo con factura, misma moneda, subcert aprobada→factura DRAFT→CxP al emitir y rutas de pago reales. Se conservan los apartados `## Hallazgo`.
- **AI:** totals nullable/byCurrency; índice **583 chunks**, check con código 0; seis pruebas de recuperación incluidas en general y cinco evals preparados, sin modelo externo o nueva escritura AI.
- **D-133:** signo no negativo/cero permitido, sin máximo nuevo o reescritura de emitidos. El guard se debe aplicar antes y después del recálculo para que un componente legado negativo no se normalice implícitamente.

GA-AG-09-030 registra una regresión de esta auditoría restaurada antes del cierre: NC conserva ACTIVE. No hubo aprobación de una excepción nueva y la selección intermedia de 53 casos queda superada por 61.

## 6. Verificación observada

### Verificaciones generales aprobadas

- **General:** `pnpm run test --force --concurrency=2`: **2.650/2.650**, cero fallos, tras D-133 y paginación. `output/platform-audit/ag-09-2026-11-05/workspace-test-source-final.log`, resultado y resumen. La corrida anterior de 2.647 queda como antecedente.
- **Tipos:** `pnpm run typecheck --force --concurrency=2`: **13/13** tareas. `workspace-types-source-final.result.json`. Se repitió el paquete web después del último delta de paginación: código 0.
- **Lint:** `pnpm run lint`, código 0, incluido el delta de tres páginas. `workspace-lint-source-final.result.json`, `web-pagination-lint-final.result.json` y `web-presentation-lint-final.result.json`.
- **Knowledge:** 583 fragmentos; índice vigente comprobado. Se repitieron las **51 pruebas AI** después de regenerar por el último ajuste de SALES_AND_COLLECTIONS, incluidas seis de recuperación. Son parte de la cobertura general. Cinco evals preparados no equivalen a una ejecución con modelo.
- **Política NC:** **61/61** focales, incluidos ocho negativos de preflight. `output/platform-audit/ag-09-2026-11-05/nc-project-policy-restoration.json`. Mantiene Project antes de efectos y ACTIVE para NC.

La corrida general incluye la adenda de D-133 y la validación de entradas de paginación. Después se verificaron por separado las tres páginas que unifican la página validada, el ajuste de presentación y el índice de conocimiento vigente.

### SQL aislado por intento

- `sql-ar-first`: **6/14 aprobados**, 8 fallidos. Cinco colisiones de nombre de cuenta del fixture y tres P2028 de TX5s; corregidos y repetidos. Evidencia: `output/platform-audit/ag-09-2026-11-05/sql-ar-first.log`.

- `sql-ar-second`: **13/14 aprobados**, 1 fallidos. El caso NC0.06 produjo50.00; hallazgo canónico0.025→25. Validator compartido corregido, expectativa financiera conservada. Evidencia: `output/platform-audit/ag-09-2026-11-05/sql-ar-second.log`.

- `sql-ar-consumers-first`: **7/7 aprobados**, 0 fallidos. La fuente actual agregó un octavo caso de tool AI después de esta corrida. Evidencia: `output/platform-audit/ag-09-2026-11-05/sql-ar-consumers-first.log`.

- `sql-ar-third`: **23/23 aprobados**, 0 fallidos. El cambio posterior de NC restauró ACTIVE; se verificó aparte con 61 casos focales, regresión AG-08 y los casos finales de D-133. Evidencia: `output/platform-audit/ag-09-2026-11-05/sql-ar-third.log`.

- `sql-ap-first`: **12/15 aprobados**, 3 fallidos. Expiración de TX5s en pago/NC/auto-DRAFT tardío; timeout por camino corregido; pruebas de carrera reforzadas para no aceptar ambos rechazos como éxito. Evidencia: `output/platform-audit/ag-09-2026-11-05/sql-ap-first.log`.

- `sql-ap-second`: **16/16 aprobados**, 0 fallidos.  Evidencia: `output/platform-audit/ag-09-2026-11-05/sql-ap-second.log`.

- `sql-ar-consumers-final`: **8/8 aprobados**, 0 fallidos.  Evidencia: `output/platform-audit/ag-09-2026-11-05/sql-ar-consumers-final.log`.

- **Regresión AG-08:** conexiones **17/17** aprobadas. Selección de liquidación/NC/ND/pagos de subcontratos **9/9** aprobada; 31 casos del archivo quedaron fuera del patrón. El ejecutor reportó 0 skips entre los seleccionados.

- **D-133 antes del recálculo:** **1/1 AR y 1/1 AP** aprobados. Cada caso cubre seis combinaciones, preserva borrador, importe, auditoría y obligación al rechazar y comprueba emisión tras corregir explícitamente. `sql-ar-d133-header-final.log` y `sql-ap-d133-header-final.log`.

**49 casos distintos de AG-09 aprobados:** 24 AR, 17 AP y 8 consumidores. Aparte, 26 regresiones AG-08 aprobadas (17 conexiones + 9 subcontratos), **75 casos SQL distintos en total**. No se suman intentos ni se duplica el caso renombrado de polvo subcentavo.

### Intentos fallidos conservados

- `output/platform-audit/ag-09-2026-11-05/workspace-test-first.log`: Diez fallos del test heredado de lifecycle: fixtures insuficientes y regresión de política NC. No todos son configuración; NC está registrada como regresión introducida. **Resolución:** Fixtures completados conservando checkpoints y guardACTIVE restaurado;61casos focales y general final aprobados.

- `output/platform-audit/ag-09-2026-11-05/workspace-lint-first.log`: Dos argumentos_ctx sin uso tras convertir reconciliación en lectura pura. **Resolución:** Eliminados wrappers identidad; tipos, general y lint final repetidos con exit0.

- `output/platform-audit/ag-09-2026-11-05/root-decimal-replay-third.log`: Un test heredado de inventario esperaba agrupación localizada para un string de API canónico. **Resolución:** Caso ajustado al contrato API y agrupación explícita conservada; prueba independiente32/32 y general final.

- `output/platform-audit/ag-09-2026-11-05/root-tax-notifications-first.log`: MockTracker.method no encuentra los métodos dinámicos del proxy Prisma en dos nuevas pruebas de email. **Resolución:** Fixture de stub local restaurable, sin cambiar el contrato financiero; repetición7/7 y general final.

### Omitidas, no ejecutadas y muestra visual

El general omitió **39 suites live opt-in**. Solo las selecciones SQL aisladas con guard y resultado se cuentan como ejecutadas. Las selecciones parciales de implementadores/revisor se superponen con el general y no se suman a 2.650.

No se ejecutaron pruebas mutantes del portal, envíos/adjuntos reales, proveedores AI, reconciliación total de históricos, carga o auditoría íntegra AG-10.

**Compilación:** aprobada con proveedores desactivados y sin migraciones. Los **139 archivos** del manifiesto coinciden con el código compilado. Evidencia: `output/platform-audit/ag-09-2026-11-05/workspace-build-presentation-final.result.json` y `output/platform-audit/ag-09-2026-11-05/build-source-match-final.json`.

**Muestra visual:** Con un Owner sintético se anuló un cobro USD con motivo obligatorio, se verificó saldo reabierto por US$ 10,00, antigüedad separada ARS/USD y página 1 para una URL fuera de rango. En teléfono se registró el cobro con FX 1260.123456 y la cuenta quedó Saldada. En escritorio se guardó una Factura C con cantidad 1,2345 y precio 3,3333 al editar; el servidor guardó ARS 4,23. Emitir creó la CxP y pagar confirmó ARS 4,23 con saldo final cero. Esas operaciones se probaron en freeze 04. En freeze 05 se confirmaron fecha de corte dd/mm/aaaa, columna Cantidad, Exportar antigüedad y paginación, sin repetir operaciones sobre la misma deuda. Escritorio 1280×720 y teléfono 390×844, temas claro y oscuro; sin desborde horizontal en las capturas. Sesión, dos pestañas y ambos servidores de prueba cerrados. Evidencia: `output/platform-audit/ag-09-2026-11-05/visual-checks.json` y `output/platform-audit/ag-09-2026-11-05/screenshots/`. No equivale a cobertura de todos los permisos, dispositivos o transiciones.

## 7. Revisión independiente

`/root/ag09_verify` contrastó diff/base y fuentes sin editar archivos ni ejecutar SQL. Pasada inicial: **144 casos** de servicios/web/RSC aprobados; focal decimal: **32/32**, nueve suites. Son selecciones parciales superpuestas con general.

Confirmó parser de tres decimales, gate Tesorería, cash leg incompleto, lectura AR que escribía históricos, replay empatado, snapshot sin padres y política NC extendida sin autorización. Las dos llamadas antiguas sin motivo revisadas anulaban borradores y no eran regresiones.

La ampliación neutral de NC se restauró. La revisión comprobó también la adenda D-133 y la corrección para que consulta y controles usen la misma página. La muestra visual detectó rótulos en inglés y fechas ISO de corte. Se corrigieron y revisaron los ocho archivos fuente del delta final; las nueve pruebas existentes de fechas pasaron. El manifiesto final (freeze 05) coincide en los **139 archivos**, sin desviaciones confirmadas pendientes. Evidencia: `output/platform-audit/ag-09-2026-11-05/independent-freeze05-review.json`; las selecciones dirigidas se superponen con la corrida general.

## 8. Estado y continuación

**AG-09 cerrada localmente.** Los 30 grupos quedaron corregidos y verificados; no se publicó AG-09 ni se inició AG-10. La siguiente fase requiere indicación del Owner.

P-AG10-01 conserva el diseño de FX físico de movimientos manuales. Históricos fiscales emitidos se conservan y no se introduce un override para copiar impuestos negativos a una nota.

### Revalidación selectiva reutilizable

- **Ámbito/gates/grafos:** grupos 1/2/21/30; negativos tenant/empresa/obra, entradas directas/Actions, aging/CSV/AI afectados y actor autorizado.
- **Dinero/FX/impuestos/replay:** grupos 5/6/8/9/10/15/17/18/19/29; validators/helpers y SQL AR/AP/consumers afectados, caja/crédito separados.
- **GL/cancelación:** grupos 12/13/14/20/22/23/30; rollback de auditoría, posting concurrente, auto-DRAFT tardío y replay.
- **UI/Actions:** grupos 7/24/25/26/27/28; interacción/RSC/invalidación y visual si cambia comportamiento visible. No activar DB/proveedores por un cambio cosmético sin dependencia.
- Conservar IDs, indicar nueva base/revisión y actualizar Guide/Ayuda/AI cuando cambie significado; repetir lo afectado o invalidado.

Handoffs: `output/platform-audit/ag-09-2026-11-05/ar-handoff.json`; `output/platform-audit/ag-09-2026-11-05/ap-result.json`; `output/platform-audit/ag-09-2026-11-05/frontend-review.json`; `output/platform-audit/ag-09-2026-11-05/docs-ai-handoff.json`; `output/platform-audit/ag-09-2026-11-05/nc-project-policy-restoration.json`; `output/platform-audit/ag-09-2026-11-05/cancellation-reason-consumers-review.json`. El consolidado final de §6 prevalece sobre contadores/límites/estados anteriores de cada agente.
