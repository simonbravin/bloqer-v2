# Requisitos no funcionales — Bloqer 2.0

## 1. Rendimiento (objetivos orientativos)
- Pantallas de consulta principales < **2 s** p95 con dataset típico constructora mediana.
- Export reportes medianos (<50k filas) < **60 s** síncrono o job async.

## 2. Disponibilidad
- Objetivo **99.5%** mensual SaaS (fuera de ventanas mantenimiento anunciadas).

## 3. Escalabilidad
- Modelo multi-tenant horizontal: crecer por nuevos tenants sin degradación lineal.

## 4. Observabilidad
- Logs estructurados, traces request-id, métricas negocio (eventos contados).

## 5. Backup y recuperación
- Backups diarios con retención configurable; RPO/RTO definidos en operaciones ([Fase implementación]).

## 6. Cumplimiento legal (Argentina)
- Residencia datos según oferta comercial; export para usuario ([LGPD-style derechos] evaluar).

## 7. Accesibilidad
- WCAG **AA** como objetivo en UI (fase front).

## Referencias cruzadas
- [`MULTITENANCY.md`](./MULTITENANCY.md)
- [`SECURITY_AND_COMPLIANCE.md`](./SECURITY_AND_COMPLIANCE.md)
- [`AUDIT_AND_TRACEABILITY.md`](./AUDIT_AND_TRACEABILITY.md)
