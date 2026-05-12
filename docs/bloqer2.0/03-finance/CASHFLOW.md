# Cashflow real

## Definición
Flujo de **caja ejecutada**: suma de **AccountMovement** confirmados en un rango, agrupados por período (día/semana/mes).

**No es** reporting de **comprometido** ni **devengado**: una OC confirmada o una factura registrada **no** mueven cashflow hasta el pago/cobranza que genera movimiento en cuenta ([`COST_FORMULAS.md`](../04-formulas/COST_FORMULAS.md) §2).

## Fórmula base
Para período \([t_0, t_1]\):

\[
\text{CF}(t_0,t_1) = \sum INCOME - \sum OUTCOME
\]

usando `date_value` **o** `date_accounting` según selector de reporte ([`TREASURY_MODEL.md`](./TREASURY_MODEL.md)).

## Entradas típicas (INCOME)
- Cobranzas de clientes (`Collection`).
- Otros ingresos manuales.
- Transferencias internas **entrantes**.

## Salidas típicas (OUTCOME)
- Pagos a proveedores/subcontratos.
- Gastos generales.
- Transferencias internas **salientes**.

## Relación con AR/AP
AR/AP **no** entran en cashflow real hasta que el **Collection/Payment** confirma movimiento de caja.

El **cobro** asociado a una certificación es siempre vía **AR + Collection** (y movimientos de tesorería); el campo `payment_status` de la certificación es **indicador derivado**, no sustituto de caja ([BR-CERT-PAYMENT-001]).

## Reportes
Ver [`FINANCIAL_REPORTS.md`](./FINANCIAL_REPORTS.md), [`../06-reports/FINANCIAL_REPORT_PACK.md`](../06-reports/FINANCIAL_REPORT_PACK.md).

## Referencias de fórmulas
- [`../04-formulas/TREASURY_BALANCE_FORMULAS.md`](../04-formulas/TREASURY_BALANCE_FORMULAS.md)
