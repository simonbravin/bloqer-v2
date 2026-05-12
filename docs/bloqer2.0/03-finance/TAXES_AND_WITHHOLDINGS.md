# Impuestos y retenciones (carga manual)

## Alcance
IVA, IIBB, Ganancias, SUSS, percepciones — **sin motor fiscal automático** ([D-011]).

## Modelo TaxLine
Por cada documento o movimiento:
- `tax_type_id`
- `base` imponible
- `rate` **o** `fixed_amount`
- `amount` resultante
- `sign`: `+` percepción / `-` retención

## Aplicación típica
- En **factura venta**: discrimina IVA en líneas.
- En **pago proveedor**: retenciones reducen neto pagado sin cambiar total factura ([BR-TAX-003]).

## Reportes
Agregados por período, jurisdicción, proveedor ([`FINANCIAL_REPORTS.md`](./FINANCIAL_REPORTS.md)).

## Referencias
- [`../04-formulas/TAX_FORMULAS.md`](../04-formulas/TAX_FORMULAS.md)

## Futuro
Motor fiscal AFIP / regional ([`INTEGRATIONS_FUTURE.md`](../07-non-functional/INTEGRATIONS_FUTURE.md)).
