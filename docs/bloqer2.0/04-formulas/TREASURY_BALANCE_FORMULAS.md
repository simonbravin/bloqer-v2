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

## Escenario de atraso de cobranza — D-150

**Propósito:** comparar la proyección puntual de una obra con un atraso global hipotético, sin alterar las obligaciones.

**Variables:** `hoy` es la fecha calendario de la organización; `d` es la fecha de proyección, con `d ≥ hoy`; `n` son días corridos enteros no negativos. `saldo_i` es el saldo abierto actual de cada CxC, después de pagos y créditos. `C` y `P` son cobros y pagos confirmados hasta `d`; `AP_d` es el saldo abierto de CxP con vencimiento hasta `d`. Cada moneda se calcula por separado.

\[
f_i = \max(vencimiento_i, hoy) + n
\]
\[
Base(d) = C - P + \sum_{vencimiento_i \le d} saldo_i - AP_d
\]
\[
Escenario(d,n) = C - P + \sum_{vencimiento_i \le d\;\land\;f_i \le d} saldo_i - AP_d
\]
\[
Diferencia = Escenario - Base = -\sum_{vencimiento_i \le d\;\land\;f_i > d} saldo_i
\]

**Precisión:** cálculo decimal; montos a 2 decimales half-up mediante el kernel D-053. Se reutiliza la normalización vigente de saldos abiertos. Fechas por días calendario, sin sumar horas ni usar la zona horaria del servidor.

**Ejemplo:** hoy 27/11/2026, fecha elegida 02/12/2026, atraso 5 días. CxC vencida con saldo 50 pasa al 02/12 y queda incluida. CxC que vence el 01/12 con saldo 200 pasa al 06/12 y queda fuera de la fecha. Con cobros 20, pagos 10 y CxP 25, la base es 235, el escenario es 35 y la diferencia es −200; un documento por 200 queda desplazado.

**Casos borde:** cero días reproduce la base; la fecha límite es inclusiva; una obligación originalmente posterior a `d` no integra ninguna comparación; saldos saldados/anulados no aportan; los créditos no se suman a cobros. Sin AR no hay escenario; sin AP se informa alcance parcial. No se mezclan monedas ni se proyectan OC sin facturar.

**Usado en:** proyección puntual de `/proyectos/[id]/flujo-caja`, [Proyección de caja](../03-finance/CASHFLOW_PROJECTION.md).

## Referencias
- [`../03-finance/ACCOUNT_MOVEMENTS.md`](../03-finance/ACCOUNT_MOVEMENTS.md)
