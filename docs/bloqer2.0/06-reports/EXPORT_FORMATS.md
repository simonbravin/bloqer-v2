# Formatos de exportación

## XLSX
- **Uso:** operativo, pivot en Excel.
- **Reglas:** una hoja principal + hoja “Glosario” opcional.
- **Números:** formato local es-AR (`,` miles, `.` decimal o según tenant).

## PDF
- **Uso:** presentación a dirección/cliente.
- **Reglas de encabezado:** tenant / razón social (empresa primaria), **obra** (`código · nombre`) en reportes de proyecto, título, timestamp UTC, filtros activos, usuario generador.
- **Reglas de pie:** tenant, usuario, paginación (`Página X de Y`), aviso de truncado si aplica.
- **Logo tenant:** si el tenant tiene logo subido ([D-071]), se muestra en el encabezado PDF; si no, solo texto (nunca logo producto Bloqer). La clave/bytes se resuelven solo desde `tenant_id` del contexto de servicio — no desde input del cliente.
- **Implementación:** `@react-pdf/renderer` en `@bloqer/report-pdf` (no HTML/Puppeteer). Ver ADR-014.

## CSV
- **Uso:** integración con BI externo.
- **Encoding:** UTF-8 BOM recomendado para Excel Windows.

## PDF vs datos sensibles
Ocultar columnas según rol antes de renderizar.

## R-002 — Avances del proyecto (D-120)

- Descarga **CSV / Excel (XLSX) / PDF** desde `/proyectos/[id]/reportes/avances`; email manual y programación de obra (`PROJECT_PROGRESS`) en **CSV/PDF**.
- Misma lectura del servidor y permisos en vista, archivo y adjunto: presupuesto(s), moneda original coherente, movimientos desde, corte no futuro y estado documental actual. Desde no reinicia acumulados.
- Conservar cobertura, avisos de fuentes ambiguas/faltantes y bases de cada indicador. Porcentajes observados no se convierten en globales validados al exportar. Un dato restringido o no calculable permanece vacío/identificado; no se convierte en cero.
- PDF ejecutivo con indicadores, gráficos y pendientes; detalle por partida para análisis en Excel/CSV. Identificar cualquier truncado de detalle en PDF y remitir al archivo de datos completo.
- Sin sumar monedas distintas, sin duplicar padres/hojas o comprometido/devengado; bases fiscales distintas conservan su explicación.

## Referencias
- [`EXPORT_REPORTS.md`](../05-workflows/EXPORT_REPORTS.md)
