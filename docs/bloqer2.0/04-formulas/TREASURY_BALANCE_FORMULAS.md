# Fórmulas — Saldos y cashflow (tesorería)

## Saldo de cuenta a fecha (por valor)
\[
S(a, t) = \sum_{m \in movements} sign(m) \times amount(m)
\]
con \(date\_value(m) \le t\) y estado ∈ {`CONFIRMED`, `RECONCILED`}.

`sign` = +1 para INCOME, −1 para OUTCOME en la convención del ledger.

## Saldo consolidado ARS a fecha
\[
S_{total}(t) = \sum_{accounts} S_{ARS}(a,t)
\]

Donde cada movimiento contribuye con `amount_ars`.

### Ejemplo numérico

| Movimiento | amount_ars | Acumulado |
|---:|---:|---:|
| + ingreso | 500.000 | 500.000 |
| − egreso | 120.000 | 380.000 |
| + cobranza | 200.000 | 580.000 |

## Cashflow período
\[
CF = \sum INCOME - \sum OUTCOME
\]
en rango, según fecha elegida ([`../03-finance/CASHFLOW.md`](../03-finance/CASHFLOW.md)).

**No usar** esta suma como sustituto de **`committed_amount`**, **`accrued_amount`** ni **`expected_cost_exposure`** del proyecto: el cashflow mide **caja**; el costo sigue [`COST_FORMULAS.md`](./COST_FORMULAS.md) §1–2.

## Referencias
- [`../03-finance/ACCOUNT_MOVEMENTS.md`](../03-finance/ACCOUNT_MOVEMENTS.md)
