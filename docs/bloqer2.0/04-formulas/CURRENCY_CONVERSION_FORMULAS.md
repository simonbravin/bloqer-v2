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

## Redondeo
`amount_ars` redondeado a **2** decimales.

## Inversa (solo para visualización)
\[
amount\_fx = \frac{amount\_ars}{fx\_rate}
\]

## Referencias
- [`../03-finance/MULTI_CURRENCY_RULES.md`](../03-finance/MULTI_CURRENCY_RULES.md)
