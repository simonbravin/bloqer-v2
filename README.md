# Bloqer 2.0

ERP SaaS para empresas constructoras.

## Documentación

La fuente de verdad funcional y técnica vive en [`docs/bloqer2.0/`](./docs/bloqer2.0/README.md).

Antes de tocar cualquier archivo de código, leer:

1. [`docs/bloqer2.0/AGENTS.md`](./docs/bloqer2.0/AGENTS.md) — reglas para agentes IA
2. [`docs/bloqer2.0/08-architecture/README.md`](./docs/bloqer2.0/08-architecture/README.md) — arquitectura técnica
3. [`docs/bloqer2.0/08-architecture/IMPLEMENTATION_ROADMAP.md`](./docs/bloqer2.0/08-architecture/IMPLEMENTATION_ROADMAP.md) — roadmap por fases

## Stack

- **Framework:** Next.js 15 (App Router)
- **Lenguaje:** TypeScript (strict)
- **Estilos:** Tailwind CSS + shadcn/ui
- **Monorepo:** pnpm workspaces + Turborepo
- **Base de datos:** PostgreSQL (Neon) + Prisma
- **Auth:** Auth.js (Phase 1)
- **Email:** Resend + React Email (Phase 1+)
- **Storage:** Cloudflare R2 (Phase 2+)
- **Deploy:** Vercel

## Estructura

```
apps/
  web/           # Next.js App Router (@bloqer/web)
packages/
  database/      # Prisma client, repositorios (@bloqer/database)
  domain/        # Tipos, invariantes, cálculos puros (@bloqer/domain)
  validators/    # Schemas Zod de entrada (@bloqer/validators)
  services/      # Application services — única puerta a mutaciones (@bloqer/services)
  ui/            # Componentes reutilizables, design system (@bloqer/ui)
  email/         # React Email + Resend (@bloqer/email)
  storage/       # Cloudflare R2 helpers (@bloqer/storage)
  auth/          # Auth.js config compartida (@bloqer/auth)
  config/        # Env tipado con Zod (@bloqer/config)
  utils/         # Helpers puros sin reglas de negocio (@bloqer/utils)
docs/
  bloqer2.0/     # Especificación funcional completa (no mover)
```

## Setup local

```bash
# Clonar repo
git clone https://github.com/simonbravin/bloqer-v2

# Instalar dependencias
pnpm install

# Copiar variables de entorno
cp .env.local.example .env.local
# Editar .env.local con valores reales

# Correr en desarrollo
pnpm dev

# O solo la app web
pnpm --filter @bloqer/web dev
```

## Comandos útiles

```bash
pnpm dev               # Levanta todos los workspaces en paralelo (turbo)
pnpm build             # Build de producción (turbo)
pnpm lint              # ESLint en todos los workspaces
pnpm typecheck         # TypeScript check en todos los workspaces
pnpm format            # Prettier en todo el repo
pnpm format:check      # Verificar formato sin escribir

# Filtrar por workspace
pnpm --filter @bloqer/web dev
pnpm --filter @bloqer/web lint
pnpm --filter @bloqer/web typecheck

# Prisma (Phase 1+)
pnpm --filter @bloqer/database db:generate
pnpm --filter @bloqer/database db:push
pnpm --filter @bloqer/database db:studio
```

## Estado de implementación

| Fase | Descripción | Estado |
|---|---|---|
| **Phase 0** | Setup monorepo, tooling, estructura | ✅ Completo |
| Phase 1 | Auth, tenant, DB base, shell UI | Pendiente |
| Phase 2 | Directorio, proyectos, presupuestos, certificaciones | Pendiente |
| Phase 3 | Tesorería, AR/AP, cashflow, cierre | Pendiente |
| Phase 4 | Compras, inventario, reportes, dashboards | Pendiente |
| Phase 5 | Tests, performance, observabilidad | Pendiente |

Ver roadmap completo: [`docs/bloqer2.0/08-architecture/IMPLEMENTATION_ROADMAP.md`](./docs/bloqer2.0/08-architecture/IMPLEMENTATION_ROADMAP.md)
