# Formatos de exportación

## XLSX
- **Uso:** operativo, pivot en Excel.
- **Reglas:** una hoja principal + hoja “Glosario” opcional.
- **Números:** formato local es-AR (`,` miles, `.` decimal o según tenant).

## PDF
- **Uso:** presentación a dirección/cliente.
- **Reglas:** logo tenant, timestamp generación, usuario.

## CSV
- **Uso:** integración con BI externo.
- **Encoding:** UTF-8 BOM recomendado para Excel Windows.

## PDF vs datos sensibles
Ocultar columnas según rol antes de renderizar.

## Referencias
- [`EXPORT_REPORTS.md`](../05-workflows/EXPORT_REPORTS.md)
