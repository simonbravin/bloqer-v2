# Paquete de reportes financieros

## Reportes núcleo (Fase 1)
1. **Estado de caja / Posición consolidada** — saldos por cuenta + ARS.
2. **Cashflow real** — por período ([`CASHFLOW.md`](./CASHFLOW.md)).
3. **Proyección de caja** — horizonte configurable ([`CASHFLOW_PROJECTION.md`](./CASHFLOW_PROJECTION.md)).
4. **Aging AR** — buckets 0-30, 31-60, 61-90, +90.
5. **Aging AP** — idem.
6. **Rentabilidad por proyecto** — bruta y neta según permisos ([`PROFITABILITY_BY_PROJECT.md`](./PROFITABILITY_BY_PROJECT.md)).
7. **Presupuesto vs real** — vistas comprometido / devengado / pagado / exposición esperada ([D-021], [`COST_FORMULAS.md`](../04-formulas/COST_FORMULAS.md), [BR-COS-001]).
8. **Impuestos y retenciones** — resumen por período ([`TAXES_AND_WITHHOLDINGS.md`](./TAXES_AND_WITHHOLDINGS.md)).

## Filtros estándar
- Rango de fechas (contable o valor según reporte).
- Proyecto / global.
- Moneda (original + ARS).

## Exportación
XLSX y PDF ([`../06-reports/EXPORT_FORMATS.md`](../06-reports/EXPORT_FORMATS.md)).

## Permisos
Alineados a [`PERMISSIONS_MATRIX.md`](../00-product/PERMISSIONS_MATRIX.md) § Reportes financieros.
