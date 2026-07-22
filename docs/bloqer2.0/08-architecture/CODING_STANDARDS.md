# Coding standards — Bloqer 2.0

> Convenciones cuando exista código en el repo. **No** sustituye [`../AGENTS.md`](../AGENTS.md).

## TypeScript

- **`strict` habilitado** (o equivalente máximo pragmático del stack).  
- Evitar `any`; usar `unknown` + narrow.  
- Tipos públicos de API/DTO en `packages/validators` o `packages/domain` según corresponda.

## Naming

- Inglés para código, tablas, columnas, enums, eventos ([`../AGENTS.md`](../AGENTS.md) §3).  
- Archivos: `kebab-case.ts` o `camelCase.ts` — **elegir una** por repo en ADR y no mezclar.

## Imports

- Orden: externos → workspace (`@bloqer/...`) → relativos.  
- Sin import cíclico `services` → `web` → `services`.

## Errores

- Clases o objetos de error con **`code`** estable + `meta` opcional para soporte.  
- No filtrar detalles internos al cliente.

## Fechas

- `TIMESTAMPTZ` en DB; en TS tipar explícito (no mezclar `Date` y string sin frontera).  
- `date_accounting` vs `date_value` respetados en tesorería ([D-023](../00-product/DECISION_LOG.md)).

## Dinero y decimales

- Ver [`MONEY_AND_DECIMAL_STRATEGY.md`](./MONEY_AND_DECIMAL_STRATEGY.md) y [D-053](../00-product/DECISION_LOG.md).
- **Nunca `number`/`float`/`parseFloat`** para calcular o agregar dinero.
- Montos operativos: `roundMoney` / `serializeMoney` de `@bloqer/utils` (2 dp half-up). DTOs money: siempre `serializeMoney`, no `.toString()` crudo.
- Display: `formatMoneyAmount` (min=max 2). No inventar `Intl.NumberFormat` locales para dinero.
- Entrada: schemas Zod `moneyAmountString` (preprocess round-to-2). `fxRateString` (6), `qtyString` / `ratePctString` (4).
- “Pagar/cobrar todo”: flag server-side sobre saldo almacenado; no redondear en UI y reaplicar.

## Enums

- Valores canónicos en inglés; labels en i18n ([`ENUM_STRATEGY.md`](./ENUM_STRATEGY.md)).

## Zod

- En frontera de entrada; mensajes con código para mapeo i18n.  
- No duplicar schemas divergentes client/server.

## Services

- Un método = un caso de uso o variante clara; transacciones explícitas.  
- Log de `tenant_id`, `user_id`, `operation` al inicio de mutaciones críticas.

## Repositories

- Sin reglas de “puede aprobar o no”; solo datos + scopes.  
- Queries listados: siempre `tenant_id` first en WHERE.

## Company scoping (tenant vs empresa)

- Estándar completo: [`TENANT_COMPANY_SCOPING.md`](./TENANT_COMPANY_SCOPING.md). **Leer antes** de escribir cualquier filtro por `companyId`.
- Aislamiento entre tenants: **siempre** `tenantId` en el WHERE (nunca depender de `companyId`).
- `companyId = null` = **compartido/corporativo**, visible para cualquier empresa del tenant.
- Entidades con `companyId` **nullable** (p. ej. `Project`, `TreasuryAccount`, `AccountMovement`, `DocumentAttachment`): usar `companyScopeFilter(ctx)` / `companyScopeRelationFilter(rel, ctx)` en lecturas e `isCrossCompany(entity.companyId, ctx)` en guards (`@bloqer/services`). **Nunca** `ctx.companyId ? { companyId } : {}` (oculta las compartidas).
- Tesorería es **tenant-wide**: no filtrar por `ctx.companyId` (usar `getTreasurySummaryByTenant`).
- Entidades con `companyId` **NOT NULL** (AR/AP/contabilidad/compras): `ctx.companyId ? { companyId } : {}` es correcto; verificar la nulabilidad en `schema.prisma` antes de decidir.

## Eventos

- Nombres alineados a [`../01-domain/EVENTS_AND_AUTOMATIONS.md`](../01-domain/EVENTS_AND_AUTOMATIONS.md) (`entity.action` en pasado, inglés).

## Comentarios

- Explicar **por qué** no obvio; no narrar el qué del lenguaje.  
- Referenciar doc funcional: `// See BR-COS-002` con link en PR description.

## Anti-patterns (lista corta)

- Prisma en página React.  
- `payment_status` escrito a mano en `certification` como si fuera source of truth.  
- Server Action de 500 líneas.  
- Feature flag en cliente que habilita saltar validación server.

## Referencias

- [`PACKAGE_STRUCTURE.md`](./PACKAGE_STRUCTURE.md)  
- [`AGENT_GUARDRAILS.md`](./AGENT_GUARDRAILS.md)
