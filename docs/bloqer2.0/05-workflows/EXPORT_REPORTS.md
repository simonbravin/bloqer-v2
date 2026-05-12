# Workflow: Exportar reportes

## 1. Objetivo
Generar salidas **XLSX/PDF/CSV** desde reportes estándar o query builder ([`EXPORT_FORMATS.md`](../06-reports/EXPORT_FORMATS.md)).

## 2. Actor
Según permiso del reporte.

## 3. Precondiciones
- Parámetros válidos (fechas, proyecto).

## 4. Pasos
1. Abrir reporte desde biblioteca ([`REPORT_CATALOG.md`](../06-reports/REPORT_CATALOG.md)).
2. Configurar filtros y columnas visibles.
3. Vista previa en pantalla.
4. **Exportar** → seleccionar formato.
5. Sistema encola job si volumen alto (Fase 2).

## 5. Postcondiciones
- Archivo descargable + log en auditoría si sensible.

## Referencias
- [`REPORTING.md`](../02-modules/REPORTING.md)
