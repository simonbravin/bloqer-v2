# Fórmulas — Precio de venta del ítem

## Cadena típica (construcción)
1. **Costo directo total del ítem** \(CD\) (suma análisis).
2. **Costos indirectos asignados al ítem** \(CI\) (GG prorrateados o línea explícita).
3. **Costo financiero prorrateado** \(CF\) (opcional por ítem).
4. **Subtotal costo** \(C = CD + CI + CF\).
5. **Utilidad** \(U = C \times u\) con \(u\) % utilidad.
6. **Impuestos a precio** \(Imp\) según política (IVA venta si discrimina).
7. **Precio de venta** \(PV = C + U + Imp\).

### Forma compacta sin discriminar IVA en costo
\[
PV = (CD + CI + CF) \times (1 + u) \times (1 + i_{venta})
\]

Donde \(i_{venta}\) es alícuota efectiva de impuestos al precio (configurable).

## Ejemplo numérico

| Concepto | ARS |
|---|---|
| CD | 800.000 |
| CI (GG) | 100.000 |
| CF | 50.000 |
| Subtotal C | 950.000 |
| Utilidad 15% | 142.500 |
| Base imponible | 1.092.500 |
| IVA venta 21% | 229.425 |
| **PV con IVA** | **1.321.925** |

**Precisión:** redondeo por línea a 2 decimales; validar suma ítems vs total presupuesto.

## Referencias
- [`BUDGET_FORMULAS.md`](./BUDGET_FORMULAS.md)
