# Money and decimal strategy — Bloqer 2.0

## Decisión

- **Nunca `float`** en PostgreSQL ni en tipos de aplicación para dinero.  
- Almacenar importes como **`NUMERIC`** con precisión explícita.  
- Cada fila con dinero lleva **`currency` (ISO 4217)**.  
- **FX manual por movimiento** donde aplique: `fx_rate` y `amount_ars` (o equivalente en moneda base) según [D-008](../00-product/DECISION_LOG.md) y [`../03-finance/MONEY_MODEL.md`](../03-finance/MONEY_MODEL.md).

## Campos canónicos (por entidad monetaria)

| Campo | Uso |
|---|---|
| `amount` | Monto en moneda de la transacción |
| `currency` | ISO 4217 |
| `fx_rate` | ARS por 1 unidad de `currency` al momento del hecho |
| `amount_ars` | Monto en ARS derivado; almacenado para reporting y sumas |
| `base_amount` | Opcional para impuestos / bases imponibles |

**Storage (capacidad de columna) vs escala de negocio ([D-053](../00-product/DECISION_LOG.md)):**

| Concepto | Escala de negocio | Capacidad DB típica |
|---|---|---|
| Montos operativos / `amount_ars` | **2** dp half-up | `NUMERIC(18, 4)` o `(19, 4)` — capacidad, no “guardar 4 dp de dinero” |
| FX (`fx_rate`) | **6** dp | `NUMERIC(18, 6)` |
| Cantidades inventario | **4** dp | `NUMERIC(18, 4)` ([`../03-finance/MONEY_MODEL.md`](../03-finance/MONEY_MODEL.md)) |

Kernel de aplicación: `roundMoney` / `serializeMoney` / `resolveFxAmounts` en `@bloqer/utils`; DTOs money siempre con 2 dp; prohibido `float`/`parseFloat` en cálculo de dinero.

## Redondeo

- Política **half-up** a la precisión del campo destino; algoritmo de líneas y tolerancia en [`../03-finance/MONEY_MODEL.md`](../03-finance/MONEY_MODEL.md) y [D-053](../00-product/DECISION_LOG.md).

## Estados derivados (no son “dinero almacenado arbitrario”)

### `Certification.payment_status`

- **Derivado** desde `Receivable` vinculadas a facturas con `certification_id` + aplicaciones de cobranza ([D-026](../00-product/DECISION_LOG.md), [BR-CERT-PAYMENT-001](../01-domain/BUSINESS_RULES.md)).  
- Implementación: **vista**, **subquery**, o columna **materializada** mantenida por servicio/job — ver [`REPORTING_DATA_MODEL.md`](./REPORTING_DATA_MODEL.md). **No** es un enum que el usuario edita.

### `SubcontractCertification.settlement_status`

- **Derivado** desde `Payable` + `Payment` ([D-027](../00-product/DECISION_LOG.md)).  
- Misma familia de soluciones que arriba.

### Capas de costo (`committed`, `accrued`, `paid`, `expected_cost_exposure`)

- **No** son columnas obligatorias en cada fila; son **agregaciones** según [`../04-formulas/COST_FORMULAS.md`](../04-formulas/COST_FORMULAS.md) y [BR-COS-002](../01-domain/BUSINESS_RULES.md).  
- Queries deben **evitar doble conteo** entre comprometido y devengado vinculado.

## Problemas que evita

- Errores de redondeo tipo `0.1 + 0.2`.  
- Inconsistencia entre “monto contrato” y “monto cobrado” por falta de `amount_ars`.  
- Confundir **cashflow real** con **devengado**.

## Qué NO hacer

- No usar `double precision` “por performance” en paths financieros.  
- No calcular reportes consolidados **solo** en cliente.  
- No guardar **monto y moneda** sin `fx_rate` cuando la moneda ≠ ARS y el producto exige ARS ([D-008](../00-product/DECISION_LOG.md)).

## Referencias

- [`../03-finance/MULTI_CURRENCY_RULES.md`](../03-finance/MULTI_CURRENCY_RULES.md)  
- [`LEDGER_TABLES_STRATEGY.md`](./LEDGER_TABLES_STRATEGY.md)  
- [`SERVICE_LAYER.md`](./SERVICE_LAYER.md)
