# Fórmulas — Avance físico, económico y financiero

## Tres dimensiones ([D-003])

### Físico (obra ejecutada)
\[
P_{fis} = \frac{\text{Avance físico acumulado}}{\text{Alcance total físico planificado}} \times 100
\]
(Si el plan físico es 100% al finalizar obra; puede medirse por ítem.)

### Económico (certificado)
\[
P_{econ} = \frac{\sum MontosCertificadosAcum}{PresupuestoVentaTotal} \times 100
\]

### Financiero (cobrado)
\[
P_{fin} = \frac{\sum CobranzasAcum}{FacturaciónTotalEmitida} \times 100
\]
(Variante: denominador = presupuesto venta si se desea “cobrado vs previsto”.)

El numerador debe alimentarse de **cobranzas reales** (`Collection` / movimientos de tesorería aplicados a AR), no del `status` de `Certification` ni de un estado “pagado” de certificación ([BR-CERT-PAYMENT-001]).

## Ejemplo numérico coherente con desfasajes

| Métrica | % |
|---|---:|
| Físico real | 35% |
| Económico certificado | 37% |
| Financiero cobrado (vs facturado) | 60% del facturado |

Interpretación: se certificó más que el físico (acopio/mediciones); se cobró parcialmente respecto a lo facturado.

## Referencias
- [`PROFITABILITY_FORMULAS.md`](./PROFITABILITY_FORMULAS.md)
