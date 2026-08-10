# Impuestos y retenciones (carga manual)

## Alcance
IVA, IIBB, Ganancias, SUSS, percepciones — **sin motor fiscal automático** ([D-011]).

> Ver también [D-084]: letra de factura A/B/C/E y condición frente al IVA en Company/Contact. La letra **guía UX** (defaults/warnings); no cambia la fórmula de cálculo.
> Ver también [D-085]: presets de alícuota (0 / 10,5 / 21 / 27) y asiento GL con IVA discriminado cuando `taxAmount > 0`.
> Ver también [D-086]: en Factura B (u otras) se puede ingresar **precio unitario con IVA incluido**; al guardar se persiste neto + IVA.

## Modelo TaxLine
Por cada documento o movimiento:
- `tax_type_id`
- `base` imponible
- `rate` **o** `fixed_amount`
- `amount` resultante
- `sign`: `+` percepción / `-` retención

En la implementación actual el IVA operativo vive como `taxRate` / `lineTax` en líneas de factura (AR/AP); el modelo `TaxLine` polimórfico fino sigue pendiente (P-ERD-05).

## Letra de comprobante vs IVA ([D-084] / [D-085] / [D-086])

| Letra | Tratamiento esperado | UX en Bloqer |
|---|---|---|
| A | IVA discriminado (crédito fiscal al RI receptor) | Default alícuota 21% (editable a 10,5%/27%); warning si 0%; precio unitario = **neto** |
| B | IVA incluido (sin crédito fiscal al receptor) | Default toggle **precio c/IVA** ([D-086]); al guardar se desglosa neto+IVA; warning si 0% |
| C | Sin IVA (emisor Monotributo/Exento) | Default 0%; **bloqueo al emitir** si hay IVA |
| E | Sin IVA (exportación) | Default 0%; **bloqueo al emitir** si hay IVA |

### Alícuota 10,5% en construcción (orientación operativa, no motor)

- Suele aplicar a **locación de obra destinada a vivienda** (mano de obra + materiales del contrato de obra).
- Materiales sueltos, artefactos/grifería y muchos honorarios profesionales suelen ir al **21%**.
- Bloqer **no** elige 10,5% solo: el operador lo carga en la línea.

## Contabilidad ([D-085])

Al emitir factura con `taxAmount > 0` y CoA IVA activo:
- **Venta:** Debe Clientes (total) / Haber Ingresos (neto) + Haber IVA Débito (`2.1.10`).
- **Compra:** Debe Gasto (neto) + Debe IVA Crédito (`1.1.20`) / Haber Proveedores (total).

Sin cuenta IVA o sin impuesto → asiento de 2 líneas por total (comportamiento previo).

## Aplicación típica
- En **factura venta**: discrimina IVA en líneas.
- En **pago proveedor**: retenciones reducen neto pagado sin cambiar total factura ([BR-TAX-003]).

## Reportes
Agregados por período, jurisdicción, proveedor ([`FINANCIAL_REPORTS.md`](./FINANCIAL_REPORTS.md)). Libro IVA / DDJJ = futuro (ver OPEN_QUESTIONS).

## Referencias
- [`../04-formulas/TAX_FORMULAS.md`](../04-formulas/TAX_FORMULAS.md)
- [`../01-domain/MASTER_DATA.md`](../01-domain/MASTER_DATA.md) §2.6b

## Futuro
Motor fiscal AFIP / regional ([`INTEGRATIONS_FUTURE.md`](../07-non-functional/INTEGRATIONS_FUTURE.md)); `TaxType`/`TaxLine` normalizados (P-ERD-05).
