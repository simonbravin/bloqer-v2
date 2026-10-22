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

## Validación acumulada ([D-119], reemplaza D-004)
Para PUBLIC y PRIVATE: `q_previa + q_período ≤ q_presupuesto_vigente` y `p_físico_previo + p_físico_período ≤ 100`. Validar al guardar y nuevamente al emitir, en transacción bajo bloqueo de proyecto. El monto usa el PU snapshot de cada línea; no se revalorizan certificados históricos. Ampliaciones siguen el circuito de adenda existente; una nota no autoriza sobrecertificar.

## Sugerencia editable de medición (2026-10-22)

**Propósito:** proponer sólo el avance pendiente, sin volver a certificar lo ya emitido.

- `q_base`: cantidad contractual vigente; `q_previa`: suma de cantidades en otras certificaciones ISSUED/APPROVED del mismo ítem, sin filtrar por fechas.
- `p_fuente`: avance acumulado aprobado del libro hasta el fin del período (porcentaje explícito; fallback cantidad / q_base si nunca se informó porcentaje). Alternativamente, selección explícita de compras o recepciones: costo neto comprado/recibido hasta el corte / costo presupuestado × 100.
- `q_sugerida = max(0, min(q_base - q_previa, q_base × min(100, max(0, p_fuente)) / 100 - q_previa))`.
- `p_físico_sugerido = max(0, min(100, p_libro) - p_físico_previo)`. Se mantiene independiente de la cantidad económica.
- `monto_sugerido = roundMoney(q_sugerida × PU_venta_snapshot)`; cantidad y porcentaje a 4 dp, dinero a 2 dp half-up. Sin base o fuente disponible no hay sugerencia; cero pendiente no significa información ausente.
- Ejemplo: base 100, avance real 37%, previamente certificado 12 → sugerencia 25, acumulado 37. Reabrir otro certificado con el mismo corte no vuelve a sugerir los 37.
- No se suman borradores, rechazados ni cancelados. Abrir el diálogo no escribe datos. El guardado y la emisión vuelven a validar el saldo en servidor.

## `payment_status` (derivado; no es `status`)

No es fórmula del contenido de líneas de certificación: se obtiene **agregando** las `Receivable` activas vinculadas a la certificación (vía facturas de venta) y las aplicaciones de **`Collection`**.

Reglas de prioridad y valores (`UNPAID`, `PARTIALLY_PAID`, `PAID`, `OVERDUE`): ver [`../01-domain/STATE_MACHINES.md`](../01-domain/STATE_MACHINES.md) §5.2 y [BR-CERT-PAYMENT-001].

Los recálculos se modelan como eventos explícitos: **`receivable.payment_status_recalculated`** (coherencia de vistas derivadas) y **`receivable.overdue_detected`** cuando el vencimiento de AR afecta el indicador; **ninguno** muta `Certification.status` ([D-031], [`EVENTS_AND_AUTOMATIONS.md`](../01-domain/EVENTS_AND_AUTOMATIONS.md) §3.3b).

## Referencias
- [`../02-modules/CERTIFICATIONS.md`](../02-modules/CERTIFICATIONS.md)
