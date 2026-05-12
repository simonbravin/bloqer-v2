# Implementation roadmap — Bloqer 2.0

> Plan técnico por fases para construir el producto **desde cero** con Claude Code / Cursor.  
> Alineado a la filosofía de producto: **producto completo por bloques ordenados** ([`../00-product/PRODUCT_SCOPE.md`](../00-product/PRODUCT_SCOPE.md) §1–2), sin “MVP recortado” comercial — el orden es **de implementación**, no de venta.

## Decisión

Implementar en **6 fases numeradas 0–5**: setup → fundación → operaciones núcleo → finanzas/tesorería → compras/inventario/reportes → endurecimiento y deploy maduro.

## Qué construir primero (recomendación)

**Empezar por Phase 0**, inmediatamente seguida de **Phase 1**. Sin tenant + auth + DB scoped + layout, cada módulo posterior duplica riesgo de refactor y fugas de datos.

**Dentro del trabajo paralelo posible:** tras Phase 1, priorizar **Directory → Projects → Budgets** antes que certificaciones completas, porque las certificaciones dependen de presupuesto aprobado/cerrado y WBS ([`../01-domain/ENTITY_RELATIONSHIPS.md`](../01-domain/ENTITY_RELATIONSHIPS.md)).

## Visión por fase

| Fase | Documento | Enfoque |
|---|---|---|
| 0 | [`PHASE_0_PROJECT_SETUP.md`](./PHASE_0_PROJECT_SETUP.md) | Repo, tooling, carpetas, env, docs enlazados |
| 1 | [`PHASE_1_FOUNDATION.md`](./PHASE_1_FOUNDATION.md) | Auth, tenancy, usuarios, permisos, auditoría, DB base, shell UI |
| 2 | [`PHASE_2_CORE_OPERATIONS.md`](./PHASE_2_CORE_OPERATIONS.md) | Directorio, proyectos, presupuestos, contratos, certificaciones, documentos |
| 3 | [`PHASE_3_FINANCE_TREASURY.md`](./PHASE_3_FINANCE_TREASURY.md) | Cuentas, ledger, AR/AP, cobranzas/pagos, transferencias, cashflow, cierre |
| 4 | [`PHASE_4_REPORTING.md`](./PHASE_4_REPORTING.md) | Compras, inventario, warehouse, reportes y dashboards |
| 5 | [`PHASE_5_HARDENING.md`](./PHASE_5_HARDENING.md) | Tests, performance, observabilidad, endurecimiento deploy |

## Alcance MVP técnico

Ver [`MVP_TECHNICAL_SCOPE.md`](./MVP_TECHNICAL_SCOPE.md): define **qué debe estar cerrado** antes del primer uso interno/piloto, sin contradecir el scope funcional Fase 1 del producto.

## Riesgos globales

Ver [`RISK_REGISTER.md`](./RISK_REGISTER.md). Deploy operativo: [`DEPLOYMENT_PLAN.md`](./DEPLOYMENT_PLAN.md).

## Documentos de referencia obligatorios por cualquier fase

- [`SERVICE_LAYER.md`](./SERVICE_LAYER.md), [`MULTITENANCY_ARCHITECTURE.md`](./MULTITENANCY_ARCHITECTURE.md), [`TECHNICAL_ERD.md`](./TECHNICAL_ERD.md)  
- [`AGENT_GUARDRAILS.md`](./AGENT_GUARDRAILS.md), [`AI_DEVELOPMENT_WORKFLOW.md`](./AI_DEVELOPMENT_WORKFLOW.md)  
- [`PENDING_ARCHITECTURE_ITEMS.md`](./PENDING_ARCHITECTURE_ITEMS.md) — cerrar ítems bloqueantes antes de schema definitivo.

## Qué NO hacer en ninguna fase

- Implementar **sin** leer el módulo funcional correspondiente en `docs/bloqer2.0/`.  
- Violar [`DECISION_LOG.md`](../00-product/DECISION_LOG.md).  
- Adelantar **microservicios**, segundo datastore operativo, o reglas financieras solo en frontend.
