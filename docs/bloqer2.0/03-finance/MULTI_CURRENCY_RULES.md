# Multi-moneda — Reglas

## Alcance
Operaciones en **USD** u otras monedas habilitadas para el tenant; **ARS** siempre como moneda base de reporting ([D-008]).

## Reglas lockeadas
1. **FX manual**: el usuario ingresa `fx_rate` al confirmar el movimiento/comprobante ([D-008]).
2. **Sin proveedor FX externo** en Fase 1.
3. **Todo movimiento** guarda `amount`, `currency`, `fx_rate`, `amount_ars`.
4. **Reportes consolidados** en ARS; opción de ver montos originales por columna.
5. **Diferencias de cambio**: no calculadas automáticamente en Fase 1 ([Q-025]); Fase 2 opcional.

## Convención de tipo de cambio
`fx_rate` = **ARS por 1 unidad de moneda extranjera**.

Ejemplo: USD 1 = ARS 1200 → `fx_rate = 1200`.

## Cobranza/pago en moneda distinta a factura
- Documentar ambos montos.
- `amount_ars` por lado (cobranza y factura) puede diferir → pendiente contable puente en Fase 2.

## Transferencias entre cuentas de distinta moneda
- Generar **dos movimientos** con FX explícito en cada pierna o un movimiento “FX adjustment” documentado ([`INTERNAL_TRANSFERS.md`](../02-modules/INTERNAL_TRANSFERS.md)).

## Validaciones
- `fx_rate > 0`.
- Moneda habilitada en catálogo [`MASTER_DATA.md`](../01-domain/MASTER_DATA.md).

## Ejemplo numérico
Factura USD 10.000, FX 1180 → `amount_ars = 11.800.000,00`.

## Referencias
- [`CURRENCY_CONVERSION_FORMULAS.md`](../04-formulas/CURRENCY_CONVERSION_FORMULAS.md)
