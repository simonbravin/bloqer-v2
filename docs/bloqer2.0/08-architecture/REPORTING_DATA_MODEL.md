# Reporting data model — Bloqer 2.0

## Decisión

En **Fase 1**, los reportes se alimentan de **consultas SQL directas** sobre tablas fuente (`account_movement`, `receivable`, `payable`, `purchase_order`, `budget`, …) con **filtros `tenant_id`** y permisos en servidor. **No** se introduce data warehouse obligatorio. Opcionalmente se agregan **vistas SQL** (`VIEW`) para encapsular joins repetidos.

## Reportes que típicamente salen de **queries normales**

| Reporte / necesidad | Tablas / fuentes |
|---|---|
| Aging AR/AP | `receivable`, `payable`, `contact`, `due_date`, aplicaciones |
| Extracto de cuenta | `account_movement` + `account` |
| Presupuesto vs ejecutado (una capa a la vez) | `cost_item`, agregados de OC, facturas, subcontrato según [`../04-formulas/COST_FORMULAS.md`](../04-formulas/COST_FORMULAS.md) |
| Certificaciones por período | `certification`, `project` |
| Stock por depósito | `stock_movement` agregado o snapshot + `warehouse` |
| Cobranzas / pagos del día | `collection`, `payment`, `account_movement` |

Estos deben **reconciliar** con el ledger: totales de caja vs suma de `account_movement` `CONFIRMED` en rango ([`REPORTING_ARCHITECTURE.md`](./REPORTING_ARCHITECTURE.md)).

## Casos que probablemente requieran **VIEW** o **materialized view (MV)** más adelante

| Caso | Por qué |
|---|---|
| Dashboard ejecutivo multi-join | Muchos joins proyecto + finanzas + costos |
| KPI “exposición esperada” por proyecto | Agregaciones pesadas con anti–doble conteo ([BR-COS-002](../01-domain/BUSINESS_RULES.md)) |
| `payment_status` / `settlement_status` materializados | Recalcular en cada lista puede ser caro |
| Libro mayor analítico por WBS | Grandes volúmenes |

**MV:** refresco **tras eventos** de negocio o job nocturno; riesgo de **staleness** — documentar en UI (“datos al …”).

## Derivados de certificación / subcontrato

- `payment_status` (certificación cliente): ver [`MONEY_AND_DECIMAL_STRATEGY.md`](./MONEY_AND_DECIMAL_STRATEGY.md).  
- `settlement_status` (subcontrato): idem.  
- Opciones: **vista** `certification_with_payment_derived` o tabla `certification_derived` actualizada por servicio al confirmar cobranza/pago.

## Problemas que evita

- **KPIs** calculados solo en cliente.  
- Inconsistencia entre módulo operativo y “BI” sin linaje de datos.

## Qué NO hacer

- No crear **copia silenciosa** de todo el ERP en tablas de reporte sin estrategia de refresco.  
- No usar MV como **única** fuente de verdad para saldos en tiempo real de cobranza.  
- No inventar **star schema** completo antes de necesidad ([`../00-product/OPEN_QUESTIONS.md`](../00-product/OPEN_QUESTIONS.md) Q-010).

## Referencias

- [`../06-reports/REPORT_CATALOG.md`](../06-reports/REPORT_CATALOG.md)  
- [`../04-formulas/DASHBOARD_KPI_FORMULAS.md`](../04-formulas/DASHBOARD_KPI_FORMULAS.md)  
- [`REPORTING_ARCHITECTURE.md`](./REPORTING_ARCHITECTURE.md)
- [`REPORTING_ERD_GUARDRAILS.md`](./REPORTING_ERD_GUARDRAILS.md) — checklist y tablas fuente vs prohibidas (ADR-010)
