# Hub de reportes de empresa (`/reportes`) — [D-098]

## Objetivo

Centralizar la reportería **multi-obra** a nivel tenant, separado del hub de obra (`/proyectos/[id]/reportes`). Evita “28 mil reportes”: 8 cards canónicos, 4 de ellos con servicio dedicado y 4 deep-links a pantallas operativas existentes.

## Cards

| Card | Ruta | Fuente |
|------|------|--------|
| Portafolio de proyectos | `/reportes/portafolio` | `getProjectPortfolioReport` → `getProjectCostControl` por obra |
| Rentabilidad multi-obra | `/reportes/rentabilidad-multi-obra` | `getPortfolioProfitabilityReport` |
| Aging CxC | `/finanzas/cuentas-por-cobrar` | operativo (link) |
| Aging CxP | `/finanzas/cuentas-por-pagar` | operativo (link) |
| Flujo de caja | `/tesoreria/flujo-caja` | operativo (link) |
| Inventario | `/inventario` | operativo (link) |
| GG por proyecto | `/reportes/gastos-generales-por-proyecto` | `getOverheadByProjectReport` (`ProjectOverheadAllocation`) |
| Compras multi-obra | `/reportes/compras-multi-obra` | `getMultiProjectProcurementReport` (comprometido = `lineSubtotal`) |

## Nav

Ítem **Reportes** en General (`global-workspace-nav.ts`), visible con VIEW de PROJECTS | AR | AP | TREASURY | INVENTORY.

## Exports / programados

- CSV: `/api/reports/portafolio.csv`, `rentabilidad-multi-obra.csv`, `gastos-generales-por-proyecto.csv`, `compras-multi-obra.csv`.
- Keys programadas: `TENANT_PROJECT_PORTFOLIO`, `TENANT_MULTI_PROJECT_RENTABILITY`, `TENANT_OVERHEAD_BY_PROJECT`, `TENANT_MULTI_PROJECT_PROCUREMENT`.

## Relación con obra

Drill típico: Portafolio → `/proyectos/[id]/control-costos`; Rentabilidad multi → `/reportes/rentabilidad` de la obra; Compras multi → Análisis de compras de la obra.

## Referencias

- [D-098] `00-product/DECISION_LOG.md`
- `06-reports/REPORT_CATALOG.md` (sección hub empresa)
- `GUIA_OPERATIVA_BLOQER_V2.md` §1.2 · §13.2
