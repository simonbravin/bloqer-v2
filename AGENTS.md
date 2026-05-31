# AGENTS.md — Guía para agentes IA (raíz del repo)

> Si sos Claude, Cursor, Copilot, o cualquier otro agente IA trabajando en este repo,
> **leé este archivo antes de generar código o tomar cualquier decisión.**

---

## 1. Antes de tocar código

Leer en este orden:

1. [`docs/bloqer2.0/README.md`](./docs/bloqer2.0/README.md) — qué es este producto.
2. [`docs/bloqer2.0/AGENTS.md`](./docs/bloqer2.0/AGENTS.md) — reglas de oro y naming canónico.
3. [`docs/bloqer2.0/08-architecture/README.md`](./docs/bloqer2.0/08-architecture/README.md) — arquitectura técnica.
4. [`docs/bloqer2.0/08-architecture/IMPLEMENTATION_ROADMAP.md`](./docs/bloqer2.0/08-architecture/IMPLEMENTATION_ROADMAP.md) — en qué fase estamos.
5. El módulo funcional correspondiente en `docs/bloqer2.0/02-modules/<MODULE>.md`.

**No hay excepción a esta regla.**

---

## 2. Reglas no negociables

- **No inventar** entidades, estados, campos, enums, eventos, fórmulas ni reglas de negocio.
  Si falta algo, agregarlo a `docs/bloqer2.0/00-product/OPEN_QUESTIONS.md` y preguntar.
- **No poner lógica financiera crítica en componentes React.** Toda mutación va por `packages/services`.
- **No acceder a Prisma directamente desde `apps/web`.** Usar repositorios en `packages/database`.
- **No usar `float` para dinero.** Ver `docs/bloqer2.0/03-finance/MONEY_MODEL.md`.
- **Toda entidad operativa debe tener `tenant_id`.** No hay excepción de "solo para demo".
- **Toda mutación importante pasa por el service layer** (`packages/services`).
- **Los estados de las entidades son los documentados** en `docs/bloqer2.0/01-domain/STATE_MACHINES.md`. No inventar estados nuevos sin actualizar ese documento primero.
- **Si una decisión es ambigua, parar y preguntar.** No improvisar arquitectura.
- **No crear scripts one-off ni “parches” ejecutables** (bash, PowerShell, `scripts/*.ts` ad hoc, seeds de emergencia) para tapar bugs, migrar datos a mano o validar algo que debería quedar en el producto (cron, service layer, tests, docs de smoke manual). Si hace falta corregir algo, corregir la causa en código o documentar el procedimiento operativo en `docs/bloqer2.0/` — no dejar scripts sueltos en el repo.

---

## 3. Estructura del repo

```
apps/web/               → Next.js App Router (UI + route handlers + server actions)
packages/database/      → Prisma client y repositorios (nunca lógica de aprobaciones)
packages/domain/        → Tipos e invariantes puros (sin I/O)
packages/validators/    → Schemas Zod de entrada
packages/services/      → Application services — orquestación y transacciones
packages/ui/            → Design system y componentes compartidos
packages/email/         → React Email + Resend
packages/storage/       → Cloudflare R2
packages/auth/          → Auth.js config
packages/config/        → Variables de entorno tipadas con Zod
packages/utils/         → Helpers puros sin reglas de negocio
docs/bloqer2.0/         → FUENTE DE VERDAD — no mover, no truncar
```

---

## 4. Qué puede decidir un agente solo

- Nombres de variables locales dentro de las convenciones documentadas.
- Refactors mecánicos que no cambian comportamiento observable.
- Orden de imports.

## 5. Qué debe preguntar antes de hacer

- Cualquier nuevo campo persistido, estado, evento o regla financiera.
- Introducir una dependencia npm nueva.
- Cambiar la semántica de una decisión en `DECISION_LOG.md`.
- Cualquier cambio arquitectónico que no esté documentado como ADR.

---

## 6. Convenciones de código

- **TypeScript strict** habilitado en todo el repo.
- **Idioma en código:** inglés (entidades, tablas, enums, eventos, APIs).
- **Idioma en UI:** español (Argentina).
- **Archivos:** `kebab-case.ts`.
- **Imports:** externos → `@bloqer/*` → relativos.
- **No ciclos:** `services` no importa `web`; `domain` no importa `database`.

---

## 7. Cómo registrar dudas

- Duda de producto → `docs/bloqer2.0/00-product/OPEN_QUESTIONS.md`
- Duda técnica → `docs/bloqer2.0/08-architecture/PENDING_ARCHITECTURE_ITEMS.md`
- Contradicción entre docs → anotar con `## Hallazgo` en el archivo afectado y avisar.

---

Ver también: [`docs/bloqer2.0/08-architecture/AGENT_GUARDRAILS.md`](./docs/bloqer2.0/08-architecture/AGENT_GUARDRAILS.md)
