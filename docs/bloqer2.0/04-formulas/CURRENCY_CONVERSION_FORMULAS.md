# Fórmulas — Conversión a ARS

## Regla base ([D-008])
\[
amount\_ars = amount \times fx\_rate
\]

Donde `fx_rate` = ARS por 1 unidad de moneda extranjera.

## Ejemplo numérico

| amount | currency | fx_rate | amount_ars |
|---:|---|---:|---:|
| 5.000 | USD | 1.180 | 5.900.000 |

## Redondeo ([D-053](../00-product/DECISION_LOG.md))
- `fx_rate` almacenado/redondeado a **6** decimales.
- `amount_ars = roundMoney(amount × fx_rate)` a **2** decimales (half-up).
- Sin `float` en la conversión; usar el kernel decimal de `@bloqer/utils`.

## Inversa (solo para visualización)
\[
amount\_fx = \frac{amount\_ars}{fx\_rate}
\]

## Referencias
- [`../03-finance/MULTI_CURRENCY_RULES.md`](../03-finance/MULTI_CURRENCY_RULES.md)
