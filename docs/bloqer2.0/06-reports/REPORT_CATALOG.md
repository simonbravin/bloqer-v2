# Catálogo maestro de reportes

## Leyenda
- **Área:** OP | FIN | INV | PRJ
- **Fase:** 1 | 2 | 3

| ID | Nombre | Área | Descripción breve | Fase |
|---|---|---|---|---|
| R-001 | Presupuesto vs real (ítem) | OP | Integrado en **EDT y costos** ([D-098] · [D-099]): capas + composición APU + gasto por tipo (barras) + filtro por CostCategory + vistas de columnas. Ruta legacy `/reportes/presupuesto-vs-real` → redirect | 1 |
| R-002 | Avance físico/económico/financiero | PRJ | Tres curvas por proyecto | 1 |
| R-003 | Rentabilidad bruta por proyecto | FIN | MB y MB% (costo según vista etiquetada: devengado / pagado / exposición esperada, [BR-COS-001]) | 1 |
| R-004 | Rentabilidad neta por proyecto | FIN | MN y MN% (misma convención de capa de costo que R-003) | 1 |
| R-005 | Cashflow real | FIN | Ingresos−egresos por período (**solo caja**; no costo comprometido/devengado) | 1 |
| R-006 | Proyección de caja | FIN | Saldo + cobros/pagos esperados por AR/AP (**liquidez**; no suma OC abiertas salvo política) | 1 |
| R-007 | Aging cuentas por cobrar | FIN | Buckets por cliente/proyecto | 1 |
| R-008 | Aging cuentas por pagar | FIN | Buckets por proveedor | 1 |
| R-009 | Análisis de compras (ex Compras por proveedor) | OP | Eje **proveedor** + **varianza OC vs baseline APU** ([D-044]) + sin imputación EDT. Ya **no** incluye "Material presupuestado vs ejecución" (ese eje vive en EDT y costos, [D-099]) | 1 |
| R-010 | Compras multi-proyecto | OP | Hub empresa `/reportes/compras-multi-obra` ([D-098]; supersede diferimiento [D-083] para este card) | 1 |
| R-011 | Materiales más caros | OP | Ranking por variación precio o monto. **Diferido cierre Phase 4** ([D-083](../00-product/DECISION_LOG.md)) | 1 |
| R-012 | Evolución certificaciones | PRJ | Serie mensual certificado / facturado / cobrado: **facturado** = existe `SalesInvoice`/`Receivable` vinculada ([BR-CERT-007]); cobrado vía AR+tesorería; `payment_status` derivado; columnas no usan `INVOICED` como estado de certificación | 1 |
| R-013 | Materiales por proyecto | INV / OP | Consumo/stock imputado | 1 |
| R-014 | Inventario valorizado | INV | Por depósito y consolidado. Qty-only en piloto; **valorizado pleno diferido** (depende [D-007]/[D-083](../00-product/DECISION_LOG.md)) | 1 |
| R-015 | Libro de obra export | PRJ | PDF del parte (detalle) con fotos jpeg/png/webp embebidas; key programada empresa `TENANT_JOBSITE_DAILY_LOGS` ([D-100]) | 1 |
| R-016 | Directorio de contactos | OP | Export maestro | 1 |
| R-017 | Auditoría de movimientos | FIN | Log filtrable | 1 |
| R-018 | Query builder ad-hoc | ALL | Filtros + columnas ([Q-010]) | 1 |
| R-019 | Dashboard ejecutivo | FIN | KPIs consolidados | 1 |
| R-020 | Conciliación bancaria | FIN | Estado por cuenta/período (sesión); CSV en `/api/reports/tesoreria/conciliacion.csv` | 1 |

### Extensiones hub proyecto (baseline vs ejecución)

> Read-layer y checklist ERD: [`REPORTING_ERD_GUARDRAILS.md`](../08-architecture/REPORTING_ERD_GUARDRAILS.md) · ADR-010.  
> Hub UI: `/proyectos/[id]/reportes`, agrupado en **Financieros** (caja, cobros, pagos, margen) y **Operativos** (EDT, compras, materiales, subcontratos, certificaciones). **Impl.** = disponible en código actual.

| ID | Nombre | Área | Descripción breve | Fase | Impl. |
|---|---|---|---|---|---|
| R-CERT-01 | Estado cartera certificaciones | PRJ | Certificaciones con `payment_status` derivado (AR/cobranzas) | 1 | Sí |
| R-CERT-02 | Certificado vs venta presupuestada | OP | Por partida WBS: venta presup. vs acum. certificado | 1 | Sí |
| R-CERT-03 | Pendiente de certificar | OP | Partidas con venta presup. y saldo pendiente | 1 | Sí |
| R-AP-01 | Desvío compras por partida | OP | APU **MATERIAL** vs comprometido/devengado por `wbsNodeId` | 1 | Sí |
| R-AP-02 | Líneas sin imputación WBS | OP | Líneas OC / factura con `wbsNodeId` null | 1 | Sí |
| R-AP-03 | Resumen por proveedor | OP | Comprometido / devengado / pagado / OC abierta (ext. R-009) | 1 | Sí |
| R-SCC-01 | Evolución cert. subcontrato | OP | Serie mensual certificado vs pagado | 1 | Sí |
| R-SCC-02 | Contratado vs certificado | OP | Por `Subcontract` y por partida SUB del APU | 1 | Sí |
| R-SUB-01 | Brecha SUB sin contrato | OP | Partidas con APU sub y sin `Subcontract` ACTIVE; wizard desde reporte | 1 | Completo |
| R-SUB-02 | Varianza SUB por partida | OP | Presup. sub vs contratado / certificado | 1 | Sí |
| R-MAT-01 | Consumo vs presupuesto material | INV / OP | Consumo/stock vs baseline MAT | 2 | Completo — UI `/proyectos/[id]/materiales?tab=varianza` |
| R-MAT-02 | APU material sin producto | INV | Líneas MAT sin `product_id` | 2 | Completo — misma página materiales |

### Hub caja y rentabilidad (Phase E)

| ID | Nombre | Impl. | Ruta UI |
|----|--------|-------|---------|
| R-005 | Cashflow real | Sí (detalle + hub) | `/reportes/caja`, `/flujo-caja` |
| R-006 | Proyección de caja | Sí | `/reportes/caja` |
| R-003 | Rentabilidad bruta | Sí | `/reportes/rentabilidad` |
| R-004 | Rentabilidad neta | Completo (GG manual + % empresa [D-040]) | `/reportes/rentabilidad` |
| — | Ingresos vs gastos | Sí | `/reportes/ingresos-gastos` |

**R-001 / EDT ([D-098] · [D-099]):** tablero único `/proyectos/[id]/control-costos` — capas de costo, composición APU (torta) + **gasto por tipo** (barras Presup/Devengado/Exposición), presets de columnas (incl. % y cantidades), expand por `CostCategory` en partidas hoja, **filtro por tipo de costo** (query `?costType=MATERIAL|LABOR|EQUIPMENT|SUBCONTRACT|OTHER`) que reemplaza importes y totales por el bucket y se propaga al CSV/PDF. La ruta `presupuesto-vs-real` redirige acá.

### Hub reportes empresa ([D-098])

UI `/reportes` agrupada en **Financieros** (rentabilidad multi-obra, aging, flujo de caja, GG) y **Operativos** (portafolio, compras multi-obra, inventario).

| ID | Nombre | Impl. | Ruta UI |
|----|--------|-------|---------|
| R-PORT | Portafolio de proyectos | Sí | `/reportes/portafolio` (CSV / Excel / PDF) |
| R-RENT-M | Rentabilidad multi-obra | Sí | `/reportes/rentabilidad-multi-obra` (CSV / Excel / PDF) |
| R-007/8 | Aging CxC / CxP | Sí (link) | `/finanzas/cuentas-por-cobrar` · `/finanzas/cuentas-por-pagar` |
| R-005/6 | Flujo caja consolidado | Sí (link) | `/tesoreria/flujo-caja` |
| R-014 | Inventario | Sí (link) | `/inventario` |
| R-GG | Gastos generales por proyecto | Sí | `/reportes/gastos-generales-por-proyecto` (CSV / Excel / PDF) |
| R-010 | Compras multi-obra | Sí | `/reportes/compras-multi-obra` (CSV / Excel / PDF) |

Ver [`TENANT_REPORTS_HUB.md`](../08-architecture/TENANT_REPORTS_HUB.md).

### Contabilidad GL (Phase 11F) — [D-062]

| ID | Nombre | Impl. | Ruta UI | API export |
|----|--------|-------|---------|------------|
| R-GL-01 | Sumas y saldos | Sí | `/contabilidad/sumas-y-saldos` | `/api/reports/contabilidad/sumas-y-saldos` |
| R-GL-02 | Libro diario | Sí | `/contabilidad/libro-diario` | `/api/reports/contabilidad/libro-diario` |
| R-GL-03 | Mayor por cuenta | Sí | `/contabilidad/cuentas/[accountId]` | `/api/reports/contabilidad/mayor` |
| R-GL-04 | Situación patrimonial (ESP) | Sí | `/contabilidad/situacion-patrimonial` | `/api/reports/contabilidad/estado-situacion` |
| R-GL-05 | Estado de resultados (EERR) | Sí | `/contabilidad/estado-resultados` | `/api/reports/contabilidad/estado-resultados` |

Solo asientos `POSTED`; saldos naturales; multi-moneda por bloque; gerencial (no AFIP/inflación). Gate: `VIEW ACCOUNTING` + módulo ACCOUNTING.

## Filtros globales estándar
`date_from`, `date_to`, `project_id`, `currency_view` (original | ARS), `company_id` (futuro [Q-001]).

## Rutas API proyecto (CSV / JSON)

| Reporte | Ruta |
|---------|------|
| R-001 (EDT) | `/api/reports/proyectos/[projectId]/control-costos.csv` (legacy `presupuesto-vs-real.csv` puede seguir existiendo) |
| R-012, R-CERT-* | `/api/reports/proyectos/[projectId]/certificaciones.csv` |
| R-AP-01…03 | `/api/reports/proyectos/[projectId]/compras-proveedores.csv` |
| R-SCC-*, R-SUB-* | `/api/reports/proyectos/[projectId]/subcontratos.csv` |
| Control costos (detalle) | `/api/reports/proyectos/[projectId]/control-costos.csv` |
| R-005 | `/api/reports/proyectos/[projectId]/flujo-caja.csv` |

## Rutas API tesorería (CSV)

| Reporte | Ruta |
|---------|------|
| R-020 | `/api/reports/tesoreria/conciliacion.csv` |
| Movimientos | `/api/reports/tesoreria/movimientos.csv` |
| Flujo de caja | `/api/reports/tesoreria/flujo-caja.csv` |
| Posición de caja | `/api/reports/tesoreria/posicion-caja.csv` |

## Referencias
- [`EXPORT_FORMATS.md`](./EXPORT_FORMATS.md)
- [`../08-architecture/REPORTING_ARCHITECTURE.md`](../08-architecture/REPORTING_ARCHITECTURE.md)
