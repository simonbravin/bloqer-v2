# Deployment plan — Bloqer 2.0

## Decisión

Desplegar el **modular monolith** en **Vercel** ([`TECH_STACK.md`](./TECH_STACK.md)) con **Neon PostgreSQL**, variables en dashboard Vercel, y blobs en **Cloudflare R2**. Branch previews para cada PR cuando el repo esté conectado.

## Orden recomendado — primer despliegue (Phase 10D)

Seguir **en orden**; agregar variables de entorno **solo cuando** el servicio externo correspondiente ya exista (evita valores placeholder olvidados). Las integraciones opcionales (**Resend, R2, cron, allowlist de plataforma**) **no** deben bloquear el boot si faltan — ver [`ENVIRONMENT_VARIABLES.md`](./ENVIRONMENT_VARIABLES.md).

1. **Repo:** commit / push del código; CI con `typecheck` + `lint` (y tests cuando existan).
2. **Neon:** crear proyecto (y ramas preview si aplica); obtener **`DATABASE_URL`** (pooler) y **`DIRECT_URL`** (directo para migraciones).
3. **Vercel:** conectar el repositorio; fijar **root** del proyecto al path correcto del monorepo (donde vive `apps/web` / `vercel.json` del cron).

### Vercel — build en monorepo (pnpm + Turbo)

Elegir **una** de estas dos convenciones (documentar la elegida en el proyecto Vercel):

| Root directory en Vercel | Install Command (ejemplo) | Build Command (ejemplo) |
|--------------------------|---------------------------|-------------------------|
| **Raíz del repo** (`bloqer-v2`) | `pnpm install` | `pnpm exec turbo build --filter=@bloqer/web` |
| **`apps/web`** | `cd ../.. && pnpm install` | `cd ../.. && pnpm exec turbo build --filter=@bloqer/web` |

- El **cron** está en `apps/web/vercel.json` (`/api/cron/operational-alerts`). Si el root de Vercel **no** es `apps/web`, hay que **mover o duplicar** la sección `crons` al `vercel.json` que Vercel resuelva, o usar root `apps/web`.
- Scripts raíz útiles: `pnpm typecheck`, `pnpm lint`, `pnpm build` (Turbo); DB: `pnpm db:generate`, `pnpm db:migrate:deploy` (ver `package.json` raíz y `packages/database/package.json`).

4. **Env mínimo en Vercel:** `DATABASE_URL`, `DIRECT_URL`, **`AUTH_SECRET`**, **`AUTH_URL`** (URL pública del deploy), **`AUTH_GOOGLE_ID`** / **`AUTH_GOOGLE_SECRET`**; opcionalmente **`NEXT_PUBLIC_APP_URL`** o **`APP_URL`** para links absolutos.
5. **Build:** primer deploy de aplicación (Next.js build); sin migraciones aplicadas aún, rutas que lean DB fallarán hasta el paso 6.
6. **Migraciones (producción):** ejecutar **`prisma migrate deploy`** contra la base del entorno — **no** usar **`prisma db push`** en bases compartidas o producción ([`MIGRATION_STRATEGY.md`](./MIGRATION_STRATEGY.md)). Comando documentado: `pnpm --filter @bloqer/database db:migrate:deploy`.
7. **Seed / bootstrap:** si aplica, `pnpm --filter @bloqer/database db:seed` con **`SEED_USER_EMAIL`** solo en entornos no productivos, o flujo manual acordado para primer tenant + usuario.
8. **Platform superadmin:** `PLATFORM_SUPERADMIN_EMAILS` y/o filas `PlatformAdmin` según [`PLATFORM_SUPERADMIN_ARCHITECTURE.md`](./PLATFORM_SUPERADMIN_ARCHITECTURE.md).
9. **R2:** crear bucket + API token; setear `R2_*`; hasta entonces uploads usan comportamiento deshabilitado / placeholder sin tumbar la app.
10. **Resend:** `RESEND_API_KEY` + `RESEND_FROM_EMAIL`; hasta entonces correo transaccional no-op.
11. **Cron Vercel:** `CRON_SECRET` (≥16 caracteres) alineado con el header que envía el job hacia `/api/cron/operational-alerts`.
12. **Smoke test:** checklist [`DEPLOYMENT_SMOKE_TEST.md`](./DEPLOYMENT_SMOKE_TEST.md).

**Explícito:** `db:push` es solo para iteración local aislada; **producción y staging compartidos = `migrate deploy`**. Variables de integraciones opcionales se agregan **una vez** creado el recurso (Neon, R2, Resend, etc.).

## Entornos

| Entorno | Propósito |
|---|---|
| **Development** | Local + opcional Neon branch |
| **Preview** | Deploy por PR (schema migrado automático o manual según política) |
| **Production** | Rama protegida; migraciones con checklist |

## Pipeline conceptual (sin YAML aquí)

1. CI: lint, typecheck, tests.  
2. Build Next.js.  
3. Migraciones: **`prisma migrate deploy`** en pipeline de release o step manual aprobado ([`MIGRATION_STRATEGY.md`](./MIGRATION_STRATEGY.md)).  
4. Promoción preview → producción con changelog.

## Secrets y configuración

- `DATABASE_URL`, Auth secrets, R2 credentials — solo env; nunca repo.  
- **`RESEND_API_KEY`** + **`RESEND_FROM_EMAIL`** — **opcionales** hasta que se quiera enviar correo (cualquier entorno); si faltan o son inválidos, el envío queda deshabilitado sin tumbar el boot ([`EMAIL_NOTIFICATIONS_ARCHITECTURE.md`](./EMAIL_NOTIFICATIONS_ARCHITECTURE.md)).
- **`CRON_SECRET`** (mín. 16 caracteres): protege `/api/cron/operational-alerts` (operational in-app alerts). Sin valor válido la ruta responde **503** y no ejecuta jobs ([`NOTIFICATIONS_ARCHITECTURE.md`](./NOTIFICATIONS_ARCHITECTURE.md)). En Vercel, alinear con la invocación programada (Bearer automático si aplica).
- **Vercel project root:** el cron está declarado en `apps/web/vercel.json`. Si el proyecto en Vercel usa otro root (p. ej. monorepo con root en `/`), ese archivo no aplica hasta mover o duplicar la sección `crons` en el `vercel.json` que Vercel lea, o cambiar el directorio raíz del proyecto.
- **Variables de entorno:** inventario por categoría en [`ENVIRONMENT_VARIABLES.md`](./ENVIRONMENT_VARIABLES.md); plantilla en [`.env.example`](../../../.env.example).
- **DB:** flujo productivo = migraciones (`prisma migrate deploy`); no sustituir por `prisma db push` en prod.
- Validación en startup ([`PHASE_0_PROJECT_SETUP.md`](./PHASE_0_PROJECT_SETUP.md)).

## Dominios y routing

- Dominio productivo del tenant SaaS Bloqer (definir con negocio).  
- Callback URLs Auth.js por entorno.

## Rollback

- Vercel: redeploy deployment anterior conocido sano.  
- DB: Neon point-in-time restore si política lo permite; migraciones **reversibles** preferir expand/contract ([`MIGRATION_STRATEGY.md`](./MIGRATION_STRATEGY.md)).

## Observabilidad en prod

- Logs Vercel + proveedor APM si se adopta ([`OBSERVABILITY_ARCHITECTURE.md`](./OBSERVABILITY_ARCHITECTURE.md)).

## Qué NO hacer

- No aplicar migraciones destructivas sin backup y ventana.  
- No compartir `DATABASE_URL` entre preview y prod.

## Referencias

- [`ENVIRONMENT_VARIABLES.md`](./ENVIRONMENT_VARIABLES.md) — requisitos y opcionales (Phase 10D).  
- [`DEPLOYMENT_SMOKE_TEST.md`](./DEPLOYMENT_SMOKE_TEST.md) — validación post-deploy.  
- Documentación de despliegue Vercel (cuando exista el proyecto enlazado).  
- [`PHASE_5_HARDENING.md`](./PHASE_5_HARDENING.md)
