# Phase 0 — Project setup

## Objetivos

- Tener un **monorepo coherente** (pnpm), aplicación Next.js App Router con TypeScript, Tailwind y shadcn/ui.  
- **Lint/format**, validación de **env**, **esqueleto de carpetas** alineado a [`REPOSITORY_STRUCTURE.md`](./REPOSITORY_STRUCTURE.md).  
- Mantener **`docs/bloqer2.0`** como fuente de verdad enlazada (ya en repo; no mover sin acuerdo).

## Módulos / áreas incluidas

Infra de desarrollo únicamente: `apps/web` + `packages/*` vacíos o stubs documentados (sin lógica de negocio aún si se prefiere).

## Dependencias

- Ninguna fase previa.  
- Requiere decisiones de [`TECH_STACK.md`](./TECH_STACK.md), [`REPOSITORY_STRUCTURE.md`](./REPOSITORY_STRUCTURE.md).

## Entregables

- Workspace pnpm + app Next compilando en local.  
- Tailwind + shadcn base instalados según guía del equipo.  
- ESLint + Prettier (o Biome si ADR) configurados.  
- Esquema de env tipado (`packages/config` o equivalente).  
- README del repo: cómo levantar, cómo linkear docs.  
- Turborepo **opcional** ([`PENDING_ARCHITECTURE_ITEMS.md`](./PENDING_ARCHITECTURE_ITEMS.md) P-REP-02).

## Criterios de aceptación

- [ ] `pnpm install` + comando dev documentado sin pasos manuales críticos omitidos.  
- [ ] Variables obligatorias fallan **en startup** con mensaje claro.  
- [ ] Estructura de carpetas coincide con la documentada (salvo desviación registrada en ADR).

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Deuda de tooling antes de dominio | No bloquear Phase 1 por “perfection”; congelar versión mayor de Next en ADR |
| shadcn drift | Documentar versión de CLI / registro en README |

## Qué NO hacer todavía

- No implementar **auth productivo** completo sin Phase 1 plan.  
- No crear **schema Prisma masivo** hasta cerrar ítems críticos en [`PENDING_ARCHITECTURE_ITEMS.md`](./PENDING_ARCHITECTURE_ITEMS.md).  
- No mover ni truncar `docs/bloqer2.0`.

## Prompts sugeridos (IA)

```
Lee docs/bloqer2.0/08-architecture/REPOSITORY_STRUCTURE.md y PACKAGE_STRUCTURE.md.
Propón árbol de carpetas exacto para apps/web y packages/* sin escribir lógica de negocio.
No implementes auth ni Prisma todavía.
```

```
Configura ESLint + Prettier (o Biome) para Next.js + TypeScript strict.
Lista reglas mínimas alineadas a CODING_STANDARDS.md.
```

## Referencias

[`PHASE_1_FOUNDATION.md`](./PHASE_1_FOUNDATION.md) — siguiente fase.
