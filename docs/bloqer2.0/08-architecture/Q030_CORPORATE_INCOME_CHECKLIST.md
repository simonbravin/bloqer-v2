# Checklist técnica — Ingresos corporativos sin proyecto (Q-030)

> **Phase 1 (2026-05-14):** producto lockeó **opción (2)** — [D-037](../00-product/DECISION_LOG.md), [ADR-Phase1-07](./ARCHITECTURE_DECISION_RECORDS.md). Este checklist sigue siendo la guía para **ampliaciones** (opciones 1 y 3). No implementar (1)/(3) hasta nueva decisión explícita.

## Invariantes (cualquier opción)

- Un solo libro contable canónico: `JournalEntry` + líneas; sin segundo ledger paralelo no documentado ([D-035](../00-product/DECISION_LOG.md)).
- Mutaciones y totales en `packages/services`; **no** Prisma desde `apps/web`.
- Gates `can()` + módulos tenant alineados a [`PERMISSIONS_ROUTE_MATRIX.md`](./PERMISSIONS_ROUTE_MATRIX.md).

## Opción 1 — `projectId` nullable en cadena AR

- Migración Prisma + reglas BR-AR-003 actualizadas en docs.
- Validators (`sales-invoice`, `receivable`, `collection`) + servicios AR + rutas `/finanzas/...` espejo de permisos AP corporativo.
- Aging AR global: ítems con `projectId` null etiquetados (similar `AGING_AP_COMPANY_PROJECT_LABEL`).
- Tests: numeración por `companyId`, no mezcla tenant, cobro en cuenta compatible con moneda.

## Opción 2 — Solo GL + tesorería

- **Phase 1:** política operativa documentada en [D-037](../00-product/DECISION_LOG.md), [`SALES_AND_COLLECTIONS.md`](../02-modules/SALES_AND_COLLECTIONS.md) §17, [ADR-Phase1-07](./ARCHITECTURE_DECISION_RECORDS.md). No migración AR.
- Política documentada: cuándo usar `TREASURY_INFLOW` / asiento manual vs obligar documento operativo.
- **[D-049] (2026-07-17):** ingreso corporativo enriquecido — `AccountMovement.counterpartyContactId` + `externalInvoiceRef` opcionales; UI Transacciones “Ingreso / cobro”. Sigue siendo opción (2): sin `SalesInvoice`/`Receivable` corporativos.
- `journal-entry-source-link` y reportes: enlaces seguros según rol; ledger/CSV/PDF muestran contraparte y comprobante externo.
- Sin tocar `SalesInvoice` hasta nueva decisión (Fase 2 / opciones 1 o 3 + ARCA).

## Opción 3 — Nuevo documento de ingreso

- `STATE_MACHINES.md` + `CORE_ENTITIES.md` + validators + servicios dedicados; evitar solapamiento semántico con `SalesInvoice` obra.
