# Reporting — guardrails ERD y checklist Prisma

> Complementa [`REPORTING_ARCHITECTURE.md`](./REPORTING_ARCHITECTURE.md) y [`REPORTING_DATA_MODEL.md`](./REPORTING_DATA_MODEL.md).  
> Decisión técnica formal: **ADR-010** en [`ARCHITECTURE_DECISION_RECORDS.md`](./ARCHITECTURE_DECISION_RECORDS.md).

## Principio

Los reportes **leen y agregan** tablas fuente del ERP. **No** crean paralelos de obligaciones, caja ni “presupuesto publicado”.

| Capa | Fuente Prisma (única) | Prohibido |
|------|----------------------|-----------|
| Plan de costo | `CostItem` + `CostAnalysisLine` | `published_apu_line`, snapshots de monto por reporte |
| Plan de venta | `CostItem` + `Budget.totalSalePrice` | Duplicar venta solo para BI |
| Avance cliente | `Certification` + `CertificationLine` | `INVOICED` como estado de cert ([BR-CERT-007]) |
| Factura legal | `SalesInvoice` | Monto facturado duplicado solo en cert |
| Cobranza | `Receivable` + `Collection` | `payment_status` mutable en `Certification` |
| Comprometido compras | `PurchaseOrder` (estados emitidos/recibidos) | Tabla `committed_by_po` |
| Comprometido subcontrato | `Subcontract` `ACTIVE` + líneas | Auto-`Subcontract` al aprobar presupuesto |
| Devengado AP | `SupplierInvoice` + `Payable` | Segunda tabla de deuda |
| Caja | `AccountMovement` `CONFIRMED` | Recalcular caja solo en React |
| Cert. subcontrato | `SubcontractCertification` | Unificar con `Certification` cliente |

**Regla de oro:** todo monto de reporte debe **trazarse** a filas fuente (o agregación documentada en `packages/services`). Si falta el número, es **imputación** (`wbsNodeId` null) o deuda de datos — no excusa para nueva tabla.

## Derivados: patrón único (on-read)

| Derivado | Implementación | Evitar |
|----------|----------------|--------|
| `payment_status` (cert. cliente) | Servicio / join AR + cobranzas | Columna actualizada a mano |
| `settlement_status` (subcontrato) | Idem sobre AP/pagos | Tabla `subcontract_settlement` |
| `OVERDUE` AR/AP | On-read ([`aging.service.ts`](../../../packages/services/src/aging/aging.service.ts)) | Job que persiste OVERDUE |
| Varianza presupuesto vs real | `reports/budget-variance.service.ts` | Copiar WBS entero por export |
| Baseline histórico versionado | `budget_baseline_snapshot` **solo** con ADR de versionado B | Snapshot silencioso en cada reporte |

Respuestas JSON de reportes pueden incluir `dataAsOf` (ISO UTC) cuando se agreguen MV en fases posteriores.

## Checklist antes de cada migración o tabla nueva

1. ¿La entidad ya existe en [`schema.prisma`](../../../packages/database/prisma/schema.prisma) con otro nombre?
2. ¿El monto se puede derivar de documentos existentes?
3. ¿`tenant_id` en toda tabla operativa?
4. ¿Los FK apuntan al agregado correcto (`CertificationLine` → `CostItem`, etc.)?
5. ¿El estado duplica semántica de otro documento?
6. ¿El reporting **escribe** en tablas fuente? → **prohibido** (solo lectura vía servicios).

## Read-layer (código de referencia)

```
packages/services/src/reports/
├── report-budget-resolve.ts       # presupuesto APPROVED/CLOSED
├── budget-variance.service.ts     # R-001
├── certification-evolution.service.ts  # R-012, R-CERT-*
├── procurement-deviation.service.ts    # R-AP-01/02, ext. R-009
└── subcontract-variance.service.ts     # R-SCC-*, varianza SUB

# Reutilizar (no duplicar lógica):
cost-control.service.ts
project-cash-flow.service.ts
aging.service.ts
```

**Mutaciones:** solo `packages/services`; **UI:** series ya calculadas ([`REPORTING_ARCHITECTURE.md`](./REPORTING_ARCHITECTURE.md)).

## Vistas SQL / materialized views

- **Fase 1 (actual):** Prisma parametrizado + índices `tenant_id`, `project_id`, `wbs_node_id`, fechas.
- **Fase 2+:** `VIEW` o MV solo con ADR, refresco por evento o job, y `data_as_of` visible en UI.

## Referencias

- [`../06-reports/REPORT_CATALOG.md`](../06-reports/REPORT_CATALOG.md)
- [`../04-formulas/COST_FORMULAS.md`](../04-formulas/COST_FORMULAS.md)
- [`../01-domain/BUSINESS_RULES.md`](../01-domain/BUSINESS_RULES.md) BR-COS-001, BR-COS-002
