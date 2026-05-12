# Repository structure — Bloqer 2.0

> Propuesta para **pnpm workspaces** + app Next.js. **No** inicializa repo ni crea `package.json`.

## Decisión

Organizar el monorepo en **paquetes con límites claros** y una **app** que orquesta UI + rutas. Toda mutación de negocio llega al **mismo service layer** venga de Route Handler o Server Action ([`API_STRUCTURE.md`](./API_STRUCTURE.md)).

## Estructura propuesta (alto nivel)

```
repo/
├── apps/
│   └── web/                          # Next.js App Router (UI + route handlers)
├── packages/
│   ├── database/                     # Prisma client, tipos DB (sin lógica de negocio)
│   ├── domain/                       # reglas puras, tipos de dominio, cálculos compartidos
│   ├── validators/                   # esquemas Zod compartidos (input DTOs)
│   ├── services/                     # application services (orquestación, transacciones)
│   ├── ui/                           # design system, componentes shadcn compuestos
│   ├── email/                        # plantillas React Email + envío (wrapper Resend)
│   ├── storage/                      # R2: firmas, keys, helpers
│   ├── auth/                         # configuración Auth.js compartida
│   ├── config/                       # env tipado, feature flags lectura
│   └── utils/                        # helpers sin reglas de negocio
├── docs/                             # (opcional) symlink o copia; en este repo: docs/bloqer2.0
└── turbo.json / pnpm-workspace.yaml  # cuando existan (ver ADR-006)
```

### `apps/web` — qué vive y qué no

| Vive aquí | No debe vivir aquí |
|---|---|
| `app/` rutas, layouts, loading, error boundaries | Lógica financiera crítica como “fuente de verdad” |
| `app/api/**` Route Handlers (HTTP) | Prisma directo sin pasar por `packages/services` o repositorio |
| Features bajo `features/<module>/` (ver [`FRONTEND_FEATURE_STRUCTURE.md`](./FRONTEND_FEATURE_STRUCTURE.md)) | Duplicar reglas ya en `packages/domain` o `packages/services` |
| Server Actions **delgados** que delegan en services | Cálculos de AR/AP/ledger solo en cliente |

### Flujo **doc → código**

1. Spec funcional: `docs/bloqer2.0/02-modules/…`, `01-domain/…`, `04-formulas/…`.  
2. Modelo / ERD técnico: [`TECHNICAL_ERD.md`](./TECHNICAL_ERD.md), [`DATA_MODEL_OVERVIEW.md`](./DATA_MODEL_OVERVIEW.md).  
3. Contrato de capa: [`SERVICE_LAYER.md`](./SERVICE_LAYER.md), [`BACKEND_LAYERING.md`](./BACKEND_LAYERING.md).  
4. Implementación en `packages/services` + `packages/database` (repositorios).  
5. Exponer vía [`API_STRUCTURE.md`](./API_STRUCTURE.md) (handlers / actions).  
6. Si cambia regla de producto → actualizar **primero** doc + [`DECISION_LOG`](../00-product/DECISION_LOG.md) si aplica.

## Dónde vive cada concern

| Concern | Ubicación propuesta |
|---|---|
| Páginas y layouts | `apps/web/app/(…)/` |
| Features UI | `apps/web/features/<module>/` |
| Services (mutaciones, transiciones) | `packages/services/src/<module>/` |
| Dominio puro (invariantes, cálculos sin I/O) | `packages/domain/src/<module>/` |
| Zod entrada | `packages/validators/src/<module>/` |
| Repositorios / Prisma | `packages/database/src/repositories/` o por módulo según [`DOMAIN_MODULE_STRUCTURE.md`](./DOMAIN_MODULE_STRUCTURE.md) |
| UI compartida | `packages/ui/` |
| Emails | `packages/email/` |
| Storage | `packages/storage/` |
| Auth config | `packages/auth/` |

## Referencias

- [`PACKAGE_STRUCTURE.md`](./PACKAGE_STRUCTURE.md)  
- [`MODULAR_MONOLITH.md`](./MODULAR_MONOLITH.md)  
- [`PENDING_ARCHITECTURE_ITEMS.md`](./PENDING_ARCHITECTURE_ITEMS.md)
