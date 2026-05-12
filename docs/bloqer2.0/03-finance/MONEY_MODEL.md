# Money Model — Modelo de dinero

## Propósito
Definir cómo Bloqer representa **montos monetarios** de forma consistente, sin pérdida de precisión y con soporte multi-moneda.

## Principios
1. **Nunca `float`**: todos los montos son **decimales** con precisión explícita ([`AGENTS.md`](../AGENTS.md)).
2. **Moneda explícita**: cada monto lleva `currency` (ISO 4217).
3. **ARS como base**: todo reporte consolidado puede expresarse en ARS ([D-008]).
4. **FX por movimiento**: tipo de cambio capturado en el momento del hecho económico ([D-008]).
5. **Inmutabilidad**: una vez `CONFIRMED` (p. ej. movimiento de tesorería confirmado), el monto y FX no cambian salvo anulación/reversión auditada.

## Campos conceptuales por entidad con dinero

| Campo | Significado |
|---|---|
| `amount` | Monto en la moneda de la transacción |
| `currency` | Moneda del `amount` |
| `fx_rate` | Cuántos ARS equivalen **1 unidad** de `currency` al momento del movimiento |
| `amount_ars` | `amount × fx_rate` redondeado según política |
| `base_amount` | (Opcional) monto imponible para impuestos |

## Precisión decimal (defaults)

| Concepto | Decimales |
|---|---|
| ARS y montos locales | 2 |
| Cantidades inventario | 4 |
| Tipo de cambio | 4 |
| Porcentajes impuestos | 4 |

## Redondeo
- Redondeo **half-up** a la precisión del campo destino.
- Suma de líneas: redondear línea, luego sumar; validar tolerancia 0.01 ARS vs total documento.

## Signos
- **Ingresos** a tesorería: positivos en cuenta destino según convención ledger ([`ACCOUNT_MOVEMENTS.md`](./ACCOUNT_MOVEMENTS.md)).
- **Saldo deudor AR/AP**: positivo = adeudado.

## Costo: comprometido, devengado, pagado (reporting)

No son campos obligatorios de cada fila de `amount`; son **capas de agregación** para comparar presupuesto vs real y rentabilidad:

| Concepto canónico | Resumen |
|---|---|
| `committed_amount` | Compromisos firmes (OC `APPROVED`/`CONFIRMED`, subcontrato `ACTIVE`, otros firmes aprobados) |
| `accrued_amount` | Obligación reconocida (facturas compra emitidas/aprobadas, certif. subcontrato que genera AP, gastos como payable) |
| `open_committed_amount` | `committed_amount` menos devengado **vinculado** a ese compromiso |
| `expected_cost_exposure` | `accrued_amount + open_committed_amount` (**anti doble conteo**, [BR-COS-002]) |
| `paid_amount` (costo) | Egresos de tesorería confirmados aplicados a costo (vía `Payment` / `AccountMovement`) |

**Separación obligatoria:**

- **Reporting de costo** (comprometido / devengado / pagado / exposición esperada): [`../04-formulas/COST_FORMULAS.md`](../04-formulas/COST_FORMULAS.md) §1–2.
- **Cashflow real:** solo movimientos de caja confirmados — [`CASHFLOW.md`](./CASHFLOW.md).
- **Proyección de caja:** AR/AP y vencimientos — [`CASHFLOW_PROJECTION.md`](./CASHFLOW_PROJECTION.md).

## Relación con otros documentos
- [`MULTI_CURRENCY_RULES.md`](./MULTI_CURRENCY_RULES.md)
- [`ACCOUNT_MOVEMENTS.md`](./ACCOUNT_MOVEMENTS.md)
- [`TAXES_AND_WITHHOLDINGS.md`](./TAXES_AND_WITHHOLDINGS.md)
- [`../04-formulas/COST_FORMULAS.md`](../04-formulas/COST_FORMULAS.md)
