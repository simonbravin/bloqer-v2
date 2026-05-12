# Migration strategy — Bloqer 2.0

## Decisión

Usar **migraciones versionadas** alineadas a **Prisma Migrate** contra **Neon PostgreSQL** ([`TECH_STACK.md`](./TECH_STACK.md)). Flujo esperado:

1. Cambio de modelo acordado en spec + ERD técnico.  
2. Generar migración SQL.  
3. Revisar impacto en **datos** (backfill, defaults).  
4. Aplicar en ramas preview / staging antes de producción.

## Principios

- **Expand / contract** cuando haya tráfico: primero agregar columnas nuevas compatibles, backfill, luego eliminar viejas.  
- **Locks:** operaciones largas en tablas grandes (ledger) planificar en ventana o usar enfoque incremental.  
- **Seed:** solo datos no productivos; nunca secrets.

## Multitenancy

- Migraciones que agregan `company_id` o renombran FKs deben incluir **estrategia de backfill** (p. ej. única company por tenant).

## Datos financieros

- Prohibido migrar con **pérdida de precisión** (cambiar tipo de columna de NUMERIC a float — **no**).  
- Cambios en estados: script de transición + validación.

## Problemas que evita

- “Drift” entre ambientes.  
- Deploy de código que asume columnas inexistentes.  
- Migraciones irreversibles sin backup Neon.

## Cambios de schema recientes (recordatorio deploy)

- **Phase 13B:** relaciones Prisma / FKs en `Payment` (`supplierContactId`, `supplierInvoiceId`) — aplicar con **`prisma migrate deploy`** (o migración SQL equivalente) antes de usar producción; **no** `db:push` en Neon compartido/prod.

## Qué NO hacer

- No editar migraciones **ya aplicadas** en producción.  
- No mezclar **lógica de negocio** en migraciones SQL complejas — preferir job post-migración.  
- No crear schema Prisma en esta documentación.

## Comandos (monorepo)

- **Generar client:** `pnpm --filter @bloqer/database db:generate`  
- **Crear migración (dev):** `pnpm --filter @bloqer/database db:migrate` (`prisma migrate dev`)  
- **Aplicar migraciones (CI/prod):** `pnpm --filter @bloqer/database db:migrate:deploy` (`prisma migrate deploy`)  
- **No** usar `db:push` contra bases compartidas o producción — ver [`DEPLOYMENT_PLAN.md`](./DEPLOYMENT_PLAN.md).

## Referencias

- [`DATABASE_CONVENTIONS.md`](./DATABASE_CONVENTIONS.md)  
- [`ENTITY_ID_STRATEGY.md`](./ENTITY_ID_STRATEGY.md)  
- [`ARCHITECTURE_DECISION_RECORDS.md`](./ARCHITECTURE_DECISION_RECORDS.md)
