# Reporting architecture — Bloqer 2.0

## Decisión

Los **reportes y dashboards** deben **reconciliar** contra **datos fuente** del ledger y documentos operativos: mismas definiciones de [`../04-formulas/`](../04-formulas/) y reglas de capas de costo ([D-021](../00-product/DECISION_LOG.md)). La **UI de gráficos** (Recharts) consume **series ya calculadas en servidor** o agregados explícitos; el cliente **no** redefine fórmulas de negocio.

## Justificación para Bloqer 2.0

- El producto separa **comprometido / devengado / pagado / cashflow** ([`../00-product/PRODUCT_PRINCIPLES.md`](../00-product/PRODUCT_PRINCIPLES.md) §7, [`../04-formulas/COST_FORMULAS.md`](../04-formulas/COST_FORMULAS.md)); los reportes incorrectos destruyen confianza.
- **Rentabilidad sensible** ([D-013](../00-product/DECISION_LOG.md)) exige servidor autoritativo.
- Catálogo de reportes ya definido ([`../06-reports/REPORT_CATALOG.md`](../06-reports/REPORT_CATALOG.md)).
- Guardrails ERD y checklist Prisma: [`REPORTING_ERD_GUARDRAILS.md`](./REPORTING_ERD_GUARDRAILS.md) (**ADR-010**).

## Problemas que evita

- **KPIs divergentes** entre pantalla de proyecto y PDF exportado.
- **Doble conteo** al mezclar capas sin etiquetar ([`../01-domain/BUSINESS_RULES.md`](../01-domain/BUSINESS_RULES.md) BR-COS-002).
- **Exports** que no cuadran con asientos por recalcular en cliente.

## Qué NO hacer

- No implementar **Query Builder** ([`../00-product/OPEN_QUESTIONS.md`](../00-product/OPEN_QUESTIONS.md) Q-010) sin límites de tenant, permisos y tablas permitidas.
- No usar **materialized views** o cachés sin estrategia de **invalidación** alineada a eventos (p. ej. `receivable.payment_status_recalculated`, [D-031](../00-product/DECISION_LOG.md)).
- No poner **reglas de impuestos o multi-moneda** en el frontend ([`../03-finance/MULTI_CURRENCY_RULES.md`](../03-finance/MULTI_CURRENCY_RULES.md)).

## Estrategia de implementación (fases conceptuales)

1. **Fase 1:** consultas SQL parametrizadas + export XLSX/PDF según [`../06-reports/`](../06-reports/).
2. **Fase 2:** snapshots / agregados para tableros pesados, siempre con **trazabilidad** a fuente y fecha de cálculo.
3. **Permisos:** matriz aplicada en servidor antes de devolver series ([`../00-product/PERMISSIONS_MATRIX.md`](../00-product/PERMISSIONS_MATRIX.md)).

## Referencias funcionales

- [`../06-reports/REPORT_CATALOG.md`](../06-reports/REPORT_CATALOG.md)
- [`../04-formulas/`](../04-formulas/)
- [`../03-finance/PROFITABILITY_BY_PROJECT.md`](../03-finance/PROFITABILITY_BY_PROJECT.md)
- [`../01-domain/BUSINESS_RULES.md`](../01-domain/BUSINESS_RULES.md) BR-COS-001, BR-COS-002

## Documentos técnicos relacionados

- [`SERVICE_LAYER.md`](./SERVICE_LAYER.md)
- [`FRONTEND_ARCHITECTURE.md`](./FRONTEND_ARCHITECTURE.md)
- [`BACKGROUND_JOBS_ARCHITECTURE.md`](./BACKGROUND_JOBS_ARCHITECTURE.md)

---

## Phase 9A — Exportación server-side (CSV + JSON)

**Implementado:** exportación **CSV** y **JSON** opcional (`?format=json`) vía **mismos servicios de reporte** que la UI; **sin** recalcular en el cliente y **sin** nuevas fórmulas.

### Formatos (9A + 9B)

| Formato | Estado | Notas |
|--------|--------|--------|
| **csv** | Soportado (default) | Generado en `packages/services/src/report-exports/`; descarga por Route Handlers `GET` bajo `/api/reports/...` |
| **json** | Soportado | Misma respuesta que usa la página (debug / integraciones internas); `?format=json` |
| **pdf** | **Parcial (9B)** | Ver [Phase 9B — PDF](#phase-9b--pdf-server-side-react-pdf). Rutas **sin** PDF: `?format=pdf` → `VALIDATION` JSON 400 con mensaje claro. |

### Roadmap exportaciones

- **Phase 9B (hecho):** PDF parcial con **`@react-pdf/renderer`** — ver sección 9B.
- **Phase 9C (hecho):** envío **manual** por email desde la UI (“Enviar por email”): adjuntos CSV/PDF generados con los **mismos builders** que 9A/9B; **sin** cron, **sin** programación, **sin** `EmailDeliveryLog`, **sin** preferencias; si Resend no está configurado → **no-op** controlado (`provider: "disabled"`). Ver [`EMAIL_NOTIFICATIONS_ARCHITECTURE.md`](./EMAIL_NOTIFICATIONS_ARCHITECTURE.md) y `packages/report-pdf/src/report-email.service.ts`.
- **Phase 9D+:** paquetes de reportes / ZIP / multi-report; envíos programados o digest (futuro; no confundir con 9C).

---

## Phase 9B — PDF server-side (`@react-pdf/renderer`)

**Decisión:** generar PDF en **`@bloqer/report-pdf`** con **`@react-pdf/renderer`** (`renderToBuffer`), documentos React específicos de PDF (no el árbol de la app Next). **No Puppeteer** en esta fase: no hace falta HTML/CSS del browser para el alcance actual; menos superficie operativa y memoria en runtime Node de las rutas.

**Dependencias:** `react`, `@react-pdf/renderer` en `packages/report-pdf/package.json`; `apps/web` declara `@react-pdf/renderer` y consume `@bloqer/report-pdf` directamente (ver ADR-014).

### Reportes con PDF soportado (19 rutas)

Todas las rutas listadas en §Rutas API con `?format=pdf` generan PDF vía `export*Pdf` en `@bloqer/report-pdf`, reutilizando los mismos servicios de lectura que CSV/JSON.

| Ámbito | Ejemplos |
|--------|----------|
| Finanzas corporativas | AR/AP aging, CXP corporativo, facturas proveedor |
| Tesorería | Posición de caja, movimientos, flujo de caja |
| Inventario | Stock, movimientos |
| Proyecto | Control de costos, presupuesto vs real, certificaciones, subcontratos, ingresos-gastos, rentabilidad, materiales, compras, flujo de caja |
| Configuración | Registro de actividad (audit log) |

**Respuesta:** `Content-Type: application/pdf`, `Content-Disposition: attachment`, `filename` vía `safeReportFilename` (extensión `.pdf`).

### Reglas de contenido PDF

- Mismos datos que CSV/vista (mismos servicios en `@bloqer/services`); **sin** sumar monedas; totales **por moneda** donde el DTO lo expone (`byCurrency` en aging).
- **Encabezado (`PdfReportHeader`):** tenant / razón social (empresa primaria activa), **obra** (`código · nombre`) en reportes de proyecto, título del reporte, **generado (UTC ISO)**, línea de **filtros** (sin UUIDs de negocio; filtros estructurales como “filtro activo”).
- **Pie (`PdfReportFooter`):** tenant, **usuario generador**, paginación `Página X de Y`, avisos de truncado cuando aplica.
- **Logo tenant:** pendiente (no hay campo persistido); placeholder futuro en [`EXPORT_FORMATS.md`](../06-reports/EXPORT_FORMATS.md).
- **Límites de filas:** aging — máx. **350**; control de costos y tablas genéricas de proyecto — máx. **90** filas (resto indicado en pie + sugerencia CSV).
- Sin `storageKey`, metadata interna, stack traces; sin IDs técnicos en cuerpo salvo los ya presentes en DTO usados también por CSV (p. ej. códigos WBS visibles).

### Código de referencia

- `packages/report-pdf/src/pdf/` — layouts (`aging-pdf`, `cost-control-pdf`, `project-simple-table-pdf`), `report-pdf-shared.tsx`, `pdf-renderer.service.ts`
- `packages/report-pdf/src/branding/` — `resolvePdfReportBranding`, tipos
- `packages/report-pdf/src/report-pdf-export.service.tsx` — orquestación + nombres de archivo
- `packages/report-pdf/src/pdf-render.smoke.test.tsx` — test de humo `%PDF`
- `apps/web/lib/report-export-http.ts` — `pdfResponse`
- `apps/web/features/reports/report-export-actions.tsx` — “Exportar CSV” / “Exportar PDF” (`format=csv|pdf`)

### Phase 9C — Envío manual por email

- **Server Action** `sendReportEmailAction` (`apps/web/app/(app)/report-email-actions.ts`): `tenantId` / contexto solo desde **sesión**; input validado con `@bloqer/validators` (`sendReportByEmailInputSchema`); PDF solo para AR/AP aging y control de costos (email).
- **Servicio** `sendReportByEmail` en `packages/report-pdf/src/report-email.service.ts`: construye adjunto vía `export*Csv` (`@bloqer/services`) / `export*Pdf` (`@bloqer/report-pdf`).
- **Phase 9D:** cada intento se persiste en **`EmailDeliveryLog`** (`REPORT_MANUAL`); ver [`EMAIL_NOTIFICATIONS_ARCHITECTURE.md`](./EMAIL_NOTIFICATIONS_ARCHITECTURE.md).
- **UI:** `ReportEmailSendDialog` en pantallas de reporte junto a export CSV/PDF.

---

### Rutas API (`GET`, `runtime: nodejs`) — CSV/JSON/PDF

Filtros: **mismos query params** que las páginas de reporte (p. ej. `currency`, `dateFrom`, `dateTo`, `period`, buckets, etc.). No se acepta `tenantId` en query; el tenant sale de la **sesión** (`ServiceContext`).

- `/api/reports/finanzas/ar-aging.csv`
- `/api/reports/finanzas/ap-aging.csv`
- `/api/reports/tesoreria/posicion-caja.csv`
- `/api/reports/tesoreria/movimientos.csv`
- `/api/reports/tesoreria/flujo-caja.csv`
- `/api/reports/inventario/stock.csv`
- `/api/reports/inventario/movimientos.csv`
- `/api/reports/proyectos/[projectId]/control-costos.csv`
- `/api/reports/proyectos/[projectId]/presupuesto-vs-real.csv` (R-001)
- `/api/reports/proyectos/[projectId]/certificaciones.csv` (R-012, R-CERT-*)
- `/api/reports/proyectos/[projectId]/compras-proveedores.csv` (R-AP-01…03)
- `/api/reports/proyectos/[projectId]/subcontratos.csv` (R-SCC-*, R-SUB-*)
- `/api/reports/proyectos/[projectId]/flujo-caja.csv`
- `/api/reports/proyectos/[projectId]/materiales.csv` (R-MAT-01)
- `/api/reports/proyectos/[projectId]/ingresos-gastos.csv` (CSV + PDF)
- `/api/reports/proyectos/[projectId]/rentabilidad.csv` (CSV + PDF)
- Hub UI (sin CSV en 9E inicial): `/proyectos/[id]/reportes/caja`

**Respuesta CSV:** `Content-Type: text/csv; charset=utf-8`, `Content-Disposition: attachment` con nombre saneado.

### Reglas CSV (LATAM / Excel)

- **UTF-8** con **BOM** inicial.
- Separador: **punto y coma** (`;`).
- Fin de línea: **CRLF** (`\r\n`).
- Celdas con comillas según RFC (comillas dobles escapadas, saltos de línea y separador dentro de comillas).
- **Mitigación Excel / Sheets:** valores de texto que empiezan con `=`, `+`, `-`, `@` o tabulador reciben prefijo `'` para que no se interpreten como fórmula al abrir el archivo.
- **`null` / `undefined`:** se serializan como celda vacía.
- **Fechas en filas:** preferencia **ISO `YYYY-MM-DD`** en columnas de fecha (salvo que el reporte ya exponga otro formato de solo lectura).
- **Montos** como **strings** (preserva decimales; sin `float`).
- **Multi-moneda:** no sumar monedas distintas; si el reporte es por moneda, filas con columna **currency** (o sección por moneda según el shape del servicio).
- Sin IDs técnicos salvo utilidad de auditoría; sin `storageKey`, metadata interna ni datos sensibles innecesarios.

### Seguridad y permisos

- Cada export usa **`tenantId` / `companyId` / `roles`** del contexto de sesión (misma construcción que otras rutas app).
- **Autorización:** mismas llamadas a servicios que la vista; si el usuario no puede ver el reporte, el export falla (`FORBIDDEN`, `NOT_FOUND`, etc.).
- **`projectId`** solo en path; validación **tenant + proyecto** en servicios existentes.
- Errores HTTP en JSON **sin stack** (handler genérico).

### Código de referencia (CSV / JSON)

- `packages/services/src/report-exports/` — tipos, `buildCsv`, `safeReportFilename`, parsers de query alineados a páginas, `export*Csv`.
- `apps/web/lib/report-export-http.ts` — sesión → contexto, respuesta CSV/PDF, errores.
- `apps/web/features/reports/report-export-actions.tsx` — enlaces que **reusan** `searchParams` actuales.
