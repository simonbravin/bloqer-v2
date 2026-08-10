# Impuestos y retenciones (carga manual)

## Alcance
IVA, IIBB, Ganancias, SUSS, percepciones — **sin motor fiscal automático** ([D-011]).

> Ver también [D-084]: letra de factura A/B/C/E y condición frente al IVA en Company/Contact. La letra **guía UX** (defaults/warnings); no cambia la fórmula de cálculo.

## Modelo TaxLine
Por cada documento o movimiento:
- `tax_type_id`
- `base` imponible
- `rate` **o** `fixed_amount`
- `amount` resultante
- `sign`: `+` percepción / `-` retención

En la implementación actual el IVA operativo vive como `taxRate` / `lineTax` en líneas de factura (AR/AP); el modelo `TaxLine` polimórfico fino sigue pendiente (P-ERD-05).

## Letra de comprobante vs IVA ([D-084])

| Letra | Tratamiento esperado | UX en Bloqer |
|---|---|---|
| A | IVA discriminado (crédito fiscal al RI receptor) | Default alícuota 21% si líneas en 0 |
| B | IVA incluido (sin crédito fiscal al receptor) | Calc actual; aviso si alícuota = 0 |
| C | Sin IVA (emisor Monotributo/Exento) | Default alícuota 0 |
| E | Sin IVA (exportación) | Default alícuota 0 |

## Aplicación típica
- En **factura venta**: discrimina IVA en líneas.
- En **pago proveedor**: retenciones reducen neto pagado sin cambiar total factura ([BR-TAX-003]).

## Reportes
Agregados por período, jurisdicción, proveedor ([`FINANCIAL_REPORTS.md`](./FINANCIAL_REPORTS.md)).

## Referencias
- [`../04-formulas/TAX_FORMULAS.md`](../04-formulas/TAX_FORMULAS.md)
- [`../01-domain/MASTER_DATA.md`](../01-domain/MASTER_DATA.md) §2.6b

## Futuro
Motor fiscal AFIP / regional ([`INTEGRATIONS_FUTURE.md`](../07-non-functional/INTEGRATIONS_FUTURE.md)).
