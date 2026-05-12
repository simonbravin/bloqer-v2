# Fórmulas — Rentabilidad por proyecto

## Margen bruto (MB)
\[
MB = Ingresos - CostosDirectos
\]

**Ingresos:** certificaciones facturadas + ventas directas + ajustes (en ARS).

**Costos directos:** materiales + MO + equipos + subcontratos imputados según la **vista explícita** del reporte ([BR-COS-001]):

- **Devengado:** suma imputaciones en **`accrued_amount`**.
- **Pagado:** suma imputaciones en **`paid_amount`** (caja).
- **Exposición esperada:** usar **`expected_cost_exposure`** = `accrued_amount + open_committed_amount` por proyecto/ítem, **sin** `committed_amount + accrued_amount` bruto ([BR-COS-002]).

El MB debe declarar en leyenda: *MB (devengado)*, *MB (pagado)* o *MB (exposición esperada)*.

### Ejemplo numérico

| Concepto | ARS |
|---|---:|
| Ingresos | 10.000.000 |
| Costos directos | 7.000.000 |
| **MB** | **3.000.000** |
| **MB%** | **30%** |

## Margen neto (MN) — conceptual
\[
MN = MB - GG - CF - Imp_{proyecto}
\]

Donde \(GG\) es prorrateo de gastos generales según política ([Q-013]).

### Ejemplo numérico

| Concepto | ARS |
|---|---:|
| MB | 3.000.000 |
| GG asignados | 400.000 |
| Costo financiero | 150.000 |
| Impuestos asignados | 100.000 |
| **MN** | **2.350.000** |

## Visibilidad ([D-013])
- MB: roles amplios.
- MN: OWNER/ADMIN por defecto.

## Referencias
- [`../03-finance/PROFITABILITY_BY_PROJECT.md`](../03-finance/PROFITABILITY_BY_PROJECT.md)
