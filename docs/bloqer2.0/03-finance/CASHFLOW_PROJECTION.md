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

## Comparación de atrasos en la obra — D-150

En **Flujo de caja → Proyección de caja**, **Comparar atraso de cobranza** amplía la proyección puntual existente. La fecha de proyección debe ser hoy o posterior; “hoy” usa la zona horaria de la organización y se muestra en el resultado. El atraso global se expresa en días corridos enteros; 0 reproduce la base. El límite técnico de entrada es 3.650 días, sin establecer condiciones contractuales de cobro.

Para cada CxC abierta de la base se compara la fecha elegida con `max(vencimiento, hoy) + atraso`. Así, las vencidas parten de hoy y las futuras de su vencimiento. El saldo es el actual, neto de cobranzas y créditos aplicados; una NC no crea caja. La comparación mantiene los cobros/pagos confirmados y las CxP de la base, separa monedas y no incluye OC sin facturar, probabilidades de cobro ni FX hipotético. Fórmula y ejemplo en [Saldos y cashflow](../04-formulas/TREASURY_BALANCE_FORMULAS.md#escenario-de-atraso-de-cobranza--d-150).

El panel muestra **Capital con atraso**, **Diferencia frente a la base**, **CxC dentro de la fecha con atraso** y **CxC desplazadas después de la fecha**, con cantidad de documentos desplazados. Una CxC que pasa después de la fecha no desaparece: queda identificada como desplazada. La misma lectura autorizada alimenta base y escenario. Sin acceso AR no se calcula el escenario; sin AP se identifica como **Comparación parcial**. Un filtro inválido muestra un error recuperable y conserva la proyección base sin presentar un escenario válido.

Es una consulta efímera: no modifica fechas, documentos, saldos ni notificaciones. Cambiar campos requiere **Aplicar** y se advierte si los resultados anteriores siguen visibles. **Limpiar** descarta fecha y escenario. La exportación de Flujo de caja conserva el informe de movimientos reales; esta comparación se consulta en pantalla. Las fechas pasadas siguen disponibles para la base, que usa saldos abiertos actuales y no reconstruye una posición histórica.

## Referencias
- [`../02-modules/TREASURY.md`](../02-modules/TREASURY.md)
- [`../04-formulas/TREASURY_BALANCE_FORMULAS.md`](../04-formulas/TREASURY_BALANCE_FORMULAS.md)
