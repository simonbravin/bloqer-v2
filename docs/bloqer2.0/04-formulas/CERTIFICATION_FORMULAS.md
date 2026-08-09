# Fórmulas — Certificación

## Monto económico del período por ítem

En producto el monto se calcula por **cantidad del período × precio unitario de venta** (snapshot del `CostItem` al armar la línea):

\[
M_{item} = q_{período} \times PU_{venta}
\]

Equivalente a la forma porcentual cuando \(PU_{venta} = \frac{\text{PrecioTotalPresupuestado}_{item}}{q_{presupuesto}}\):

\[
M_{item} = \Delta \%_{econ} \times \text{PrecioTotalPresupuestado}_{item}
\quad\text{con}\quad
\Delta \%_{econ} = \frac{q_{período}}{q_{presupuesto}}
\]

Donde \(\Delta \%_{econ}\) es el **incremento de avance económico** del período (no necesariamente igual al físico). El código redondea \(M_{item}\) a 2 dp half-up ([D-053]).

## Acumulado económico
\[
Acc_{econ} = \sum_{certificaciones \le t} M_{item}
\]

## Avance físico acumulado
\[
Acc_{fis} = \sum_{certificaciones \le t} \Delta \%_{fis}
\]

### Ejemplo numérico

| Ítem | Precio presupuestado | Cant. presup. | PU venta | Δ qty período | Δ% econ | Monto período |
|---|---:|---:|---:|---:|---:|---:|
| Mampostería | ARS 2.000.000 | 100 | 20.000 | 10 | 10% | ARS 200.000 |

## Validación obra pública ([D-004])
Si \(Acc_{econ} > \text{PrecioTotalPresupuestado}_{item}\) → **bloquear emisión** salvo adenda.

## `payment_status` (derivado; no es `status`)

No es fórmula del contenido de líneas de certificación: se obtiene **agregando** las `Receivable` activas vinculadas a la certificación (vía facturas de venta) y las aplicaciones de **`Collection`**.

Reglas de prioridad y valores (`UNPAID`, `PARTIALLY_PAID`, `PAID`, `OVERDUE`): ver [`../01-domain/STATE_MACHINES.md`](../01-domain/STATE_MACHINES.md) §5.2 y [BR-CERT-PAYMENT-001].

Los recálculos se modelan como eventos explícitos: **`receivable.payment_status_recalculated`** (coherencia de vistas derivadas) y **`receivable.overdue_detected`** cuando el vencimiento de AR afecta el indicador; **ninguno** muta `Certification.status` ([D-031], [`EVENTS_AND_AUTOMATIONS.md`](../01-domain/EVENTS_AND_AUTOMATIONS.md) §3.3b).

## Referencias
- [`../02-modules/CERTIFICATIONS.md`](../02-modules/CERTIFICATIONS.md)
