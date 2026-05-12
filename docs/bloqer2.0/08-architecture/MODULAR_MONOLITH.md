# Modular monolith — Bloqer 2.0

## Decisión

Organizar el código como **un solo deployable** (monolito) con **módulos de dominio delimitados** (budgeting, certifications, treasury, inventory, etc.). Las dependencias entre módulos son **explícitas** (imports permitidos solo hacia capas compartidas o contratos internos). **No** hay microservicios de negocio en la fase inicial.

## Justificación para Bloqer 2.0

- Los workflows cruzan módulos con frecuencia ([`../05-workflows/`](../05-workflows/)): certificar → facturar → cobrar; comprar → recibir → pagar; subcontrato → AP → pago. Un monolito reduce latencia y complejidad de consistencia.
- Las **reglas financieras** y el **ledger** ([`../03-finance/TREASURY_MODEL.md`](../03-finance/TREASURY_MODEL.md)) se benefician de **transacciones locales** y servicios que orquestan varias tablas.
- El equipo puede mover más rápido con **un solo pipeline** (Vercel) y una base Neon.

## Problemas que evita

- **Sagas distribuidas** y fallos parciales entre servicios para casos que aún no lo requieren.
- **Duplicación de modelos** y DTOs entre “servicios” que en realidad comparten el mismo bounded context.
- **Debugging** fragmentado en múltiples logs y correlaciones cross-service.

## Qué NO hacer

- No crear **paquetes npm publicados** por cada módulo solo por ceremonia; primero carpetas con límites claros dentro del monorepo.
- No permitir que un módulo acceda **directamente** a tablas “internas” de otro módulo sin pasar por **servicios públicos** de ese módulo (ver [`SERVICE_LAYER.md`](./SERVICE_LAYER.md)).
- No usar “modular monolith” como excusa para **un solo archivo gigante** sin fronteras; los límites deben ser visibles en estructura de carpetas y reglas de importación (lint boundaries cuando existan).

## Líneas guía de modularización (sin código)

- **Módulo de dominio** ≈ carpeta con: servicios de aplicación, repositorios/queries, validaciones de entrada, mapeo a DTOs de UI.
- **Kernel compartido**: tipos de dinero, `tenant_id`, utilidades de fecha/FX según [`../03-finance/MULTI_CURRENCY_RULES.md`](../03-finance/MULTI_CURRENCY_RULES.md), errores de dominio.
- **Integración entre módulos**: preferir **llamadas a servicios** y **eventos de aplicación internos** (in-process) alineados a [`../01-domain/EVENTS_AND_AUTOMATIONS.md`](../01-domain/EVENTS_AND_AUTOMATIONS.md), no “callbacks” desde UI.

## Referencias funcionales

- Módulos operativos: [`../02-modules/`](../02-modules/)
- ERD funcional: [`../01-domain/ENTITY_RELATIONSHIPS.md`](../01-domain/ENTITY_RELATIONSHIPS.md)
- Eventos: [`../01-domain/EVENTS_AND_AUTOMATIONS.md`](../01-domain/EVENTS_AND_AUTOMATIONS.md)
- Decisión multitenancy: [`../00-product/DECISION_LOG.md`](../00-product/DECISION_LOG.md) D-001

## Documentos técnicos relacionados

- [`ARCHITECTURE_OVERVIEW.md`](./ARCHITECTURE_OVERVIEW.md)
- [`BACKEND_LAYERING.md`](./BACKEND_LAYERING.md)
- [`SERVICE_LAYER.md`](./SERVICE_LAYER.md)
