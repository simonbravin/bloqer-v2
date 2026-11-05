# Multi-moneda — Reglas

## Alcance
Operaciones en **USD** u otras monedas habilitadas para el tenant; **ARS** siempre como moneda base de reporting ([D-008]).

## Reglas lockeadas
1. **FX manual**: el usuario ingresa `fx_rate` al confirmar el movimiento/comprobante ([D-008]).
2. **Sin proveedor FX externo** en Fase 1.
3. **Todo movimiento nuevo** guarda `amount`, `currency`, `fxRate`, `amountArs` ([D-134](../00-product/DECISION_LOG.md#d-134--tipo-de-cambio-persistido-en-movimientos-nuevos-de-tesorería)).
4. **Reportes consolidados** en ARS; opción de ver montos originales por columna.
5. **Diferencias de cambio**: no calculadas automáticamente en Fase 1 ([Q-025]); Fase 2 opcional.

## Comparación por presupuesto sin FX contractual — D-122

EDT y costos y Varianza ($) de Mano de obra/Equipos usan la moneda original del presupuesto seleccionado. Si una fuente accesible que contribuye al alcance consultado tiene otra moneda, el resultado económico se bloquea con un mensaje funcional. No se convierte con FX 1/actual ni se oculta esa fuente; cantidades comparables y cronograma temporal siguen disponibles. Es una lectura por presupuesto, no un consolidado ARS ni un cambio a D-008. El costo de consumo sin moneda/valuación trazables conserva D-124: desconocido, nunca un ARS implícito.

## Convención de tipo de cambio
`fx_rate` = **ARS por 1 unidad de moneda extranjera**.

Ejemplo: USD 1 = ARS 1200 → `fx_rate = 1200`.

## Moneda de factura, deuda y cobro/pago

El flujo AR/AP actual exige la **misma moneda** para la deuda y la cuenta de caja compatible con su empresa. En moneda extranjera se ingresa FX manual del comprobante y de cada cobro/pago; no se reutiliza implícitamente FX 1 ni el tipo de cambio de la factura. Los snapshots pueden diferir entre hechos económicos ([D-008]); no se calcula automáticamente una diferencia de cambio.

Cobrar/pagar una deuda mediante una cuenta de otra moneda no está habilitado. La representación de ambos montos y eventual cuenta puente es un diseño futuro, no un procedimiento operativo actual.

## Transferencias entre cuentas de distinta moneda

El flujo actual de transferencias propias admite cuentas de la misma moneda. Un eventual circuito entre monedas debe definir ambos montos y FX explícito; no se simula con un “FX adjustment” ni se presenta como disponible. La revisión integral de tesorería corresponde a AG-10 ([`INTERNAL_TRANSFERS.md`](../02-modules/INTERNAL_TRANSFERS.md)).

## Lecturas por moneda

Aging AR/AP, sus resúmenes y herramientas AI separan totales por moneda; el campo de total único no representa una suma de monedas diferentes. Esto no convierte un snapshot de deuda en un consolidado ARS ni modifica D-008.

## Hallazgo — AG-09: representación del tipo de cambio

AG-09 registró la brecha en [P-AG10-01](../08-architecture/PENDING_ARCHITECTURE_ITEMS.md). D-134 guarda la cotización de cada movimiento nuevo. Las transferencias propias de una misma moneda comparten el equivalente de ambas piernas. Si falta cotización en una contribución extranjera histórica, la posición consolidada en ARS queda incompleta y se mantienen los saldos nativos por moneda.

## Validaciones
- `fx_rate > 0`.
- Moneda habilitada en catálogo [`MASTER_DATA.md`](../01-domain/MASTER_DATA.md).

## Ejemplo numérico
Factura USD 10.000, FX 1180 → `amount_ars = 11.800.000,00`.

## Referencias
- [`CURRENCY_CONVERSION_FORMULAS.md`](../04-formulas/CURRENCY_CONVERSION_FORMULAS.md)
