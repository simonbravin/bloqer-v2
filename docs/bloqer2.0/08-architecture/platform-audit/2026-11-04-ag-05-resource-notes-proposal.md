# AG-05 — Cantidad facturada de recursos y notas fiscales

Estado: **aprobada por el Owner el 04/11/2026**, formalizada en D-123. D-115 ya exige NC negativa y ND positiva para importes; D-123 define ahora el neto de cantidades de notas en la cobertura APU.

Se propone llamar **cantidad facturada neta** a la suma de cantidades de factura + nota de débito − nota de crédito, únicamente cuando cada línea tiene una referencia de recurso y unidad compatibles con la fila APU. Ejemplo: factura 10 h, NC 2 h, ND 1 h → 9 h facturadas netas. El faltante conserva D-109: necesidad menos el mayor entre pedido y facturado, con piso cero. Una NC/ND de precio no demuestra recepción ni consumo físico; sus unidades de línea son unidades facturadas y nunca movimientos de stock.

No se convierten unidades ni se atribuye una nota genérica a un recurso por similitud. No cambian documentos, cantidades históricas, CxP, pagos, stock ni servicios de emisión. Solo cambia la lectura operativa de cobertura y su explicación en guía/ayuda. Casos de regresión: mismo recurso/unidad, nota de otra unidad, factura/NC/ND, otra empresa y fuentes restringidas.

Alternativa: contar solo cantidades de documentos `INVOICE` y mantener NC/ND exclusivamente en la varianza monetaria, explicando que una nota no reabre cobertura de cantidades. Esa alternativa exige el mismo acuerdo porque hoy las notas se suman todas como positivas.

La consulta responde a AGENTS.md §2: no inventar fórmulas ni resolver reglas ambiguas. La aprobación no modifica D-115 ni permite inferir avance físico a partir de una factura.
