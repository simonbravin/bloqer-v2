# Architecture Decision Records (ADR) — Bloqer 2.0

## Decisión

Mantener **ADRs** en esta carpeta como registro de **decisiones técnicas** (cómo construimos) separadas del [`../00-product/DECISION_LOG.md`](../00-product/DECISION_LOG.md) (qué hace el producto). Formato corto: **contexto → decisión → consecuencias → estado**.

## Justificación para Bloqer 2.0

- El dominio ya tiene decisiones funcionales lockeadas; faltaba anclar **stack y patrones** sin mezclar ambos mundos.
- ADRs evitan debates eternos y documentan **por qué** se scinde un paquete o se elige un proveedor.

## Problemas que evita

- **Conocimiento tribal** (“siempre fue así”) sin registro.
- Confundir **D-xxx** de producto con **ADR-xxx** de ingeniería.

## Qué NO hacer

- No duplicar en ADRs las reglas de [`../01-domain/BUSINESS_RULES.md`](../01-domain/BUSINESS_RULES.md); citarlas si afectan la forma técnica.
- No escribir ADRs **por cada PR**; solo decisiones que **cambian arquitectura** o son **irreversibles sin costo**.

---

## Índice de ADRs (plantilla inicial)

> Los IDs `ADR-001`… son **técnicos**. Se numeran al crearse el primer ADR real en repo.

| ID | Título | Estado |
|---|---|---|
| ADR-001 | Modular monolith en Vercel + Next.js App Router | PROPUESTO |
| ADR-002 | PostgreSQL Neon + Prisma como acceso principal | PROPUESTO |
| ADR-003 | Auth.js como primera opción de autenticación | PROPUESTO |
| ADR-004 | Blobs en Cloudflare R2 con metadatos en Postgres | PROPUESTO |
| ADR-005 | Email transaccional Resend + React Email | PROPUESTO |
| ADR-006 | pnpm workspaces; Turborepo si ≥2 paquetes compilables | PROPUESTO |
| ADR-007 | Gantt y cronograma detrás de adapter único (Kibo UI) | ACEPTADO |
| ADR-008 | Modelo físico: `tenant` + `company` 1:N (legal entity = `company`) con `project.company_id` opcional hasta multi-empresa activa | PROPUESTO |
| ADR-009 | UUID PK en todas las entidades ERP; numeración humana en columnas separadas | PROPUESTO |
| ADR-Phase1-06 | Membresía única `(userId, tenantId)` Phase 1 | ACEPTADO |
| ADR-Phase1-07 | Ingresos corporativos sin obra: GL + tesorería Phase 1 | ACEPTADO |
| ADR-010 | Reporting read-layer: agregación on-read sin tablas duplicadas de montos | ACEPTADO |
| ADR-011 | `fx_rate` + `amount_ars` en comprobantes financieros (D-008) | ACEPTADO |
| ADR-012 | Transacciones UX: modelo documental + guards de integridad | ACEPTADO |
| ADR-013 | Anticipos a proveedor: cuenta puente Fase 2 | ACEPTADO |

---

## ADR-010 — Reporting read-layer (baseline vs ejecución)

- **Fecha:** 2026-05-28
- **Estado:** ACEPTADO
- **Contexto:** Hub de reportes por proyecto (presupuesto vs real, certificaciones, compras, subcontratos, caja) debe reconciliar con [`COST_FORMULAS.md`](../04-formulas/COST_FORMULAS.md) y el ERD Prisma sin introducir silos de KPIs ni auto-crear subcontratos al aprobar presupuesto.
- **Decisión:**
  - **Baseline** = `Budget` `APPROVED`/`CLOSED` + `WbsNode` + `CostItem` + `CostAnalysisLine` (APU por categoría MAT/LAB/EQP/SUB).
  - **Ejecución** = documentos operativos (`PurchaseOrder`, `SupplierInvoice`, `Payable`, `Payment`, `Subcontract`, `SubcontractCertification`, `Certification`, `SalesInvoice`, `Receivable`, `Collection`, `AccountMovement`).
  - Servicios en `packages/services/src/reports/` **solo lectura**; export CSV/JSON reutiliza los mismos servicios que la UI.
  - Derivados (`payment_status`, varianzas, aging): **on-read** salvo ADR futuro explícito para MV/snapshot versionado.
  - Línea APU `SUBCONTRACT` **no** genera `Subcontract` al aprobar presupuesto; el contrato se registra al contratar.
- **Consecuencias:** consultas más pesadas aceptables en Fase 1; checklist y tablas fuente en [`REPORTING_ERD_GUARDRAILS.md`](./REPORTING_ERD_GUARDRAILS.md); catálogo ampliado en [`REPORT_CATALOG.md`](../06-reports/REPORT_CATALOG.md).
- **Referencias funcionales:** [`REPORTING_ARCHITECTURE.md`](./REPORTING_ARCHITECTURE.md), [`02-modules/SUBCONTRACTS.md`](../02-modules/SUBCONTRACTS.md), [`02-modules/WBS_AND_COST_ITEMS.md`](../02-modules/WBS_AND_COST_ITEMS.md).

---

## ADR-011 — FX manual y `amount_ars` en comprobantes (D-008)

- **Fecha:** 2026-05-28
- **Estado:** ACEPTADO
- **Contexto:** [`MULTI_CURRENCY_RULES.md`](../03-finance/MULTI_CURRENCY_RULES.md) y [D-008](../00-product/DECISION_LOG.md) exigen `fx_rate` y `amount_ars` persistidos; el schema operativo no los tenía.
- **Decisión:** columnas `fxRate` + `amountArs` en `SalesInvoice`, `SupplierInvoice`, `Payment`, `Collection`; cálculo en emisión/confirmación vía `resolveFxAmounts` (`@bloqer/utils`); reportes con `currency_view=ARS` suman `amountArs` cuando el FX está cargado.
- **Consecuencias:** migración `20260528120000_fx_amount_ars`; sin proveedor FX externo ni diferencia de cambio automática (Q-025).

---

## ADR-012 — Transacciones UX: modelo documental + guards de integridad (Fase 0)

- **Fecha:** 2026-05-29
- **Estado:** ACEPTADO
- **Contexto:** Plan unificado Finanzas → Transacciones sobre el modelo v2 existente (`SalesInvoice`, `SupplierInvoice`, `Receivable`, `Payable`, `Collection`, `Payment`, `AccountMovement`, `JournalEntry`). Revisión de código detectó huecos de cancelación y lost-update en cobros/pagos concurrentes. El schema documenta que `AccountMovement.projectId` no debe duplicar la verdad de la fuente ([`schema.prisma`](../../../packages/database/prisma/schema.prisma) ~L1473).
- **Decisión:**
  - **No** crear entidad genérica `Transaction` en Prisma; la UX de Transacciones es capa de lectura/composición sobre documentos tipados.
  - **Cancel guards simétricos:** `cancelSalesInvoice` bloquea anulación de facturas `ISSUED` con cobranzas `CONFIRMED` o `receivable.paidAmount > 0` (espeja `cancelSupplierInvoice` en AP). `cancelAccountMovement` bloquea movimientos con `sourceType` `COLLECTION`, `PAYMENT` u `OPENING_BALANCE`, y movimientos con `transferId` — reversión solo vía agregado (`cancelCollection`, `cancelPayment`, transferencia).
  - **Concurrencia optimista** en `createPayment` / `createCollection` y todas las cancelaciones/reversiones: `updateMany` + `assertOptimisticRowUpdate(count)` exige exactamente 1 fila afectada → `CONFLICT` si no.
  - **Fase 0 no propaga** `projectId` en `AccountMovement` generado por cobro/pago; filtro por obra en reportes vía join (`Collection.projectId`, `Payment.projectId`).
- **Consecuencias:** guards extraídos y testeados en `packages/services/src/ar/sales-invoice-cancel-guards.ts`, `.../ap/supplier-invoice-cancel-guards.ts` y `.../treasury/account-movement-cancel-guards.ts`; locking optimista también en cancelación de facturas, obligaciones, cobros/pagos y reversión de saldos; P-TRZ-06 resuelto vía `resolveOpeningBase` en `balance.service.ts`.
- **Referencias:** plan Finanzas/Transacciones v2; [`02-modules/TREASURY.md`](../02-modules/TREASURY.md), [`02-modules/ACCOUNTS_RECEIVABLE.md`](../02-modules/ACCOUNTS_RECEIVABLE.md).

---

## ADR-013 — Anticipos a proveedor: cuenta puente (Fase 2)

- **Fecha:** 2026-05-29
- **Estado:** ACEPTADO (implementación diferida Fase 2)
- **Contexto:** [`EXPENSES_AND_PAYMENTS.md`](../02-modules/EXPENSES_AND_PAYMENTS.md) §13 describe pagos anticipados sin factura. Hoy el flujo AP exige `SupplierInvoice` → `Payable` → `Payment`; un pago directo sin obligación rompe BR-PAY-001 y la trazabilidad documental.
- **Decisión:**
  - **Fase 1 (cliente):** anticipo vía `registerArAdvance` — factura de venta con línea "Anticipo de obra" + cobranza inmediata (`registerArSale` con `collectNow`). Sin saldo inicial artificial de proyecto.
  - **Fase 2 (proveedor):** entidad **`SupplierAdvance`** (o equivalente) como cuenta puente analítica: pago confirmado → OUTFLOW tesorería + saldo anticipo a favor del proveedor por `projectId`; al emitir factura → compensación automática o manual contra el anticipo. Validador `registerSupplierAdvanceSchema` y servicio stub `registerSupplierAdvance` lanzan `NOT_IMPLEMENTED` hasta migración.
  - **No** usar `Payment` sin `Payable` ni movimiento manual sin ADR en producción.
- **Consecuencias:** UI `/proyectos/[id]/facturas/anticipo/nueva` para cliente; proveedor documentado en OPEN_QUESTIONS si producto acelera Fase 2.
- **Referencias:** [`SALES_AND_COLLECTIONS.md`](../02-modules/SALES_AND_COLLECTIONS.md) §anticipo, [`FINANCE_AND_PROJECT_OVERVIEW_ARCHITECTURE.md`](./FINANCE_AND_PROJECT_OVERVIEW_ARCHITECTURE.md).

---

## ADR-007 — Gantt y cronograma detrás de adapter único (Kibo UI)

- **Fecha:** 2026-05-27
- **Estado:** ACEPTADO
- **Contexto:** Q-003/Q-004 cerradas ([D-038](../00-product/DECISION_LOG.md), [D-039](../00-product/DECISION_LOG.md)); multip vista (Gantt, calendario, kanban, tabla) sobre un read model servidor.
- **Decisión:** componentes **Kibo UI** (`gantt`, `calendar`, `kanban`) instalados vía CLI en `apps/web`; el feature `schedule` solo importa **adapters** (`mapScheduleWorkspaceToGanttFeatures`, etc.) que traducen DTOs de `@bloqer/services` a props Kibo y eventos Kibo → Server Actions. Tabla densa con TanStack Table. Sin lógica financiera en React.
- **Consecuencias:** posible actualización manual si Kibo cambia API; dominio y Prisma no dependen de Kibo. Licencia MIT (copia de código al repo).
- **Referencias funcionales:** [`TECH_STACK.md`](./TECH_STACK.md), [`FRONTEND_FEATURE_STRUCTURE.md`](./FRONTEND_FEATURE_STRUCTURE.md), [`02-modules/PROJECT_SCHEDULING.md`](../02-modules/PROJECT_SCHEDULING.md).

---

## ADR-Phase1-01 — UUID v4 para todas las PKs

- **Fecha:** 2026-05-07
- **Estado:** ACEPTADO
- **Contexto:** La plantilla PENDING_ARCHITECTURE_ITEMS (P-ERD-07) pedía un benchmark de UUID v4 vs v7. Para Phase 1, con volúmenes de datos aún bajos, el overhead de fragmentación de índice de v4 es irrelevante.
- **Decisión:** UUID v4 vía `@default(uuid())` de Prisma en todas las PKs. Re-evaluar v7 si los benchmarks de Phase 3+ muestran degradación.
- **Consecuencias:** Índices B-Tree levemente menos óptimos que v7 a escala. Aceptable para Fase 1-2.

---

## ADR-Phase1-02 — Tenant 1:N Company (Q-001 resuelto)

- **Fecha:** 2026-05-07
- **Estado:** ACEPTADO
- **Contexto:** Q-001 preguntaba si Company es 1:1 o N:1 con Tenant. Alternativa A = tenant IS company. Alternativa B = tenant puede tener N companies.
- **Decisión:** Alternativa B. El modelo `Company` existe y tiene FK a `Tenant`. `UserMembership.companyId` es nullable para soportar membresías globales al tenant.
- **Consecuencias:** Multi-empresa habilitada en la DB desde Phase 1. La UI solo expone una empresa por defecto; el multi-empresa se activa en fases posteriores.

---

## ADR-Phase1-03 — Auth.js v5 + Google OAuth; Magic Link diferido

- **Fecha:** 2026-05-07
- **Estado:** ACEPTADO
- **Contexto:** Se requería autenticación federada sin credenciales propias (email/password). Se evaluaron Auth.js v4, v5 beta, y Clerk.
- **Decisión:** Auth.js v5 (next-auth@5 beta) con Google OAuth. Adapter de Prisma (`@auth/prisma-adapter`). Sin Credentials. Magic Link con Resend diferido para Phase 2.
- **Consecuencias:** La app puede arrancar localmente sin credenciales reales de Google (empty string fallback). El login solo funciona end-to-end con variables de entorno configuradas.

---

## ADR-Phase1-04 — RBAC vía UserMembership.roles (array PostgreSQL)

- **Fecha:** 2026-05-07
- **Estado:** ACEPTADO
- **Contexto:** Se necesitaba almacenar los roles de un usuario por tenant. Opciones: tabla UserRole separada (join), array en PostgreSQL, JSON column.
- **Decisión:** Array nativo de PostgreSQL (`UserRole[]` en Prisma). La semántica es unión: el usuario tiene acceso si **cualquiera** de sus roles lo habilita. La función `can(roles, action, module)` en `@bloqer/domain` es pura (sin I/O).
- **Consecuencias:** Queries de roles son simples (`roles @> ARRAY['ADMIN']::UserRole[]`). No soporta permisos granulares por campo (fuera del alcance per PERMISSIONS_MATRIX.md).

---

## ADR-Phase1-05 — Notas internas en matriz de permisos (`Tenant.permissionMatrixNotes`)

- **Fecha:** 2026-05-13
- **Estado:** ACEPTADO
- **Contexto:** la pantalla `/configuracion/permisos` lista muchos `PermissionModule` como columnas; las notas largas en tabla rompen la lectura y no son auditables.
- **Decisión:** persistir un objeto JSON opcional `permission_matrix_notes` en la tabla `tenants`, clave = `PermissionModule` canónico, valor = `{ text, updatedAt, updatedByUserId }`. La UI usa Sheet/Dialog por módulo; **no** se duplica otra tabla de permisos.
- **Consecuencias:** migración SQL + lectura/escritura solo vía `packages/services` con guard `EDIT USERS_PERMISSIONS` **o** `EDIT TENANT_SETTINGS`; evento de auditoría al actualizar.
- **Referencias funcionales:** [`PERMISSIONS_MATRIX.md`](../00-product/PERMISSIONS_MATRIX.md) §2.2.2, [`USERS_AND_PERMISSIONS.md`](../02-modules/USERS_AND_PERMISSIONS.md) §9.

---

## ADR-Phase1-06 — Membresía tenant: una fila `UserMembership` por `(userId, tenantId)` en Phase 1

- **Fecha:** 2026-05-14
- **Estado:** ACEPTADO
- **Contexto:** [Q-001](../00-product/OPEN_QUESTIONS.md) distingue multi-empresa en datos (`Company` N:1 `Tenant`) del sub-problema “misma persona en dos sociedades” simultáneas, que exige relajar `@@unique([userId, tenantId])` u otro modelo.
- **Decisión:** en Phase 1 el schema Prisma **conserva** la unicidad `@@unique([userId, tenantId])`. El contexto de razón social activa en `UserMembership.companyId` (nullable) o en evoluciones de UI que **actualicen** esa única fila — no se introducen filas paralelas sin ADR de migración ([D-036](../00-product/DECISION_LOG.md)).
- **Consecuencias:** `getMembershipByUserId` / `resolveTenantContext` permanecen alineados a **como máximo una** membresía por tenant por usuario; variante “0B” queda explícitamente fuera hasta nuevo ADR.

---

## ADR-Phase1-07 — Ingresos corporativos sin obra: Phase 1 sin relajar AR

- **Fecha:** 2026-05-14
- **Estado:** ACEPTADO
- **Contexto:** [Q-030](../00-product/OPEN_QUESTIONS.md) listaba migración AR nullable, solo GL/tesorería, o nuevo documento.
- **Decisión:** Phase 1 implementa la **opción documental y operativa (2)**: reflejo contable y banco vía **`JournalEntry`** + tesorería según política; **sin** migración `projectId` nullable en `SalesInvoice`/`Receivable`/`Collection` hasta decisión explícita de producto ([D-037](../00-product/DECISION_LOG.md)).
- **Consecuencias:** checklist [Q030_CORPORATE_INCOME_CHECKLIST.md](./Q030_CORPORATE_INCOME_CHECKLIST.md) §Opción 1/3 quedan para fases posteriores; §Opción 2 es la referencia de implementación no-code del corte.

---

### Formato sugerido para nuevos ADRs

```markdown
## ADR-NNN — Título

- **Fecha:** YYYY-MM-DD
- **Estado:** PROPUESTO | ACEPTADO | REEMPLAZADO por ADR-XXX
- **Contexto:** …
- **Decisión:** …
- **Consecuencias:** positivas / negativas
- **Referencias funcionales:** enlaces a docs si aplica
```

## Referencias

- Visión técnica: [`ARCHITECTURE_OVERVIEW.md`](./ARCHITECTURE_OVERVIEW.md)
- Stack: [`TECH_STACK.md`](./TECH_STACK.md)
- Decisiones de producto: [`../00-product/DECISION_LOG.md`](../00-product/DECISION_LOG.md)
