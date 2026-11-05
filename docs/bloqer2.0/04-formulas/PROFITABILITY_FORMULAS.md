# Fórmulas — Rentabilidad por proyecto

## Margen bruto (MB)
\[
MB = Ingresos - CostosDirectos
\]

**Ingresos del margen por presupuesto (D-141).** La base certificada usa sus certificados. La base facturada suma el neto sin IVA/IIBB de sus facturas emitidas y sus notas de débito, y resta las notas de crédito emitidas. Los ajustes se vinculan por factura origen. Las ventas directas se presentan fuera de ese margen.

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

En AUTO_WEIGHT (D-041/D-043/D-142), cada obra recibe la proporción del pool mensual en ARS que corresponde a su costo directo neto devengado en ARS. Los documentos AP en otra moneda usan su FX histórico si el equivalente guardado permite comprobarlo. Si falta una equivalencia de un costo relevante, el reparto y el margen neto dependiente quedan sin calcular hasta que exista una base completa. Los períodos cerrados usan su imputación congelada.

### Ejemplo numérico

| Concepto | ARS |
|---|---:|
| MB | 3.000.000 |
| GG asignados | 400.000 |
| Costo financiero | 150.000 |
| Impuestos asignados | 100.000 |
| **MN** | **2.350.000** |

## Visibilidad ([D-013])
- MB: OWNER, ADMIN, FINANCE y PROJECT_MANAGER con acceso a la obra.
- MN: OWNER y ADMIN.

## Referencias
- [`../03-finance/PROFITABILITY_BY_PROJECT.md`](../03-finance/PROFITABILITY_BY_PROJECT.md)
