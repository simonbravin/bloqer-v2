# Phase 5 — Hardening

## Objetivos

Endurecer el sistema para **producción**: cobertura de tests, revisión de permisos y auditoría, performance e índices, observabilidad, seguridad operativa, pipeline de deploy estable ([`DEPLOYMENT_PLAN.md`](./DEPLOYMENT_PLAN.md)).

## Módulos / áreas incluidas

Transversal: todos los módulos ya implementados; foco en **calidad y operaciones**.

## Dependencias

- Phases **0–4** con funcionalidad acordada para release objetivo.  
- [`TESTING_STRATEGY.md`](./TESTING_STRATEGY.md), [`OBSERVABILITY_ARCHITECTURE.md`](./OBSERVABILITY_ARCHITECTURE.md), [`SECURITY_ARCHITECTURE.md`](./SECURITY_ARCHITECTURE.md).

## Entregables

- Suite CI: lint, typecheck, tests unit + integration críticos.  
- E2E mínimos para login + flujo financiero corto ([`TESTING_STRATEGY.md`](./TESTING_STRATEGY.md)).  
- Revisión matriz permisos vs rutas reales.  
- Revisión `audit_log` cobertura vs [`AUDIT_LOG.md`](../02-modules/AUDIT_LOG.md).  
- Índices aplicados según [`INDEXING_STRATEGY.md`](./INDEXING_STRATEGY.md); `EXPLAIN` en queries lentas típicas.  
- Logs estructurados + correlación request; alertas básicas (error rate).  
- Runbook deploy y rollback ([`DEPLOYMENT_PLAN.md`](./DEPLOYMENT_PLAN.md)).  
- Pentest ligero / checklist seguridad OWASP ASVS reducido.

## Criterios de aceptación

- [ ] [`CODE_REVIEW_CHECKLIST.md`](./CODE_REVIEW_CHECKLIST.md) aplicable en cada PR release candidate.  
- [ ] No hay endpoint crítico sin test de tenant isolation.  
- [ ] TTFB / tiempos de reporte aceptables en datos de prueba realistas (umbrales definidos por equipo).  
- [ ] Variables secretas solo en entorno Vercel/hosting; rotación documentada.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Tests lentos | DB de test en CI con paralelización por suite |
| Falsa sensación de “terminado” | Definition of Done por módulo en [`MVP_TECHNICAL_SCOPE.md`](./MVP_TECHNICAL_SCOPE.md) |

## Qué NO hacer todavía

- No optimizar prematuramente sin métricas ([`OBSERVABILITY_ARCHITECTURE.md`](./OBSERVABILITY_ARCHITECTURE.md)).  
- No introducir microservicios “por escala” sin métricas de carga.

## Prompts sugeridos (IA)

```
Lee TESTING_STRATEGY.md y lista gaps vs código actual.
Generá plan de tests por paquete sin escribir código en esta sesión.
```

```
Lee INDEXING_STRATEGY.md y REPORTING_DATA_MODEL.md.
Proponé 5 índices compuestos tenant-first con justificación por REPORT_CATALOG.
```

```
Auditá rutas en apps/web contra PERMISSIONS_MATRIX.md.
Reportá gaps como tabla markdown.
```

## Referencias

- Anterior: [`PHASE_4_REPORTING.md`](./PHASE_4_REPORTING.md)  
- [`RISK_REGISTER.md`](./RISK_REGISTER.md)
