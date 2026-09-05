# Bloqer AI — Eval Runbook

> **Propósito:** cómo correr evals fake (CI/local) vs live (opcional, manual).  
> **Nunca** apuntar evals a producción (`portal.bloqer.app` / Neon `production`).  
> **Relacionado:** [`BLOQER_AI_MVP_SCORECARD.md`](./BLOQER_AI_MVP_SCORECARD.md), `packages/ai/evals/mvp-questions.json`, [`BLOQER_AI_ARCHITECTURE.md`](./BLOQER_AI_ARCHITECTURE.md).

---

## 1. Artefactos

| Artefacto | Path |
|---|---|
| Preguntas MVP | `packages/ai/evals/mvp-questions.json` |
| Fake provider | `packages/ai/src/providers/fake/fake-provider.ts` (`createFakeAiProvider`) |
| Orchestration | `packages/ai/src/orchestration/run-agent.ts` |
| Knowledge check | `pnpm ai:check-docs-index` / `pnpm ai:index-docs` |
| Tool registry | `packages/services/src/ai/create-default-registry.ts` |

Cada ítem del JSON puede incluir: `id`, `category`, `question`, y opcionales `expectTools`, `expectToolsAnyOf`, `expectContains` / `expectContainsAny`, `requiresProject`, `noProjectContext`, `moduleDisabled`, `expectNoWrite`, `expectAskClarification`, `expectForbiddenOrNotFound`.

---

## 2. Preflight (siempre)

```bash
# Desde la raíz del monorepo
pnpm ai:check-docs-index
pnpm --filter @bloqer/ai test
pnpm --filter @bloqer/services test -- src/ai
```

Si `ai:check-docs-index` falla: regenerar con `pnpm ai:index-docs` y commitear el JSON generado **solo** si el cambio de docs es intencional (Change Impact Policy).

---

## 3. Modo fake (CI / default)

```bash
pnpm ai:eval -- --provider=fake --output=evals/reports/structural-latest.json
```

Valida orquestación/heurística sobre `expectTools` **sin** red. **No** cuenta como calidad de modelo para el gate de staging.

También: `FakeAiProvider` en unit tests (`run-agent.test.ts`).

---

## 4. Modo live (opcional, manual)

```bash
# Neon DEV only — assert host ≠ ep-cold-mouse
pnpm ai:seed-adversarial
# Isolation / RBAC / module gates (tools reales):
# PowerShell: $env:BLOQER_AI_LIVE_DB='1'; pnpm --filter @bloqer/services test -- src/ai/live-isolation.test.ts

# Live provider (requiere key sandbox):
$env:BLOQER_AI_LIVE='1'
$env:OPENAI_API_KEY='…'
pnpm ai:eval -- --provider=openai --model=gpt-4.1-mini --output=evals/reports/live-latest.json
```

| Variable | Valor | Notas |
|---|---|---|
| `BLOQER_AI_LIVE=1` | requerido para live provider | |
| `BLOQER_AI_LIVE_DB=1` | suite isolation | |
| `OPENAI_API_KEY` | sandbox | ausente → eval cae a structural |
| `BLOQER_AI_BASE_URL` | opcional | OpenAI-compatible |
| Neon | branch **dev** | Nunca production |

---

## 4b. Manual smoke (~20)

Ítems `manual_smoke-1` … `manual_smoke-20` en `packages/ai/evals/mvp-questions.json` (cómo viene la obra, atrasos, OC, materiales, CxP/CxC, SC, comprometido, etc.). Probar a mano con flag on + Fake o provider sandbox.

---

## 5. Categorías de evaluación

| Categoría | Qué valida |
|---|---|
| `help` | `search_bloqer_knowledge` / respuestas de guía |
| `single_tool` | Una tool operativa clara |
| `multi_tool` | Varias tools aceptables (`expectToolsAnyOf`) |
| `permissions` | No write; module disabled; foreign project |
| `ambiguous` | Pedir aclaración / sin asumir proyecto |
| `hallucination` | “No encontré…” ante entidades inventadas |
| `adversarial_injection` | Ignorar instrucciones embebidas en datos/pregunta |
| `context` | Contexto de sesión / proyecto actual |
| `colloquial_ar` | Formulación argentina coloquial |
| `manual_smoke` | Lista humana para prueba local |

---

## 6. Playwright E2E

Archivo: `apps/web/e2e/bloqer-ai.spec.ts`.

```bash
$env:BLOQER_AI_E2E='1'
$env:E2E_BASE_URL='https://…'   # no asumir localhost
# Posture (AI off): FAB ausente + POST 503
# Fake chat (opcional): BLOQER_AI_ENABLED=true BLOQER_AI_PROVIDER=fake + E2E_USER_*
pnpm --filter @bloqer/web exec playwright test e2e/bloqer-ai.spec.ts
```

Viewports: 390 / 768 / 1440. Sin `E2E_BASE_URL` → skip (no fallar CI).

---

## 7. Reglas de seguridad del runbook

1. **Nunca** producción (app ni Neon `production`).
2. **Nunca** habilitar `BLOQER_AI_ALLOW_PRODUCTION` para “probar evals”.
3. Fake/structural en CI; live solo manual y opcional.
4. No loguear prompts completos en tickets públicos.
5. Tras cambiar docs/help/tools: aplicar [`CHANGE_IMPACT_POLICY.md`](./CHANGE_IMPACT_POLICY.md) y actualizar preguntas del JSON si el significado cambió.
6. IDs de fixtures adversariales: solo en tests/fixtures — no en copy de producto.

