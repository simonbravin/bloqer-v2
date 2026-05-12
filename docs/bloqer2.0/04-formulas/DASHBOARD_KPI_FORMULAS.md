# Fórmulas — KPIs de dashboard

## Runway de caja (simplificado)
\[
Runway_{meses} = \frac{S_{total}(hoy)}{Burn_{mensual}}
\]

Donde \(Burn\) = egresos promedio últimos 3 meses (configurable).

### Ejemplo

| Saldo ARS | Burn mensual | Runway |
|---:|---:|---:|
| 6.000.000 | 2.000.000 | 3,0 meses |

## Obra con mayor desvío Presupuesto vs Real (costo)
\[
Desvio_p = \frac{Real_p - Presupuesto_p}{Presupuesto_p}
\]

Ranking descendente por \(|Desvio_p|\).

## Cobranzas vs certificado (riesgo)
\[
Gap_{cob} = Facturado - Cobrado
\]

Donde **Facturado** y **Cobrado** provienen de **facturas de venta / AR y cobranzas**, no del `status` de `Certification` ([BR-CERT-PAYMENT-001]).

Alerta si \(Gap_{cob} / Facturado > umbral\).

## Referencias
- [`../06-reports/EXECUTIVE_DASHBOARD.md`](../06-reports/EXECUTIVE_DASHBOARD.md)
