# Catálogo maestro de reportes

## Leyenda
- **Área:** OP | FIN | INV | PRJ
- **Fase:** 1 | 2 | 3

| ID | Nombre | Área | Descripción breve | Fase |
|---|---|---|---|---|
| R-001 | Presupuesto vs real (ítem) | OP | Comparativo presupuesto vs real; vistas: comprometido / devengado / pagado / exposición esperada (`expected_cost_exposure`, [BR-COS-001]) | 1 |
| R-002 | Avance físico/económico/financiero | PRJ | Tres curvas por proyecto | 1 |
| R-003 | Rentabilidad bruta por proyecto | FIN | MB y MB% (costo según vista etiquetada: devengado / pagado / exposición esperada, [BR-COS-001]) | 1 |
| R-004 | Rentabilidad neta por proyecto | FIN | MN y MN% (misma convención de capa de costo que R-003) | 1 |
| R-005 | Cashflow real | FIN | Ingresos−egresos por período (**solo caja**; no costo comprometido/devengado) | 1 |
| R-006 | Proyección de caja | FIN | Saldo + cobros/pagos esperados por AR/AP (**liquidez**; no suma OC abiertas salvo política) | 1 |
| R-007 | Aging cuentas por cobrar | FIN | Buckets por cliente/proyecto | 1 |
| R-008 | Aging cuentas por pagar | FIN | Buckets por proveedor | 1 |
| R-009 | Compras por proveedor | OP | Monto y documentos; capas comprometido/devengado/pagado según [`COST_FORMULAS.md`](../04-formulas/COST_FORMULAS.md) | 1 |
| R-010 | Compras multi-proyecto | OP | Matriz proyecto × proveedor (misma convención anti doble conteo) | 1 |
| R-011 | Materiales más caros | OP | Ranking por variación precio o monto | 1 |
| R-012 | Evolución certificaciones | PRJ | Serie mensual certificado / facturado / cobrado: **facturado** = existe `SalesInvoice`/`Receivable` vinculada ([BR-CERT-007]); cobrado vía AR+tesorería; `payment_status` derivado; columnas no usan `INVOICED` como estado de certificación | 1 |
| R-013 | Materiales por proyecto | INV / OP | Consumo/stock imputado | 1 |
| R-014 | Inventario valorizado | INV | Por depósito y consolidado | 1 |
| R-015 | Libro de obra export | PRJ | PDF parte diarios | 1 |
| R-016 | Directorio de contactos | OP | Export maestro | 1 |
| R-017 | Auditoría de movimientos | FIN | Log filtrable | 1 |
| R-018 | Query builder ad-hoc | ALL | Filtros + columnas ([Q-010]) | 1 |
| R-019 | Dashboard ejecutivo | FIN | KPIs consolidados | 1 |
| R-020 | Conciliación bancaria | FIN | Estado por cuenta/mes | 1 |

## Filtros globales estándar
`date_from`, `date_to`, `project_id`, `currency_view` (original | ARS), `company_id` (futuro [Q-001]).

## Referencias
- [`EXPORT_FORMATS.md`](./EXPORT_FORMATS.md)
