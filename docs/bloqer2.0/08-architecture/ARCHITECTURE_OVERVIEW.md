# Architecture overview — Bloqer 2.0

## Decisión

Construir **Bloqer 2.0** como **modular monolith** desplegado en **Vercel**, con **Next.js App Router** (UI + server runtime), **PostgreSQL (Neon)**, **Prisma** como capa de acceso a datos, y **lógica de negocio obligatoria en un service layer** del servidor. El frontend **no** es fuente de verdad para montos, saldos ni transiciones de estado críticas.

## Justificación para Bloqer 2.0

- El dominio es **denso en reglas** (presupuesto, certificaciones, AR/AP, tesorería, stock, subcontratos). Un monolito modular con límites claros reduce costo cognitivo frente a microservicios prematuros ([`../00-product/PRODUCT_SCOPE.md`](../00-product/PRODUCT_SCOPE.md)).
- **Multitenancy desde día 1** ([`../00-product/DECISION_LOG.md`](../00-product/DECISION_LOG.md) D-001) exige un solo modelo mental de aislamiento en queries y servicios.
- **Trazabilidad financiera y auditoría** ([`../02-modules/AUDIT_LOG.md`](../02-modules/AUDIT_LOG.md), [`../03-finance/ACCOUNT_MOVEMENTS.md`](../03-finance/ACCOUNT_MOVEMENTS.md)) favorece transacciones y efectos colocalizados, con jobs explícitos para recálculos ([`../01-domain/EVENTS_AND_AUTOMATIONS.md`](../01-domain/EVENTS_AND_AUTOMATIONS.md)).

## Problemas que evita

- **Doble fuente de verdad** entre UI y servidor en dinero y estados.
- **Reglas dispersas** en componentes React o en API routes “delgadas” sin servicios.
- **Complejidad operativa** de N servicios, N despliegues y consistencia distribuida sin necesidad de escala extremo.
- **Deuda de seguridad** por olvidar `tenant_id` en algún camino de código.

## Qué NO hacer

- No introducir **microservicios** para módulos de negocio en la fase inicial.
- No usar el cliente para **validar** o **calcular** reglas financieras críticas; como mucho, **prevalidación UX** con los mismos esquemas (Zod) que el servidor rechazará de todas formas.
- No duplicar **fórmulas** de [`../04-formulas/`](../04-formulas/) en el bundle del navegador como “fuente principal”.
- No modelar **eventos de dominio** solo en el frontend; los eventos documentados viven en servidor/jobs ([`../01-domain/EVENTS_AND_AUTOMATIONS.md`](../01-domain/EVENTS_AND_AUTOMATIONS.md)).

## Referencias funcionales clave

| Tema | Documento |
|---|---|
| Principios de producto | [`../00-product/PRODUCT_PRINCIPLES.md`](../00-product/PRODUCT_PRINCIPLES.md) |
| Visión de dominio | [`../01-domain/DOMAIN_OVERVIEW.md`](../01-domain/DOMAIN_OVERVIEW.md) |
| Reglas globales | [`../01-domain/BUSINESS_RULES.md`](../01-domain/BUSINESS_RULES.md) |
| Estados | [`../01-domain/STATE_MACHINES.md`](../01-domain/STATE_MACHINES.md) |
| Dinero | [`../03-finance/MONEY_MODEL.md`](../03-finance/MONEY_MODEL.md) |
| No-funcional | [`../07-non-functional/`](../07-non-functional/) |

## Documentos técnicos relacionados

- [`TECH_STACK.md`](./TECH_STACK.md)
- [`MODULAR_MONOLITH.md`](./MODULAR_MONOLITH.md)
- [`BACKEND_LAYERING.md`](./BACKEND_LAYERING.md)
- [`SERVICE_LAYER.md`](./SERVICE_LAYER.md)
- [`FRONTEND_ARCHITECTURE.md`](./FRONTEND_ARCHITECTURE.md)
