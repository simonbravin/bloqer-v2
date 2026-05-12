# Frontend architecture — Bloqer 2.0

## Decisión

La UI en **Next.js App Router** consume datos vía **Server Components** donde sea posible, y **mutaciones** vía **Server Actions** (o equivalente server-first) con validación **Zod** compartida. **TanStack Table** para grillas; **shadcn/ui** + **Tailwind** para layout y controles; **Recharts** para dashboards. **Gantt** y vistas de cronograma se consumen solo a través de un **adapter** ([`TECH_STACK.md`](./TECH_STACK.md)).

## Justificación para Bloqer 2.0

- Muchas pantallas son **lecturas pesadas** (presupuesto, movimientos, certificaciones) con necesidad de **seguridad** y **tenant scope** en el servidor ([`../00-product/PERMISSIONS_MATRIX.md`](../00-product/PERMISSIONS_MATRIX.md)).
- **Constructor de reportes** y tablas operativas ([`../06-reports/`](../06-reports/)) se benefician de componentes de tabla maduros.
- Separar Gantt detrás de un adapter mitiga incertidumbre de producto ([`../00-product/OPEN_QUESTIONS.md`](../00-product/OPEN_QUESTIONS.md) Q-003, Q-004) sin acoplar el resto del frontend.

## Problemas que evita

- Exponer **queries sensibles** en el cliente.
- **Duplicar** reglas financieras “para UX” que luego divergen del servidor.
- **Bundles** innecesariamente grandes al traer lógica de dominio al navegador.

## Qué NO hacer

- **No calcular** saldos, `payment_status` derivado, `settlement_status`, exposición de costo, ni cashflow real **solo en el cliente** como verdad final ([`../04-formulas/`](../04-formulas/), [`../01-domain/BUSINESS_RULES.md`](../01-domain/BUSINESS_RULES.md)).
- **No confiar** en validación solo cliente para montos, fechas contables, o transiciones de estado ([`../01-domain/STATE_MACHINES.md`](../01-domain/STATE_MACHINES.md)).
- **No hardcodear** reglas de negocio en props de componentes (“si obra pública entonces…”) — eso vive en servidor / políticas centralizadas ([`../00-product/DECISION_LOG.md`](../00-product/DECISION_LOG.md) D-004).
- **No usar** strings de estado en español como valores de negocio en código cliente; labels vienen de i18n ([`I18N_STRATEGY.md`](./I18N_STRATEGY.md)).

## Patrones permitidos en UI

- **Formatting** de moneda y fechas para display (locale es-AR).
- **Optimistic UI** solo donde el servidor es idempotente y el error revierte claramente; **evitar** en pagos, cobranzas y asientos.
- **Client charts** con series ya agregadas en servidor o con endpoints de solo lectura dedicados ([`REPORTING_ARCHITECTURE.md`](./REPORTING_ARCHITECTURE.md)).

## Referencias funcionales

- Roles y permisos: [`../00-product/USER_ROLES.md`](../00-product/USER_ROLES.md), [`../00-product/PERMISSIONS_MATRIX.md`](../00-product/PERMISSIONS_MATRIX.md)
- Módulos UI por área: [`../02-modules/`](../02-modules/)
- Reportes: [`../06-reports/REPORT_CATALOG.md`](../06-reports/REPORT_CATALOG.md)

## Documentos técnicos relacionados

- [`SERVICE_LAYER.md`](./SERVICE_LAYER.md)
- [`AUTH_ARCHITECTURE.md`](./AUTH_ARCHITECTURE.md)
- [`I18N_STRATEGY.md`](./I18N_STRATEGY.md)
- [`REPORTING_ARCHITECTURE.md`](./REPORTING_ARCHITECTURE.md)
