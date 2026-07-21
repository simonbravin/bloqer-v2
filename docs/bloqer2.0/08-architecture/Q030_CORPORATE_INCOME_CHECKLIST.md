# Checklist técnica — Ingresos corporativos sin proyecto (Q-030)

> **Phase 1 (2026-05-14):** opción **(2)** — [D-037](../00-product/DECISION_LOG.md), [ADR-Phase1-07](./ARCHITECTURE_DECISION_RECORDS.md).  
> **D-051 (2026-07-21):** opción **(1)** implementada — AR con `projectId` nullable. Opción **(3)** descartada.

## Invariantes (cualquier opción)

- Un solo libro contable canónico: `JournalEntry` + líneas; sin segundo ledger paralelo no documentado ([D-035](../00-product/DECISION_LOG.md)).
- Mutaciones y totales en `packages/services`; **no** Prisma desde `apps/web`.
- Gates `can()` + módulos tenant alineados a [`PERMISSIONS_ROUTE_MATRIX.md`](./PERMISSIONS_ROUTE_MATRIX.md).

## Opción 1 — `projectId` nullable en cadena AR — **IMPLEMENTADA (D-051)**

- [x] Migración Prisma + reglas BR-AR-003 actualizadas en docs.
- [x] Validators (`sales-invoice`, `registerArIncome`) + servicios AR + rutas `/finanzas/cuentas-por-cobrar/[id]`.
- [x] Aging AR global: ítems con `projectId` null etiquetados (`AGING_AR_COMPANY_PROJECT_LABEL` = "Empresa").
- [x] Flujo UI Registrar transacción → Factura / cuenta por cobrar (`AR_INCOME`).
- [x] `TREASURY_INFLOW` permanece para ingresos sin CxC.
- [x] Tests: schema `AR_INCOME`, permisos company AR, labels aging, `buildFinancialHref` corporativo, `assertCorporateReceivableScope`.
- [x] Guards: contacto tenant/`ACTIVE` en `registerArIncome`; mutaciones company vía `assertCompanyReceivableMutable` (no operar CxC de obra desde Finanzas).
- [x] Guía operativa: flujo Factura/CxC vs Solo caja documentado ([`GUIA_OPERATIVA_BLOQER_V2_REVISADA.md`](../GUIA_OPERATIVA_BLOQER_V2_REVISADA.md) §12.1 / §14).
- [ ] ARCA / emisión legal (fuera de alcance).

## Opción 2 — Solo GL + tesorería — **Phase 1 (sigue disponible)**

- Política operativa: cuándo usar `TREASURY_INFLOW` vs factura corporativa.
- [D-049](../00-product/DECISION_LOG.md): `counterpartyContactId` + `externalInvoiceRef` en movimientos manuales.

## Opción 3 — Nuevo documento de ingreso — **DESCARTADA**

- Se reutiliza `SalesInvoice` corporativo (espejo de `SupplierInvoice` AP) en lugar de un documento paralelo.
