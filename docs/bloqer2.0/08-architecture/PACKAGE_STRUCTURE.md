# Package structure — Bloqer 2.0

> Contrato de **dependencias** entre paquetes del monorepo. Nombres de carpetas pueden ajustarse; **los límites** no.

## `packages/database`

| Aspecto | Contenido |
|---|---|
| **Objetivo** | Cliente Prisma, repositorios, queries tipadas, transacciones de bajo nivel. |
| **Responsabilidades** | CRUD scoped `tenant_id`; sin reglas de negocio de aprobación ni fórmulas de rentabilidad. |
| **Dependencias permitidas** | `config`, `utils` (helpers SQL), Prisma. |
| **Prohibido** | Importar `services` (evita ciclos); importar React; exponer Prisma a `apps/web` sin wrapper. |
| **Ejemplo** | `receivableRepository.listByTenant(tenantId, filters)`. |
| **Anti-patterns** | `repository.approveCertification()` con 200 líneas de reglas. |

## `packages/domain`

| Aspecto | Contenido |
|---|---|
| **Objetivo** | Tipos, invariantes, funciones puras (p. ej. validar transición de estado, cálculos reproducibles). |
| **Responsabilidades** | Lógica **sin** I/O; alineada a [`BUSINESS_RULES`](../01-domain/BUSINESS_RULES.md). |
| **Dependencias permitidas** | `utils` trivial (fechas puras); nada de DB. |
| **Prohibido** | Prisma, fetch, env. |
| **Ejemplo** | `canTransitionBudgetStatus(from, to)`. |
| **Anti-patterns** | Llamar APIs desde “domain”. |

## `packages/validators`

| Aspecto | Contenido |
|---|---|
| **Objetivo** | Zod schemas para **entrada** (forms, JSON body). |
| **Responsabilidades** | Shape + coercion; mensajes con **códigos** estables para i18n. |
| **Dependencias permitidas** | `zod`, tipos compartidos desde `domain` si son DTOs. |
| **Prohibido** | Acceso DB; reglas que requieren leer el estado actual del agregado (eso va en service). |
| **Ejemplo** | `createCollectionInputSchema`. |
| **Anti-patterns** | “Si monto > X entonces APPROVED” sin leer DB en service. |

## `packages/services`

| Aspecto | Contenido |
|---|---|
| **Objetivo** | Application services: orquestación, transacciones, efectos, eventos. |
| **Responsabilidades** | Única puerta para mutaciones críticas ([`SERVICE_LAYER.md`](./SERVICE_LAYER.md)). |
| **Dependencias permitidas** | `database`, `domain`, `validators`, `storage`, `email`, `config`; tipos de `@bloqer/ai` solo para defs de tools AI (sin adapters/SDK). |
| **Prohibido** | Importar componentes React; conocer headers HTTP concretos (recibir contexto ya resuelto). |
| **Ejemplo** | `confirmCollection(ctx, input)`. |
| **Anti-patterns** | Dos implementaciones distintas de la misma regla para “handler” vs “action”. |

## `packages/ui`

| Aspecto | Contenido |
|---|---|
| **Objetivo** | Componentes reutilizables, tokens, composición shadcn. |
| **Estado actual** | **Stub Phase 0** (H-D7: mantener). Ver `packages/ui/README.md`. UI real vive en `apps/web`. |
| **Responsabilidades** | Presentación; props tipadas; sin fetch a datos financieros autoritativos. |
| **Dependencias permitidas** | React, Tailwind, Radix/shadcn. |
| **Prohibido** | Prisma; `services` (salvo patrones muy controlados de “hook + server” que igual deleguen). |
| **Anti-patterns** | Tabla que calcula saldo AR sumando en cliente como verdad final. |

## `packages/email`

| Aspecto | Contenido |
|---|---|
| **Objetivo** | React Email + envío vía Resend. |
| **Dependencias** | `config`; no `services` pesados si genera ciclo — preferir payloads ya armados. |

## `packages/storage`

| Aspecto | Contenido |
|---|---|
| **Objetivo** | R2: URLs firmadas, upload policy, keys. |
| **Dependencias** | `config`, `validators` opcional para input de upload. |

## `packages/auth`

| Aspecto | Contenido |
|---|---|
| **Objetivo** | Config Auth.js, tipos de sesión, helpers `getSession`. |
| **Dependencias** | `database` solo si sync de usuario mínimo. |

## `packages/config`

| Aspecto | Contenido |
|---|---|
| **Objetivo** | Lectura tipada de env, constantes de plataforma. |
| **Prohibido** | Lógica de negocio. |

## `packages/utils`

| Aspecto | Contenido |
|---|---|
| **Objetivo** | Funciones puras genéricas (formato display opcional; **no** reglas fiscales). |
| **Prohibido** | Montos de negocio sin pasar por tipos de `domain` / convención decimal. |

## `packages/ai` (`@bloqer/ai`)

| Aspecto | Contenido |
|---|---|
| **Objetivo** | Runtime LLM provider-agnostic: orquestación, tool-calling abstraction, mensajes, knowledge local, adapters. |
| **Responsabilidades** | `AiProvider` + registry + capabilities; tipos normalizados; agent loop; índice help/docs (BM25); adapters en `adapters/` (MVP: OpenAI Chat Completions). |
| **Dependencias permitidas** | `config`, `zod`; SDK de proveedor (**p. ej. `openai`**) **solo** dentro de `adapters/`. |
| **Prohibido** | Importar React; contener reglas de negocio Bloqer (RBAC, agregaciones financieras, workflows); importar `@bloqer/services` (evita ciclo); Prisma / SQL. |
| **Relación con services** | Tools viven en `packages/services/src/ai/` (propiedad Bloqer). `services` **puede** importar tipos de `@bloqer/ai` para defs; `@bloqer/ai` **no** importa `services`. El cableado (registry → agent) ocurre en `apps/web` / transport. |
| **Anti-patterns** | Orquestación que importa `openai` fuera de adapters; tools que conocen el vendor; precios hardcodeados en `AiUsage`. |
| **Referencia** | [`BLOQER_AI_ARCHITECTURE.md`](../BLOQER_AI_ARCHITECTURE.md), [ADR-017](./ARCHITECTURE_DECISION_RECORDS.md). |

## Referencias

- [`REPOSITORY_STRUCTURE.md`](./REPOSITORY_STRUCTURE.md)  
- [`DOMAIN_MODULE_STRUCTURE.md`](./DOMAIN_MODULE_STRUCTURE.md)
