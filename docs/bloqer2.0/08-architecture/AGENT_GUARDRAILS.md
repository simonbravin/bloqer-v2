# Agent guardrails — Bloqer 2.0

> Reglas **duras** para agentes IA (y humanos). Violación = PR inválido.

## Qué puede decidir un agente **solo**

- Nombres de **variables locales** y estructura de archivos **dentro** de las convenciones ya documentadas.  
- Refactors mecánicos que **no** cambian comportamiento observable.  
- Orden de imports, extracción de función pura ya cubierta por doc.

## Qué debe **preguntar** (o detenerse)

- Cualquier nuevo **estado**, **campo persistido**, o **regla financiera** no listada en `01-domain/` o `02-modules/`.  
- Cambiar semántica de `D-xxx` o `BR-xxx`.  
- Introducir **nueva dependencia** npm (necesita criterio humano / ADR).

## Qué **jamás** debe inventar

- Campos de base de datos, enums, eventos, montos implícitos.  
- Atajos “solo para demo” con datos cross-tenant.  
- `float` / `double` para dinero.  
- `payment_status` en `certification` como columna editable sin spec de materialización.  
- Microservicios o segunda base de verdad operativa.

## Trabajo por módulos

- Un PR grande → preferir **franja por módulo** (`certifications` solo, etc.).  
- No importar cinco módulos desde un solo componente UI.

## Cómo registrar dudas

- [`PENDING_ARCHITECTURE_ITEMS.md`](./PENDING_ARCHITECTURE_ITEMS.md), `OPEN_QUESTIONS.md`, o comentario `// OPEN:` solo si el equipo acepta ese prefijo (mejor ticket).

## Cómo citar documentos

- Ruta relativa desde repo: `docs/bloqer2.0/...`  
- Incluir **ID de regla** cuando exista: `[BR-COS-002]`, `[D-026]`.

## Cómo detectar contradicciones

- Si código y `BUSINESS_RULES` difieren → **código mal** hasta que se actualice la spec **por decisión explícita**.  
- Si dos docs funcionales contradicen → anotar en PR y escalar a producto.

## Evitar overengineering

- No abstraer “plugin system” sin necesidad.  
- No crear capa `AbstractFactory` si un service + repository alcanza.

## Evitar shortcuts peligrosos

- “Solo esta vez” sin `tenant_id`.  
- “Confío en el front” para aprobar pago.  
- Borrar movimiento confirmado en lugar de compensar.
- Calcular dinero con `parseFloat` / `Number` / `float`.  
- Serializar montos money en DTOs con `.toString()` crudo (usar `serializeMoney`).  
- Redondear el saldo en UI y reenviarlo como “pago total” (usar `payFullBalance` / saldo almacenado en server) — [D-053](../00-product/DECISION_LOG.md).

## Scripts provisionales (prohibido)

**No agregar** scripts ejecutables (bash, PowerShell, Node en `scripts/`, seeds ad hoc, “smoke” locales) cuyo propósito sea:

- tapar un bug sin corregir la causa en el producto;
- migrar o reparar datos “una vez” sin migración Prisma / servicio documentado;
- simular cron, envío de mail o PDF fuera del flujo real (`apps/web` route + `packages/services`).

Esos archivos **quedan abandonados**, se ejecutan con datos viejos y **rompen el progreso** del sistema.

**En su lugar:**

- bug o regla de negocio → fix en service layer + test si aplica;
- verificación operativa → pasos en `DEPLOYMENT_SMOKE_TEST.md` (manual, sin script en repo);
- datos → migración versionada en `packages/database` o herramienta explícita acordada con el equipo (ADR).

Excepciones aceptables: scripts **ya existentes** de build/CI (`package.json`, Turborepo, hooks de repo) y herramientas documentadas en `08-architecture/` — no crear variantes “temporales”.

## Componentes cliente y `@bloqer/services`

- **No importar** el barrel `@bloqer/services` desde archivos con `"use client"` (ni helpers usados solo por el cliente). Eso puede arrastrar `crypto`, Prisma o email al bundle de Webpack y romper el build en Vercel (`UnhandledSchemeError: node:crypto`).
- Usar tipos locales en `apps/web/features/.../types.ts`, subpaths documentados (`@bloqer/services/...`) solo en **Server Components** / route handlers / server actions, o duplicar helpers puramente de UI (p. ej. `buildAuditEntityHref`).

## Referencias

- [`../AGENTS.md`](../AGENTS.md)  
- [`AI_DEVELOPMENT_WORKFLOW.md`](./AI_DEVELOPMENT_WORKFLOW.md)
