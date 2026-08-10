# Fórmulas — Impuestos y retenciones (manual)

## Porcentaje sobre base
\[
Tax = Base \times \frac{rate}{100}
\]

## Monto fijo
\[
Tax = fixed\_amount
\]

## Retención que reduce el pago
Si la factura es **ARS 100.000** y la retención Ganancias es **ARS 3.000**:

| Concepto | ARS |
|---|---|
| Total factura (bruto) | 100.000 |
| Retención | −3.000 |
| **Neto a pagar** | **97.000** |

La factura **no cambia** de total; el pago neto sí ([BR-TAX-003]).

## IVA discriminado (línea)
\[
IVA = Neto_{linea} \times \frac{alicuota}{100}
\]

### Ejemplo numérico

| Neto línea | Alícuota | IVA |
|---|---:|---:|
| ARS 10.000 | 21% | ARS 2.100 |

## Precio unitario con IVA incluido ([D-086])

Cuando el operador marca `pricesIncludeTax` (típico Factura B):

\[
Total_{linea} = round(qty \times P_{bruto})
\]
\[
Neto_{linea} = round\left(\frac{Total_{linea}}{1 + alicuota/100}\right)
\]
\[
IVA = Total_{linea} - Neto_{linea}
\]

Se **persiste** el precio unitario neto (`unitPrice = Neto / qty` a **4 dp**, alineado a `Decimal(18,4)` de línea) y los componentes de línea a 2 dp. Usar 4 dp en el unitario evita deriva al regrabar DRAFT en modo exclusivo. El flag no se guarda en DB.

### Ejemplo

| Cant. | Precio ingresado (c/IVA) | Alícuota | Neto | IVA | Total |
|---:|---:|---:|---:|---:|---:|
| 1 | 121,00 | 21% | 100,00 | 21,00 | 121,00 |

## Referencias
- [`../03-finance/TAXES_AND_WITHHOLDINGS.md`](../03-finance/TAXES_AND_WITHHOLDINGS.md)
- [`../00-product/DECISION_LOG.md`](../00-product/DECISION_LOG.md) D-053, D-086
