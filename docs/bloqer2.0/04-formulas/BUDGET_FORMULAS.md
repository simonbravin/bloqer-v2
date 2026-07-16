# Fórmulas — Presupuesto

## Total ítem de venta (precio)
Para un **CostItem**:

\[
\text{PrecioTotal}_{item} = Qty \times PU_{venta}
\]

Donde \(PU_{venta}\) puede provenir de costo total + utilidad + impuestos (ver [`SALE_PRICE_FORMULAS.md`](./SALE_PRICE_FORMULAS.md)).

## Total presupuesto venta
\[
\text{SaleBudget} = \sum_{items} \text{PrecioTotal}_{item}
\]

## Costo directo del ítem (APU unitario)

Las líneas de análisis (`CostAnalysisLine`) se expresan **por 1 unidad** del ítem ([D-047](../00-product/DECISION_LOG.md#d-047--apu-persistencia-unitaria-entrada-opcional-por-total-de-partida)):

\[
cost_{line} = coefficient \times unitCost
\]

\[
CD_{unit} = \sum_{lines \in CostAnalysis} cost_{line}
\]

\[
\text{CostBudget}_{item} = CD_{unit} \times Qty
\]

La UI puede cargar una línea en modo **Total partida**; al persistir se convierte a unitario money-safe (`coefficient = 1`, `unitCost = importe_partida / Qty`) ([D-047]).

### Ejemplo numérico

| Concepto | Valor |
|---|---|
| Cantidad ítem | 900 m² |
| Línea MAT (entrada total $1.250.000) | coef 1 × ARS 1.388,8889 / m² |
| Línea LAB (unitaria) | 1 × ARS 2.800 / m² |
| \(CD_{unit}\) | ≈ ARS 4.188,8889 / m² |
| **CostBudget ítem** | ≈ **ARS 3.770.000** |

| Concepto | Valor |
|---|---|
| Cantidad | 100 m² |
| PU venta | ARS 50.000 / m² |
| **PrecioTotal** | **ARS 5.000.000** |

**Precisión:** ARS con 2 decimales.

## Costo financiero presupuestado (simple — Fase 1)
\[
CF_{pres} = \text{CostoTotalProyectado} \times r_{fin} \times \frac{d_{prom}}{365}
\]

Donde \(r_{fin}\) es tasa anual configurada en **BudgetSettings** ([Q-011]) y \(d_{prom}\) días promedio de financiamiento estimado.

### Ejemplo numérico

| Variable | Valor |
|---|---|
| Costo total proyectado | ARS 10.000.000 |
| \(r_{fin}\) | 40% anual |
| \(d_{prom}\) | 180 días |
| **CF_pres** | \(10.000.000 \times 0{,}40 \times \frac{180}{365}\) ≈ **ARS 1.972.603** |

## Vigencia de variables ante estados del Budget
Cantidades, PU de venta, análisis de costo y parámetros de `BudgetSettings` **solo se editan** con `Budget` en `DRAFT` (o bajo `IN_REVIEW` si el workflow lo permite). En `APPROVED` la estructura económica está **bloqueada** ([BR-BUD-006]); en `CLOSED` el cómputo contractual no cambia sin **Adenda** y budget complementario ([BR-BUD-002]).

## Referencias
- [`../02-modules/BUDGETS.md`](../02-modules/BUDGETS.md)
