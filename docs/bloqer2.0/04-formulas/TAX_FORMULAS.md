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

## Referencias
- [`../03-finance/TAXES_AND_WITHHOLDINGS.md`](../03-finance/TAXES_AND_WITHHOLDINGS.md)
