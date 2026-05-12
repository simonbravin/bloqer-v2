# Fórmulas — Inventario (FIFO y promedio móvil)

## Promedio ponderado móvil
Tras cada ingreso:

\[
UC_{nuevo} = \frac{(Qty_{ant} \times UC_{ant}) + (Qty_{ing} \times Cost_{ing})}{Qty_{ant} + Qty_{ing}}
\]

Valor stock:

\[
V = Qty_{onHand} \times UC
\]

### Ejemplo numérico

| Evento | Qty | Costo unit ingreso | Stock qty | UC resultante |
|---|---:|---:|---:|---:|
| Inicial | — | — | 0 | — |
| Ingreso 1 | 100 | ARS 1.000 | 100 | ARS 1.000 |
| Ingreso 2 | 50 | ARS 1.200 | 150 | \((100×1000+50×1200)/150\) = **1.066,67** |

## Stock disponible vs reservado

\[
Qty_{disponible} = Qty_{onHand} - Qty_{reservado\_activo}
\]

Donde \(Qty_{reservado\_activo}\) suma cantidades en `StockReservation` con estado `ACTIVE` o `PARTIALLY_RELEASED` (según cantidad aún reservada). Al **`CONSUMED`**, la reserva se liquida y el egreso queda en **`StockMovement`** ([BR-INV-006], [BR-INV-008], [D-034]).

## FIFO (conceptual)
El costo del egreso consume desde los lotes más antiguos hasta cubrir cantidad.

### Ejemplo numérico simplificado
Lotes: (10 u × ARS 100), luego (10 u × ARS 110). Egreso 15 u:
- Costo = \(10×100 + 5×110\) = **ARS 1.550** ; stock remanente 5 u × ARS 110.

## Referencias
- [`../02-modules/INVENTORY.md`](../02-modules/INVENTORY.md)
