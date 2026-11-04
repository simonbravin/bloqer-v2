# AG-05 — Consumos sin valuación o moneda demostrable

Estado: **aprobada por el Owner el 04/11/2026**, formalizada en D-124. No habilita FIFO, migraciones ni correcciones de datos históricos.

Los consumos manuales y del libro de obra guardan cantidad pero normalmente dejan `StockMovement.unitCost/totalCost` en `null`. Tampoco conservan moneda ni vínculo a un lote valorizado. D-083 mantiene diferida la valorización completa; los ingresos desde OC guardan precio original, sin una garantía de ARS en el movimiento.

Hoy EDT y costos y Varianza de materiales convierten esos nulos en cero. Un consumo real puede aparentar costo cero y ahorro igual al presupuesto, aunque el costo sea desconocido. No es correcto implementar una cotización, FIFO o promedio nuevo para llenar ese dato durante la auditoría.

Se propone conservar las cantidades y mostrar **Sin valuación** / **—** en los campos de costo de consumo que no tengan valuación y moneda trazables. La varianza monetaria de esas filas y su total se marca no calculable; no se afirma ahorro. El presupuesto sigue visible y los costos documentales de OC/facturas/pagos de EDT conservan sus propias capas. La ausencia efectiva de consumos puede seguir mostrando cero; una fuente sin acceso no demuestra ausencia de consumos.

Los DTO, CSV/PDF y Bloqer AI conservan la misma advertencia; no exportan un cero aparente en lugar del valor desconocido. Solo se usan valores monetarios existentes cuando su origen/moneda sea demostrable; no se infiere ARS desde la preferencia visual ni se prorratean entradas a consumos sin vínculos.

La implementación afecta únicamente lecturas/presentación y sus regresiones. No cambia existencias, documentos, pagos ni valores guardados. El sistema completo de valuación permanece diferido bajo D-083.

AGENTS.md §§2 y 5 exige consultar esta definición financiera: no se adopta la recomendación por inferencia.
