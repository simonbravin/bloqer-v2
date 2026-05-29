# Bloqer 2.0 — Arquitectura técnica (capa 08)

> **Estado:** Primera capa de arquitectura técnica, alineada a la especificación funcional en `docs/bloqer2.0/`.  
> **No incluye:** código fuente, schema Prisma, ni contratos de API detallados.

## Propósito

Traducir la **fuente de verdad funcional** (producto, dominio, finanzas, fórmulas, workflows) en **decisiones de implementación** para un solo producto SaaS multitenant: modular monolith, service layer estricto, trazabilidad financiera y reportes reconciliables.

## Cómo leer esta carpeta

1. [`ARCHITECTURE_OVERVIEW.md`](./ARCHITECTURE_OVERVIEW.md) — mapa mental y principios.
2. [`TECH_STACK.md`](./TECH_STACK.md) — stack preferido y límites.
3. [`MODULAR_MONOLITH.md`](./MODULAR_MONOLITH.md) — límites de módulos dentro del monolito.
4. [`BACKEND_LAYERING.md`](./BACKEND_LAYERING.md) + [`SERVICE_LAYER.md`](./SERVICE_LAYER.md) — dónde vive la lógica de negocio.
5. [`FRONTEND_ARCHITECTURE.md`](./FRONTEND_ARCHITECTURE.md) — UI, datos y prohibiciones.
6. [`MULTITENANCY_ARCHITECTURE.md`](./MULTITENANCY_ARCHITECTURE.md) — aislamiento por `tenant_id`.
7. [`AUTH_ARCHITECTURE.md`](./AUTH_ARCHITECTURE.md) — identidad y sesión.
8. [`FILE_STORAGE_ARCHITECTURE.md`](./FILE_STORAGE_ARCHITECTURE.md) — documentos y adjuntos.
9. [`EMAIL_NOTIFICATIONS_ARCHITECTURE.md`](./EMAIL_NOTIFICATIONS_ARCHITECTURE.md) — Resend + React Email.
10. [`I18N_STRATEGY.md`](./I18N_STRATEGY.md) — inglés en código, es-AR en UI.
11. [`REPORTING_ARCHITECTURE.md`](./REPORTING_ARCHITECTURE.md) — KPIs y reconciliación.
11b. [`REPORTING_ERD_GUARDRAILS.md`](./REPORTING_ERD_GUARDRAILS.md) — checklist Prisma, baseline vs ejecución (ADR-010).
12. [`BACKGROUND_JOBS_ARCHITECTURE.md`](./BACKGROUND_JOBS_ARCHITECTURE.md) — jobs y eventos programados.
13. [`OBSERVABILITY_ARCHITECTURE.md`](./OBSERVABILITY_ARCHITECTURE.md) — logs, métricas, trazas.
14. [`SECURITY_ARCHITECTURE.md`](./SECURITY_ARCHITECTURE.md) — amenazas y controles.
15. [`ARCHITECTURE_DECISION_RECORDS.md`](./ARCHITECTURE_DECISION_RECORDS.md) — ADRs iniciales e índice.

### Modelo de datos / ERD técnico (PostgreSQL · listo para Prisma, sin schema)

16. [`TECHNICAL_ERD.md`](./TECHNICAL_ERD.md) — ERD técnico alto nivel (Mermaid), integridad.  
17. [`DATA_MODEL_OVERVIEW.md`](./DATA_MODEL_OVERVIEW.md) — Dominios; **Tenant / Company / legal entity**; alternativas Q-001.  
18. [`DATABASE_CONVENTIONS.md`](./DATABASE_CONVENTIONS.md) — Nombres, tipos SQL, idioma.  
19. [`TENANT_ISOLATION_MODEL.md`](./TENANT_ISOLATION_MODEL.md) — `tenant_id`, excepciones, `company_id`.  
20. [`ENTITY_ID_STRATEGY.md`](./ENTITY_ID_STRATEGY.md) — UUID, numeración humana.  
21. [`MONEY_AND_DECIMAL_STRATEGY.md`](./MONEY_AND_DECIMAL_STRATEGY.md) — NUMERIC, FX, derivados.  
22. [`ENUM_STRATEGY.md`](./ENUM_STRATEGY.md) — Enums técnicos en inglés.  
23. [`AUDIT_FIELDS_STRATEGY.md`](./AUDIT_FIELDS_STRATEGY.md) — Campos de auditoría en filas.  
24. [`SOFT_DELETE_STRATEGY.md`](./SOFT_DELETE_STRATEGY.md) — Borrado vs anulación.  
25. [`LEDGER_TABLES_STRATEGY.md`](./LEDGER_TABLES_STRATEGY.md) — Ledger, AR/AP, pares.  
26. [`DOCUMENT_STORAGE_DATA_MODEL.md`](./DOCUMENT_STORAGE_DATA_MODEL.md) — Metadata + R2.  
27. [`REPORTING_DATA_MODEL.md`](./REPORTING_DATA_MODEL.md) — Queries vs vistas/MV.  
28. [`INDEXING_STRATEGY.md`](./INDEXING_STRATEGY.md) — Índices multitenant.  
29. [`MIGRATION_STRATEGY.md`](./MIGRATION_STRATEGY.md) — Migraciones Prisma/Neon.

### Repo, código y agentes (Prompt 3)

30. [`REPOSITORY_STRUCTURE.md`](./REPOSITORY_STRUCTURE.md) — Layout monorepo, flujo doc → código.  
31. [`PACKAGE_STRUCTURE.md`](./PACKAGE_STRUCTURE.md) — Paquetes y dependencias permitidas/prohibidas.  
32. [`DOMAIN_MODULE_STRUCTURE.md`](./DOMAIN_MODULE_STRUCTURE.md) — Carpetas por módulo de dominio.  
33. [`API_STRUCTURE.md`](./API_STRUCTURE.md) — Route Handlers vs Server Actions, idempotencia.  
34. [`FRONTEND_FEATURE_STRUCTURE.md`](./FRONTEND_FEATURE_STRUCTURE.md) — Features, tablas, Gantt adapter.  
35. [`CODING_STANDARDS.md`](./CODING_STANDARDS.md) — TS, dinero, Zod, services.  
36. [`AI_DEVELOPMENT_WORKFLOW.md`](./AI_DEVELOPMENT_WORKFLOW.md) — Flujo de trabajo con IA + prompts tipo.  
37. [`AGENT_GUARDRAILS.md`](./AGENT_GUARDRAILS.md) — Límites duros para agentes.  
38. [`TESTING_STRATEGY.md`](./TESTING_STRATEGY.md) — Pirámide y prioridades.  
39. [`CODE_REVIEW_CHECKLIST.md`](./CODE_REVIEW_CHECKLIST.md) — Checklist de PR.  
40. [`PENDING_ARCHITECTURE_ITEMS.md`](./PENDING_ARCHITECTURE_ITEMS.md) — **Pendientes técnicos** a cerrar (ERD, API, repo).  
41. [`SAAS_ONBOARDING_ARCHITECTURE.md`](./SAAS_ONBOARDING_ARCHITECTURE.md) — Alta primer tenant / trial SaaS (Phase 14A).

### Roadmap de implementación (Prompt 4)

42. [`IMPLEMENTATION_ROADMAP.md`](./IMPLEMENTATION_ROADMAP.md) — Visión por fases 0–5 y **qué construir primero**.  
43. [`MVP_TECHNICAL_SCOPE.md`](./MVP_TECHNICAL_SCOPE.md) — Primer hito piloto técnico.  
44. [`PHASE_0_PROJECT_SETUP.md`](./PHASE_0_PROJECT_SETUP.md) — Setup repo y tooling.  
45. [`PHASE_1_FOUNDATION.md`](./PHASE_1_FOUNDATION.md) — Auth, tenant, DB base.  
46. [`PHASE_2_CORE_OPERATIONS.md`](./PHASE_2_CORE_OPERATIONS.md) — Obra, presupuesto, certificaciones.  
47. [`PHASE_3_FINANCE_TREASURY.md`](./PHASE_3_FINANCE_TREASURY.md) — Ledger, AR/AP, cobranzas/pagos.  
48. [`PHASE_4_REPORTING.md`](./PHASE_4_REPORTING.md) — Compras, inventario, reportes, dashboards.  
49. [`PHASE_5_HARDENING.md`](./PHASE_5_HARDENING.md) — Tests, perf, observabilidad.  
50. [`DEPLOYMENT_PLAN.md`](./DEPLOYMENT_PLAN.md) — Entornos y despliegue.  
51. [`RISK_REGISTER.md`](./RISK_REGISTER.md) — Riesgos de implementación.

## Relación con la documentación funcional

- **Reglas y decisiones de producto:** [`../00-product/DECISION_LOG.md`](../00-product/DECISION_LOG.md), [`../01-domain/BUSINESS_RULES.md`](../01-domain/BUSINESS_RULES.md).
- **Entidades y estados:** [`../01-domain/CORE_ENTITIES.md`](../01-domain/CORE_ENTITIES.md), [`../01-domain/STATE_MACHINES.md`](../01-domain/STATE_MACHINES.md).
- **Dinero y ledger:** [`../03-finance/MONEY_MODEL.md`](../03-finance/MONEY_MODEL.md), [`../03-finance/TREASURY_MODEL.md`](../03-finance/TREASURY_MODEL.md).
- **Fórmulas:** [`../04-formulas/`](../04-formulas/) (no duplicar en frontend).

Si una decisión técnica **contradice** la especificación funcional, **primero** se actualiza la spec o el `DECISION_LOG`, **después** el código.
