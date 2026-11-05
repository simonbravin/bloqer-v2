# Rentabilidad por proyecto

## Definiciones
- **Bruta:** ingresos reconocidos (certificado/facturado) − costos directos reales ([D-013]).
- **Neta:** bruta − GG asignados − costo financiero − impuestos a nivel proyecto según política ([D-013]).

## Ingresos
En el reporte **Rentabilidad por presupuesto**, la base **Certificado** usa los certificados del presupuesto. La base **Facturado** usa el subtotal neto de las facturas emitidas vinculadas y suma las ND y resta las NC emitidas de esas facturas de origen (D-141). Las ventas directas se informan fuera de ese margen. Un agregado de toda la obra requiere cubrir tanto sus ingresos como sus costos y distinguir las monedas no comparables.

## Costos
Vistas alineadas a [D-021], [BR-COS-001], [BR-COS-002] y [`COST_FORMULAS.md`](../04-formulas/COST_FORMULAS.md):

| Vista | Uso en MB |
|---|---|
| **Comprometido** (`committed` / abierto) | Compromisos firmes según §1.1; para “exposición” usar **`expected_cost_exposure`** = devengado + abierto |
| **Devengado** (`accrued`) | AP / facturas / certificaciones que reconocen obligación |
| **Pagado** (`paid`) | Solo caja confirmada imputada al proyecto |
| **Exposición esperada** | `accrued_amount + open_committed_amount` — **no** sumar committed+accrued en bruto |

El toggle de UI debe **rotular** la capa activa; KPIs comparan la misma capa en numerador y denominador del periodo.

## Visibilidad
- Bruta: OWNER, ADMIN, FINANCE y PROJECT_MANAGER con acceso a la obra.
- Neta: OWNER y ADMIN ([D-013]).

## Referencias
- [`../04-formulas/PROFITABILITY_FORMULAS.md`](../04-formulas/PROFITABILITY_FORMULAS.md)
- [`../06-reports/OPERATIONAL_REPORTS.md`](../06-reports/OPERATIONAL_REPORTS.md)

## Preguntas abiertas
- Imputación GG ([Q-013]).
