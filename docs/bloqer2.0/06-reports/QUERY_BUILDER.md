# Query builder (reportes ad-hoc)

## Objetivo
Permitir construir datasets tabulares sin desarrollar cada reporte de antemano ([`OPEN_QUESTIONS.md`](../00-product/OPEN_QUESTIONS.md) Q-010).

## Fase 1 (mínimo viable)
- Elegir **entidad base** (movimiento tesorería, factura compra, certificación, stock…).
- Agregar **filtros** (fechas, proyecto, contraparte, estado).
- Seleccionar **columnas** disponibles de esa entidad y relaciones 1 nivel.
- Exportar XLSX/CSV.

## Fase 2
- Joins multi-nivel, columnas calculadas, guardar reporte.

## Permisos
Respeta permisos de módulo base; no exponer columnas prohibidas (ej. MN oculta).

## Consideraciones
- Límites de filas (ej. 100k) para performance.
- Queries siempre con `tenant_id`.

## Referencias
- [`../02-modules/REPORTING.md`](../02-modules/REPORTING.md)
