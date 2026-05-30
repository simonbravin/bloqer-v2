# Formatos de exportación

## XLSX
- **Uso:** operativo, pivot en Excel.
- **Reglas:** una hoja principal + hoja “Glosario” opcional.
- **Números:** formato local es-AR (`,` miles, `.` decimal o según tenant).

## PDF
- **Uso:** presentación a dirección/cliente.
- **Reglas de encabezado:** tenant / razón social (empresa primaria), **obra** (`código · nombre`) en reportes de proyecto, título, timestamp UTC, filtros activos, usuario generador.
- **Reglas de pie:** tenant, usuario, paginación (`Página X de Y`), aviso de truncado si aplica.
- **Logo tenant:** pendiente (campo persistido no implementado aún).
- **Implementación:** `@react-pdf/renderer` en `@bloqer/report-pdf` (no HTML/Puppeteer). Ver ADR-014.

## CSV
- **Uso:** integración con BI externo.
- **Encoding:** UTF-8 BOM recomendado para Excel Windows.

## PDF vs datos sensibles
Ocultar columnas según rol antes de renderizar.

## Referencias
- [`EXPORT_REPORTS.md`](../05-workflows/EXPORT_REPORTS.md)
