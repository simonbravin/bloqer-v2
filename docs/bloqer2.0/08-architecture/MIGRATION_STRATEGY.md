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
- **Phase 16B:** `SupplierInvoice`, `Payable`, `Payment` — `projectId` nullable (AP corporativo); `AccountMovement.projectId` nullable (dimensión analítica opcional). Migración `20260513200000_phase_16b_ap_company_project_optional`. Sin backfill: filas existentes conservan `projectId` no nulo.
- **Phase1-05 notes:** `20260513220000_tenant_permission_matrix_notes` — `ALTER TABLE tenants ADD permission_matrix_notes JSONB` (revisado; sin backfill).
- **Phase 17B:** `20260530120000_phase_17b_scheduled_reports` — tablas `scheduled_reports`, `scheduled_report_items`, `scheduled_report_recipients`; enums; `LinkedEntityType.SCHEDULED_REPORT`; CHECKs scope/frecuencia; índice único parcial idempotencia `REPORT_SCHEDULED` en `email_delivery_logs`. Aplicar con `pnpm db:migrate:deploy` antes de UI CRUD.

## Orden release (código + base de datos)

1. **CI:** `pnpm ci:prisma` (genera client sin `DATABASE_URL`) luego `pnpm typecheck` en cada PR (workflow en `.github/workflows/ci.yml`).
2. **Deploy:** ejecutar `pnpm db:migrate:deploy` **antes** o en el **mismo pipeline** que publica una versión de app que dependa del nuevo schema — ver [`DEPLOYMENT_PLAN.md`](./DEPLOYMENT_PLAN.md). Evita arrancar código nuevo contra una base sin migrar.

## Qué NO hacer

- No editar migraciones **ya aplicadas** en producción.  
- No mezclar **lógica de negocio** en migraciones SQL complejas — preferir job post-migración.  
- No crear schema Prisma en esta documentación.

## Comandos (monorepo)

- **Generar client:** `pnpm --filter @bloqer/database db:generate`  
- **Crear migración (dev):** `pnpm --filter @bloqer/database db:migrate` (`prisma migrate dev`)  
- **Aplicar migraciones (CI/prod):** `pnpm db:migrate:deploy` en raíz (`prisma migrate deploy`, usa `.env`)  
- **Ver estado vs carpeta `migrations/`:** `pnpm db:migrate:status` en raíz  
- **No** usar `db:push` contra bases compartidas o producción — ver [`DEPLOYMENT_PLAN.md`](./DEPLOYMENT_PLAN.md).

## Referencias

- [`DATABASE_CONVENTIONS.md`](./DATABASE_CONVENTIONS.md)  
- [`ENTITY_ID_STRATEGY.md`](./ENTITY_ID_STRATEGY.md)  
- [`ARCHITECTURE_DECISION_RECORDS.md`](./ARCHITECTURE_DECISION_RECORDS.md)
