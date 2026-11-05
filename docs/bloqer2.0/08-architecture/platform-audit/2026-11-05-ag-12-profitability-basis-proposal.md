# Q-088 — Base facturada del margen por presupuesto

**Estado.** Aprobada el 05/11/2026. Registrada como D-141.

La pantalla de Rentabilidad compara cada presupuesto con sus costos directos. En la base **Facturado**, hoy lee el total de las facturas vinculadas directamente a certificaciones. Ese total puede contener IVA e IIBB y el vínculo directo deja fuera los ajustes NC/ND de la factura de origen. La descripción funcional de rentabilidad de la obra también incluye ventas directas, cuyos ingresos no tienen presupuesto asociado para compararlos con el costo de un presupuesto particular.

## Propuesta

- Conservar el alcance del presupuesto elegido. Para **Facturado**, comparar el subtotal neto sin IVA ni percepciones IIBB de facturas emitidas con los costos directos netos. Sumar las notas de débito y restar las notas de crédito emitidas que ajustan esas facturas. Usar la relación con la factura de origen documentada en D-115.
- Mostrar que las ventas directas quedan fuera del margen por presupuesto y dar acceso a su operación según permisos. Conservar la lectura **Certificado** y las bases existentes de costo.
- Mantener importes, monedas originales, documentos históricos y vínculos. El cambio afecta la lectura del margen. Una moneda sin base comparable conserva su advertencia.

La alternativa es diseñar un margen para toda la obra que reúna ingresos directos y vinculados con costos de la misma cobertura, incluidos los costos sin presupuesto. Requiere definir qué bases de costo y de ingresos se usarían para el agregado.

Fuentes. [Rentabilidad por proyecto](../../03-finance/PROFITABILITY_BY_PROJECT.md), [fórmulas de rentabilidad](../../04-formulas/PROFITABILITY_FORMULAS.md), D-013, D-095, D-115 y D-116.
