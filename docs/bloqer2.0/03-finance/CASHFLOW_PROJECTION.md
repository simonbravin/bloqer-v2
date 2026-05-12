# Proyección de caja

## Definición
Vista **forward-looking** que combina:
1. Saldo de caja **hoy** (posición consolidada).
2. **Cobranzas esperadas** desde `Receivable` con `due_date` futura (y probabilidad 100% por defecto).
3. **Pagos esperados** desde `Payable` con `due_date` futura.

**Relación con costo:** los **Payables** reflejan obligaciones **devengadas** (`accrued_amount`); la proyección usa sus vencimientos para **liquidez**, no sustituye `committed_amount` de OC sin facturar. **No incluye** por defecto compromisos OC **sin** paso a AP salvo política explícita “comprometer proyección” (Fase 2 / tenant).

**Tres mundos:** costo (comprometido/devengado/pagado) vs **caja real** vs **proyección** — ver [`COST_FORMULAS.md`](../04-formulas/COST_FORMULAS.md) §2.

## Serie temporal
Para cada fecha \(d\) en horizonte \(H\) (ej. 90 días):

\[
\text{ProjBalance}(d) = \text{Balance}(d_0) + \sum_{t \le d} \mathbb{E}[\text{ingresos}] - \sum_{t \le d} \mathbb{E}[\text{egresos}]
\]

Donde ingresos/egresos esperados vienen de vencimientos AR/AP.

## Supuestos por defecto
- Todo lo vencido se paga/cobra en la fecha de vencimiento.
- Sin probabilidad de incobro en Fase 1 (Fase 2: rating cliente).

## Alertas
- Saldo proyectado negativo en fecha \(d\) → notificación a FINANCE/OWNER.

## Referencias
- [`../02-modules/TREASURY.md`](../02-modules/TREASURY.md)
- [`../04-formulas/TREASURY_BALANCE_FORMULAS.md`](../04-formulas/TREASURY_BALANCE_FORMULAS.md)
