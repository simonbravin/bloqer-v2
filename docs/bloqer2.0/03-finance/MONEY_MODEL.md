# Money Model — Modelo de dinero

## Propósito
Definir cómo Bloqer representa **montos monetarios** de forma consistente, sin pérdida de precisión y con soporte multi-moneda.

## Principios
1. **Nunca `float`**: todos los montos son **decimales** con precisión explícita ([`AGENTS.md`](../AGENTS.md)).
2. **Moneda explícita**: cada monto lleva `currency` (ISO 4217).
3. **ARS como base**: todo reporte consolidado puede expresarse en ARS ([D-008]).
4. **FX por movimiento**: tipo de cambio capturado en el momento del hecho económico ([D-008]).
5. **Inmutabilidad**: una vez `CONFIRMED` (p. ej. movimiento de tesorería confirmado), el monto y FX no cambian salvo anulación/reversión auditada.
6. **OC aprobada y FX de confirmación (D-129):** cambiar el FX manual antes de confirmar exige que el mismo actor pueda aprobar el nuevo importe en ARS, con los umbrales/varianza y segregación vigentes. Se renueva la aprobación auditada en la misma transacción que confirma. Si no puede, la OC APPROVED queda intacta para un aprobador habilitado. Sin cambio de FX conserva el permiso actual de confirmación.

## Campos conceptuales por entidad con dinero

| Campo | Significado |
|---|---|
| `amount` | Monto en la moneda de la transacción |
| `currency` | Moneda del `amount` |
| `fx_rate` | Cuántos ARS equivalen **1 unidad** de `currency` al momento del movimiento |
| `amount_ars` | `amount × fx_rate` redondeado según política |
| `base_amount` | (Opcional) monto imponible para impuestos |

## Precisión decimal (defaults)

| Concepto | Decimales de **negocio** | Capacidad típica en DB |
|---|---|---|
| ARS / USD / montos operativos / `amount_ars` | **2** | `NUMERIC(18,4)` (capacidad; no escala de negocio) |
| Cantidades inventario / cómputo | 4 en storage; **2 en UI** | `NUMERIC(18,4)` |
| Tipo de cambio (`fx_rate`) | **6** | `NUMERIC(18,6)` |
| Porcentajes impuestos / overhead | 4 en storage; **2 en UI** | `NUMERIC(8,4)` |

> Ver [D-053](../00-product/DECISION_LOG.md): la precisión de negocio la impone el kernel de aplicación; las columnas no se migran a `(18,2)`. Display es-AR: miles con `.` y decimales con `,` (`1.234.567,89`).

## Redondeo
- Redondeo **half-up** a la precisión del campo destino ([D-053](../00-product/DECISION_LOG.md)).
- **Líneas de documento (canónico, [D-053] / [D-093]):**
  1. `grossSubtotal = roundMoney(quantity × unitPrice)` (2 dp) — `unitPrice` es list net
  2. `discountAmount = roundMoney(grossSubtotal × discountPct / 100)` (2 dp)
  3. `lineSubtotal = roundMoney(grossSubtotal − discountAmount)` (2 dp)
  4. `lineTax = roundMoney(lineSubtotal × taxRate / 100)` (2 dp)
  5. `lineTotal = roundMoney(lineSubtotal + lineTax)` (2 dp)
  6. Totales de cabecera = **suma** de líneas (sin re-redondear la suma).
  7. El % de cabecera no se persiste: es sello del mismo `discountPct` en cada línea.
- Tolerancia de validación documento vs suma: **0.01** en moneda del documento.
- `amount_ars = roundMoney(amount × fx_rate)` a **2** dp; `fx_rate` a **6** dp.
- **Pagar/cobrar todo:** aplicar saldo **almacenado** en servidor; display siempre 2 dp.

## Lecturas de planificación — D-122/D-124

Las comparaciones de EDT y costos y varianza de recursos conservan la moneda original del presupuesto y rechazan fuentes contribuyentes de otra moneda, sin FX implícito. Un consumo sin moneda/valuación trazables es `null` en costo y varianza de consumo; no se serializa como cero. La ausencia comprobada de consumos sí admite cero. Presupuesto y exposición documental conservan sus capas; no se agrega consumo para duplicarlas.

## Conservación al editar — D-117

Los componentes guardados de una línea se conservan si cantidad, precio neto, IVA y descuento siguen numéricamente iguales. El servidor compara contra las líneas del propio documento dentro de la transacción. Cambiar un dato monetario o reinterpretar el precio como bruto recalcula. El navegador nunca decide los importes históricos a persistir.

Con IVA incluido **sin descuento**, aplica D-086: el total es cantidad × precio bruto redondeado; IVA es la diferencia entre ese total y el neto extraído. No reconstruir ese total desde el unitario neto de 4 dp: no siempre reproduce los centavos. Con descuento se mantiene D-093. Abrir/guardar un campo sin editarlo tampoco debe reemplazar 4 dp almacenados por los 2 dp del display.

No hay migración ni regularización automática de documentos emitidos/pagados. Ver [D-117](../00-product/DECISION_LOG.md).

## Signos
- **Ingresos** a tesorería: positivos en cuenta destino según convención ledger ([`ACCOUNT_MOVEMENTS.md`](./ACCOUNT_MOVEMENTS.md)).
- **Saldo deudor AR/AP**: positivo = adeudado.

## Costo: comprometido, devengado, pagado (reporting)

No son campos obligatorios de cada fila de `amount`; son **capas de agregación** para comparar presupuesto vs real y rentabilidad:

| Concepto canónico | Resumen |
|---|---|
| `committed_amount` | Compromisos firmes (OC `CONFIRMED`/`PARTIALLY_RECEIVED`/`RECEIVED`, subcontrato `ACTIVE`, otros firmes aprobados); OC solo `APPROVED` todavía no compromete, D-044 |
| `accrued_amount` | Obligación reconocida (facturas compra emitidas/aprobadas, certif. subcontrato que genera AP, gastos como payable) |
| `open_committed_amount` | `committed_amount` menos devengado **vinculado** a ese compromiso |
| `expected_cost_exposure` | `accrued_amount + open_committed_amount` (**anti doble conteo**, [BR-COS-002]) |
| `paid_amount` (costo) | Egresos de tesorería confirmados aplicados a costo (vía `Payment` / `AccountMovement`) |

**Separación obligatoria:**

- **Reporting de costo** (comprometido / devengado / pagado / exposición esperada): [`../04-formulas/COST_FORMULAS.md`](../04-formulas/COST_FORMULAS.md) §1–2.
- **Cashflow real:** solo movimientos de caja confirmados — [`CASHFLOW.md`](./CASHFLOW.md).
- **Proyección de caja:** AR/AP y vencimientos — [`CASHFLOW_PROJECTION.md`](./CASHFLOW_PROJECTION.md).

## Hallazgo — AG-05: resumen de compromiso reconciliado con D-044

El resumen anterior incluía OC `APPROVED`, contradiciendo D-044 y COST_FORMULAS. Se corrigió la descripción: el compromiso nace al confirmar al proveedor. No cambia la decisión ni los estados persistidos.

## Relación con otros documentos
- [`MULTI_CURRENCY_RULES.md`](./MULTI_CURRENCY_RULES.md)
- [`ACCOUNT_MOVEMENTS.md`](./ACCOUNT_MOVEMENTS.md)
- [`TAXES_AND_WITHHOLDINGS.md`](./TAXES_AND_WITHHOLDINGS.md)
- [`../04-formulas/COST_FORMULAS.md`](../04-formulas/COST_FORMULAS.md)
