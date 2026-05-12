# AI development workflow — Bloqer 2.0

> Cómo trabajan **Claude / Cursor** (y humanos) sin drift ni tokens desperdiciados.

## Antes de programar (orden mínimo)

1. **[`../AGENTS.md`](../AGENTS.md)** — reglas de oro y citación.  
2. **Módulo** — `docs/bloqer2.0/02-modules/<MODULE>.md`.  
3. **Reglas / estados** — [`BUSINESS_RULES`](../01-domain/BUSINESS_RULES.md), [`STATE_MACHINES`](../01-domain/STATE_MACHINES.md) si hay lifecycle.  
4. **Fórmulas** — `04-formulas/` relevante (no reinventar).  
5. **Workflow cruzado** — `05-workflows/` si el cambio cruza módulos.  
6. **Arquitectura** — [`SERVICE_LAYER`](./SERVICE_LAYER.md), [`API_STRUCTURE`](./API_STRUCTURE.md), [`DATA_MODEL_OVERVIEW`](./DATA_MODEL_OVERVIEW.md) si toca persistencia.  
7. **Decisiones lockeadas** — [`DECISION_LOG`](../00-product/DECISION_LOG.md) — **no contradecir**.

## Identificar alcance

- **Un módulo:** trabajar solo en `packages/services/src/<module>` + feature UI correspondiente.  
- **Finanzas:** siempre + [`MONEY_MODEL`](../03-finance/MONEY_MODEL.md) + [`ACCOUNT_MOVEMENTS`](../03-finance/ACCOUNT_MOVEMENTS.md) + [`LEDGER_TABLES_STRATEGY`](./LEDGER_TABLES_STRATEGY.md).

## Plan antes de código

1. Listar entidades tocadas y transiciones permitidas.  
2. Listar invariantes (tenant, period lock, etc.).  
3. Definir firma del **service** (entrada/salida), no la UI primero.  
4. Recién entonces implementar (cuando el repo exista).

## Cuándo actualizar documentación **antes** que código

- Cambia regla de negocio visible al usuario o a reportes.  
- Nuevo estado o evento de dominio.  
- Contradicción detectada entre docs → **arreglar doc** o elevar a [`OPEN_QUESTIONS`](../00-product/OPEN_QUESTIONS.md) / `DECISION_LOG`.

## Cómo registrar dudas

- Si falta spec: agregar a [`OPEN_QUESTIONS`](../00-product/OPEN_QUESTIONS.md) o nota en PR.  
- Si es duda técnica de modelado: [`PENDING_ARCHITECTURE_ITEMS.md`](./PENDING_ARCHITECTURE_ITEMS.md) o ADR borrador.

## Decisiones lockeadas

- Si el código “necesita” violar un `D-xxx` → **parar** y pedir cambio de producto primero.

## Handoffs entre sesiones

- Dejar en el PR o issue: **módulo**, **docs leídos**, **decisiones**, **pendientes**, **riesgos**.  
- No pegar páginas enteras de docs en el chat; usar **rutas** y **anchors** (`§`, IDs `BR-xxx`).

## Ahorro de tokens

- Citar: `"Según 02-modules/CERTIFICATIONS.md §10 …"` en lugar de re-pegar el archivo.  
- Usar búsqueda en repo (`grep`/IDE) para encontrar el símbolo exacto antes de pedir contexto masivo.

## Prompts tipo (Cursor / Claude)

**Exploración**  
> Leé AGENTS.md y el módulo X en 02-modules. No escribas código. Listá archivos que tocarías y reglas que aplican (BR-*, D-*).

**Implementación (cuando exista repo)**  
> Implementá <caso de uso> usando solo packages/services + validators. No Prisma en apps/web. Tests en packages/services/src/<module>/tests.

**Fix financiero**  
> Antes de cambiar números, leé MONEY_MODEL.md y LEDGER_TABLES_STRATEGY.md. Explicá impacto en account_movement y en reportes.

## Referencias

- [`AGENT_GUARDRAILS.md`](./AGENT_GUARDRAILS.md)  
- [`CODE_REVIEW_CHECKLIST.md`](./CODE_REVIEW_CHECKLIST.md)
