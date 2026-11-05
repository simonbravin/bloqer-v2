# Q-089 — Moneda de los costos que ponderan gastos generales

**Estado.** Aprobada el 05/11/2026. Registrada como D-142.

D-041 distribuye el pool de gastos generales corporativos en ARS por el peso del costo directo devengado de cada obra. D-043 guarda el resultado al cerrar el mes. El cálculo actual suma importes devengados de cualquier moneda antes de dividir. Una obra con 100 USD y otra con 100 ARS reciben hoy la mitad del pool cada una. Con un tipo de cambio comprobado de 1.250 ARS por USD, sus bases comparables serían 125.000 ARS y 100 ARS.

## Propuesta

- Usar como peso el costo directo devengado neto en ARS. Conservar las capas, el mes, los estados y el conjunto de obras de D-041/D-043. Para cada documento AP en otra moneda, convertir su subtotal neto con el FX histórico guardado cuando se pueda comprobar contra su total en ARS. Aplicar el signo de NC/ND conforme a D-115. Mostrar los comprobantes sin equivalencia como pendientes de verificación.
- Si alguna fuente relevante carece de equivalencia comprobable, mostrar la base incompleta y suspender el cálculo y el cierre de ese período. Una certificación de subcontrato en moneda extranjera puede ser devengado válido y carecer de FX propio. Hace falta definir de dónde obtendría esa cotización antes de incluirla en el cálculo. Omitirla y distribuir igual el pool aumentaría el peso de las demás obras.
- Conservar las imputaciones ya congeladas y su lectura. Aplicar el criterio a períodos abiertos y a cálculos posteriores a una reapertura explícita. Mantener ARS como moneda del pool y de sus imputaciones.

La regla afecta la vista previa, el margen neto y los futuros cierres con AUTO_WEIGHT. La aprobación de esta propuesta no define un campo nuevo ni un mecanismo para registrar el FX que falta en certificaciones de subcontrato.

Fuentes. [Modelo de dinero](../../03-finance/MONEY_MODEL.md), [reglas multimoneda](../../03-finance/MULTI_CURRENCY_RULES.md), D-041, D-043, D-053, D-095 y D-115.
