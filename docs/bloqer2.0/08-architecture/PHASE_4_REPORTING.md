# Phase 4 — Procurement, inventory, reporting & dashboards

> El archivo se llama `PHASE_4_REPORTING.md` pero la fase cubre **compras, inventario, almacenes, reportes y dashboards** según el roadmap acordado.

## Objetivos

- Completar **procurement**: OC, recepciones, facturas de compra vinculadas a AP ([D-020](../00-product/DECISION_LOG.md)).  
- **Subcontratos** y certificaciones de subcontrato con AP en **APPROVED** y `settlement_status` derivado ([D-027](../00-product/DECISION_LOG.md), [D-028](../00-product/DECISION_LOG.md)).  
- **Inventario**: depósitos, productos, movimientos, reservas ([D-022](../00-product/DECISION_LOG.md)).  
- **Reportes** del catálogo prioritario y **dashboards** con datos servidor + Recharts ([`REPORTING_ARCHITECTURE.md`](./REPORTING_ARCHITECTURE.md), [`REPORTING_DATA_MODEL.md`](./REPORTING_DATA_MODEL.md)).

## Módulos incluidos

| Módulo | Docs |
|---|---|
| Procurement | [`PROCUREMENT.md`](../02-modules/PROCUREMENT.md), [`PURCHASE_ORDERS_AND_RECEIPTS.md`](../02-modules/PURCHASE_ORDERS_AND_RECEIPTS.md) |
| Subcontracts | [`SUBCONTRACTS.md`](../02-modules/SUBCONTRACTS.md), [`SUBCONTRACTORS.md`](../02-modules/SUBCONTRACTORS.md) |
| Inventory | [`INVENTORY.md`](../02-modules/INVENTORY.md), [`WAREHOUSES.md`](../02-modules/WAREHOUSES.md) |
| Bank reconciliation (mínimo / sesión) | [`BANK_RECONCILIATION.md`](../02-modules/BANK_RECONCILIATION.md), [D-032](../00-product/DECISION_LOG.md) |
| Reporting | [`../06-reports/`](../06-reports/), [`REPORTING.md`](../02-modules/REPORTING.md) |
| Dashboard KPIs | [`DASHBOARD_KPI_FORMULAS.md`](../04-formulas/DASHBOARD_KPI_FORMULAS.md), [`COST_FORMULAS.md`](../04-formulas/COST_FORMULAS.md) |

## Dependencias

- **Phase 3**: AP/pagos y ledger para cerrar compras → pagos.  
- **Phase 2**: proyecto y WBS para imputar líneas de OC/factura.

## Entregables

- Flujo OC → recepción (parcial) → factura compra → `payable`.  
- Compra directa sin OC según spec ([D-006](../00-product/DECISION_LOG.md)).  
- Stock: ingreso desde recepción confirmada, egreso, transferencia entre depósitos (par), reserva con estados §25.  
- Subcontrato `ACTIVE` + certificación + pago aplicando a AP originada en certificación.  
- Reportes exportables (XLSX/PDF según [`EXPORT_FORMATS`](../06-reports/EXPORT_FORMATS.md) cuando exista implementación).  
- Dashboard ejecutivo mínimo: KPIs alimentados **solo** desde servidor.

## Criterios de aceptación

- [ ] Anti–doble conteo en vistas “comprometido / devengado / pagado” ([BR-COS-002](../01-domain/BUSINESS_RULES.md)).  
- [ ] Reportes que muestran dinero **reconcilian** con fuentes (`account_movement`, `receivable`, etc.).  
- [ ] `SubcontractCertification` rechazada: sucesión por `replaces_certification_id` ([BR-SUB-005](../01-domain/BUSINESS_RULES.md)).  
- [ ] Índices multitenant en listados pesados ([`INDEXING_STRATEGY.md`](./INDEXING_STRATEGY.md)).

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Scope explosion en reportes | Priorizar R-xxx del [`REPORT_CATALOG`](../06-reports/REPORT_CATALOG.md); MV después |
| Inventario + compras en paralelo | Secuencia: recepción → stock IN primero; ajustes después |

## Qué NO hacer todavía

- Query builder visual completo ([Q-010](../00-product/OPEN_QUESTIONS.md)) puede quedar Phase 5+.  
- Importación bancaria CSV/OFX masiva ([Q-007](../00-product/OPEN_QUESTIONS.md)) puede ser sub-fase.  
- No bloquear Phase 4 por Gantt perfecto — adapter + lista/hitos.

## Prompts sugeridos (IA)

```
Lee PURCHASE_ORDERS_AND_RECEIPTS.md y COST_FORMULAS §1.
Implementá confirmReceipt que crea stock_movement IN por línea con warehouse_id.
Transacción única; tenant isolation tests.
```

```
Lee REPORT_CATALOG.md elige 3 reportes prioritarios.
Implementá endpoints de solo lectura con mismo service read-layer; sin agregar lógica financiera en el cliente.
```

## Referencias

- Anterior: [`PHASE_3_FINANCE_TREASURY.md`](./PHASE_3_FINANCE_TREASURY.md)  
- Siguiente: [`PHASE_5_HARDENING.md`](./PHASE_5_HARDENING.md)
