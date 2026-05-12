# Fórmulas — Certificación

## Monto económico del período por ítem
\[
M_{item} = \Delta \%_{econ} \times \text{PrecioTotalPresupuestado}_{item}
\]

Donde \(\Delta \%_{econ}\) es el **incremento de avance económico** del período (no necesariamente igual al físico).

## Acumulado económico
\[
Acc_{econ} = \sum_{certificaciones \le t} M_{item}
\]

## Avance físico acumulado
\[
Acc_{fis} = \sum_{certificaciones \le t} \Delta \%_{fis}
\]

### Ejemplo numérico

| Ítem | Precio presupuestado | Δ% econ período | Monto período |
|---|---:|---:|---:|
| Mampostería | ARS 2.000.000 | 10% | ARS 200.000 |

## Validación obra pública ([D-004])
Si \(Acc_{econ} > \text{PrecioTotalPresupuestado}_{item}\) → **bloquear emisión** salvo adenda.

## `payment_status` (derivado; no es `status`)

No es fórmula del contenido de líneas de certificación: se obtiene **agregando** las `Receivable` activas vinculadas a la certificación (vía facturas de venta) y las aplicaciones de **`Collection`**.

Reglas de prioridad y valores (`UNPAID`, `PARTIALLY_PAID`, `PAID`, `OVERDUE`): ver [`../01-domain/STATE_MACHINES.md`](../01-domain/STATE_MACHINES.md) §5.2 y [BR-CERT-PAYMENT-001].

Los recálculos se modelan como eventos explícitos: **`receivable.payment_status_recalculated`** (coherencia de vistas derivadas) y **`receivable.overdue_detected`** cuando el vencimiento de AR afecta el indicador; **ninguno** muta `Certification.status` ([D-031], [`EVENTS_AND_AUTOMATIONS.md`](../01-domain/EVENTS_AND_AUTOMATIONS.md) §3.3b).

## Referencias
- [`../02-modules/CERTIFICATIONS.md`](../02-modules/CERTIFICATIONS.md)
