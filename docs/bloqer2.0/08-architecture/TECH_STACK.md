# Tech stack — Bloqer 2.0

## Decisión

Adoptar el stack preferido acordado:

| Capa | Elección |
|---|---|
| App web | **Next.js** (App Router), **React**, **TypeScript** |
| Estilos / UI | **Tailwind CSS**, **shadcn/ui** |
| Tablas densas | **TanStack Table** |
| Datos | **PostgreSQL** en **Neon**, **Prisma ORM** |
| Hosting | **Vercel** |
| Archivos | **Cloudflare R2** |
| Email | **Resend**, plantillas con **React Email** |
| Auth (primera opción) | **Auth.js / NextAuth** |
| Validación | **Zod** |
| Repo | **pnpm workspaces** |
| Monorepo tooling | **Turborepo** *si* el repo crece a varios paquetes con builds compartidos |
| Gráficos | **Recharts** |
| Gantt / planificación | **Kibo UI** (`gantt`, `calendar`, `kanban`) vía **adapters** en `apps/web/features/schedule/adapters/`; vistas MVP implementadas con el mismo contrato de datos (ADR-007) |

## Justificación para Bloqer 2.0

- **Next.js + Vercel** encajan con SSR/SSG mixto, rutas por módulo, y despliegue simple para un equipo pequeño.
- **Prisma + Neon** da transacciones SQL, migraciones y buen DX para un modelo relacional rico (ERP).
- **shadcn + Tailwind** acelera UI consistente sin lock-in de componentes opacos.
- **TanStack Table** encaja con listados financieros y operativos (ordenamiento, columnas, virtualización cuando haga falta).
- **R2** separa blobs de la base, alineado a documentos y adjuntos ([`../02-modules/DOCUMENTS.md`](../02-modules/DOCUMENTS.md)).
- **Resend + React Email** cubre notificaciones transaccionales ([`../02-modules/NOTIFICATIONS.md`](../02-modules/NOTIFICATIONS.md)).
- **Auth.js** encaja con sesión en App Router; la matriz de permisos sigue siendo la funcional ([`../00-product/PERMISSIONS_MATRIX.md`](../00-product/PERMISSIONS_MATRIX.md)).

## Problemas que evita

- **ORM inadecuado** o SQL crudo sin migraciones para un modelo con muchas relaciones.
- **UI inconsistente** y costos de diseño custom desde cero.
- **Email ad-hoc** sin plantillas versionadas ni proveedor transaccional.
- **Vendor lock-in de Gantt**: el adapter permite cambiar implementación sin tocar el dominio ([`../00-product/OPEN_QUESTIONS.md`](../00-product/OPEN_QUESTIONS.md) Q-003, Q-004).

## Qué NO hacer

- No fijar **versiones** ni patrones de bundling en este documento (evolucionan en el repo).
- No elegir **segunda base** (p. ej. Mongo) para el núcleo operativo sin ADR que contradiga el modelo relacional del dominio.
- No usar **float** para dinero en ningún tier ([`../03-finance/MONEY_MODEL.md`](../03-finance/MONEY_MODEL.md), [`../00-product/PRODUCT_PRINCIPLES.md`](../00-product/PRODUCT_PRINCIPLES.md) §5).
- No implementar **endpoints ni Prisma schema** en esta capa de documentación.

## Referencias funcionales

- Alcance y fases: [`../00-product/PRODUCT_SCOPE.md`](../00-product/PRODUCT_SCOPE.md)
- Multitenancy: [`../07-non-functional/MULTITENANCY.md`](../07-non-functional/MULTITENANCY.md)
- Notificaciones: [`../02-modules/NOTIFICATIONS.md`](../02-modules/NOTIFICATIONS.md)
- Documentos: [`../02-modules/DOCUMENTS.md`](../02-modules/DOCUMENTS.md)

## Documentos técnicos relacionados

- [`AUTH_ARCHITECTURE.md`](./AUTH_ARCHITECTURE.md)
- [`FILE_STORAGE_ARCHITECTURE.md`](./FILE_STORAGE_ARCHITECTURE.md)
- [`EMAIL_NOTIFICATIONS_ARCHITECTURE.md`](./EMAIL_NOTIFICATIONS_ARCHITECTURE.md)
- [`FRONTEND_ARCHITECTURE.md`](./FRONTEND_ARCHITECTURE.md)
- [`ARCHITECTURE_DECISION_RECORDS.md`](./ARCHITECTURE_DECISION_RECORDS.md)
