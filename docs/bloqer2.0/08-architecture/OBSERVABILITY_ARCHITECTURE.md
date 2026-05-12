# Observability architecture — Bloqer 2.0

## Decisión

Instrumentar la aplicación con **logs estructurados**, **métricas** de latencia y errores, y **trazas** cuando el proveedor lo permita (p. ej. integración Vercel / OpenTelemetry). Cada request debe poder correlacionarse con **`tenant_id`**, **`user_id`**, y **operación de negocio** (sin PII innecesaria en logs).

## Justificación para Bloqer 2.0

- ERP financiero: fallos en **cobranzas, pagos o ledger** requieren diagnóstico rápido ([`../03-finance/TREASURY_MODEL.md`](../03-finance/TREASURY_MODEL.md)).
- **Jobs** ([`BACKGROUND_JOBS_ARCHITECTURE.md`](./BACKGROUND_JOBS_ARCHITECTURE.md)) necesitan visibilidad de corridas y fallos.
- **Multitenancy** exige detectar patrones anómalos (errores concentrados en un tenant).

## Problemas que evita

- **Debug** solo en producción vía `console.log` no estructurado.
- **Incidents** sin correlación entre email fallido, job y mutación de AR.

## Qué NO hacer

- No loguear **tokens**, **secrets**, **números de tarjeta**, ni payloads completos de documentos.
- No depender solo de **logs del navegador** para incidentes de servidor.
- No crear **alertas** sin dueño (OWNER/FINANCE) alineado a severidad de negocio.

## Eventos y auditoría (separación)

- **Observabilidad técnica** (metrics/traces) complementa pero **no reemplaza** [`../02-modules/AUDIT_LOG.md`](../02-modules/AUDIT_LOG.md) y [`../07-non-functional/AUDIT_AND_TRACEABILITY.md`](../07-non-functional/AUDIT_AND_TRACEABILITY.md).

## Referencias funcionales

- [`../07-non-functional/AUDIT_AND_TRACEABILITY.md`](../07-non-functional/AUDIT_AND_TRACEABILITY.md)
- [`../07-non-functional/NON_FUNCTIONAL_REQUIREMENTS.md`](../07-non-functional/NON_FUNCTIONAL_REQUIREMENTS.md)
- [`../02-modules/AUDIT_LOG.md`](../02-modules/AUDIT_LOG.md)

## Documentos técnicos relacionados

- [`SECURITY_ARCHITECTURE.md`](./SECURITY_ARCHITECTURE.md)
- [`BACKGROUND_JOBS_ARCHITECTURE.md`](./BACKGROUND_JOBS_ARCHITECTURE.md)
