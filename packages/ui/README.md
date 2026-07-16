# `@bloqer/ui`

Phase 0 **intentional stub**. Shared design-system packages will land in a later phase.

## Decision (H-D7)

Keep this package in the monorepo workspace. Do **not** remove it from `pnpm-workspace` / `transpilePackages` in this sprint, and do **not** build a full design system here yet.

## Where UI lives today

- App shell and feature UI: `apps/web/components/*`, `apps/web/features/*`
- Local shadcn-style primitives: `apps/web/components/ui/*`

This package currently exports an empty module (`export {}`) so the workspace slot exists without forcing consumers onto a premature shared library.

See: `docs/bloqer2.0/08-architecture/PACKAGE_STRUCTURE.md`
