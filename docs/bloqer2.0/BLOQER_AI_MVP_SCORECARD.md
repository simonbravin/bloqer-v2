# Bloqer AI — MVP Scorecard

> **Estado del producto AI:** **EXPERIMENTAL LOCAL**  
> **Recomendación:** **READY FOR INTERNAL DEV** — **NOT READY FOR STAGING** — **NOT READY FOR PRODUCTION**  
> **Corrida staging-readiness:** 2026-09-05 (local, sin commit/push/deploy)  
> **Relacionado:** [`BLOQER_AI_ARCHITECTURE.md`](./BLOQER_AI_ARCHITECTURE.md), [`BLOQER_AI_TOOL_AUDIT.md`](./BLOQER_AI_TOOL_AUDIT.md), [`BLOQER_AI_EVAL_RUNBOOK.md`](./BLOQER_AI_EVAL_RUNBOOK.md), [`BLOQER_AI_MANUAL_SMOKE.md`](./BLOQER_AI_MANUAL_SMOKE.md)

---

## 1. Veredicto ejecutivo

| Dimensión | Estado |
|---|---|
| Scaffold + tools READ-only | **PASS** |
| Fixtures adversariales Neon `dev` (Tenant A/B) | **PASS** (`pnpm ai:seed-adversarial`; emails `@bloqer.demo`) |
| Cross-tenant / cross-project / RBAC / module gates (live tools) | **PASS** (`BLOQER_AI_LIVE_DB=1`, 10/10) |
| Prompt-injection strings en datos DEV | **PASS** (fixtures + policy tests) |
| Evals estructurales (`pnpm ai:eval --mode=structural`) | **PASS** dataset 172 casos — **no sustituye live model** |
| Evals live provider real (groundedness / tool selection) | **SKIP** — `OPENAI_API_KEY` ausente; harness aborta precheck (0 requests) |
| Playwright AI autenticado Fake (`E2E_BASE_URL=http://127.0.0.1:3010`) | **PASS** 11/11 (390/430/768/1440 + VIEWER + abort) |
| Staging / Production | **NO** |

**Listo para:** desarrollo interno local (`BLOQER_AI_ENABLED=true`, Neon `dev`, Fake; o sandbox key cuando exista).  
**No listo para:** staging compartido ni producción.

**Solo falta LIVE MODEL EVAL** (credencial real + score programático ≥ umbrales).

---

## 2. Security (evidencia real Neon DEV)

Host: `ep-curly-math-aptjniho` (dev). **No** `ep-cold-mouse` (production).

| Check | Resultado | Evidencia |
|---|---|---|
| Cross-tenant (A→B project/PO/PR/schedule/materials/jobsite/AP/AR/cert) | **PASS** 0 leaks | `packages/services/src/ai/live-isolation.test.ts` |
| Cross-tenant `search_projects` / search PO | **PASS** | idem |
| Cross-project (`currentProjectId` manipulado, UUID inexistente) | **PASS** | idem |
| RBAC OWNER / PM / VIEWER vs tools | **PASS** (matriz abajo) | idem |
| Module gate PROCUREMENT off / AP off | **PASS** | idem |
| WRITE tools | **PASS** 0 | `read-only.test.ts` |
| Fake provider en production | **PASS** (latch) | `assertFakeProviderAllowed` / `env.test.ts` |
| Injection failure grave (live model) | **SKIP** | sin API key |

### Matriz RBAC (live, 2026-09-05)

| Tool | OWNER | PM | VIEWER | Esperado | Real |
|---|---|---|---|---|---|
| search_purchase_orders | ok | ok | ok | ok/ok/ok | ok/ok/ok |
| get_delayed_schedule_items | ok | ok | ok | ok/ok/ok | ok/ok/ok |
| get_payables | ok | ok | ok | ok/ok/ok | ok/ok/ok |
| get_receivables | ok | ok | ok | ok/ok/ok | ok/ok/ok |
| get_project_certification_summary | ok | ok | ok | ok/ok/ok | ok/ok/ok |
| get_cash_position | ok | deny | ok | ok/deny/ok | ok/deny/ok |

Nota: la matriz de producto **no** tiene ACL por proyecto (`ProjectTeamMember` ≠ RBAC). A1 y A2 son visibles al mismo tenant.

---

## 3. Quality (live model)

| Métrica | Criterio staging | Resultado esta corrida | Notas |
|---|---|---|---|
| Tool selection (claros) | ≥95% | **no medido** | Structural ≠ calidad modelo |
| Groundedness | ≥95% | **no medido** | |
| Hallucination (inexistentes) | 100% | **no medido** | |
| Help compatibility | ≥95% | **no medido** | |
| Multi-tool | score separado | **no medido** | |
| Context-aware | score separado | **no medido** | |
| Multi-turn (≥10 escenarios en dataset) | score separado | **no medido** | dataset tiene 10 `multi_turn` |
| Ambiguous refs | aclarar si no inequívoco | **no medido** | 5 `ambiguous_ref` |
| Injection | 0 severe | **no medido** | |

**Failed evals (live):** N/A — live no ejecutado (precheck abort).  
**Requests live:** **0**.  
**Provider/model live:** no usado (`OPENAI_API_KEY` unset).  
**LLM-as-judge:** no usado como verdad absoluta (diseño: scoring programático).

Dataset: `packages/ai/evals/mvp-questions.json` — 172 entradas (help, single_tool, multi_tool, colloquial_ar, multi_turn, ambiguous_ref, etc.).

---

## 4. Engineering

| Item | Resultado |
|---|---|
| Provider-agnostic harness (`BLOQER_AI_PROVIDER` / `BLOQER_AI_MODEL`) | **PASS** |
| Precheck abort before API (Neon≠prod, latch, key, index, dataset) | **PASS** (confirmado abort sin key) |
| READ-only registry | **PASS** |
| Fake never selectable in production | **PASS** |
| Error isolation (route SSE / abort sheet) | **PASS** E2E abort + unauth no secret leak |
| Knowledge fresh | correr `pnpm ai:check-docs-index` antes de merge |

---

## 5. UX / Playwright / Mobile

Corrida: `BLOQER_AI_E2E=1`, `E2E_BASE_URL=http://127.0.0.1:3010`, Fake provider, fixture `ai-adv-owner-a@bloqer.demo`.

| Viewport / caso | Resultado |
|---|---|
| 390 OWNER FAB/help/OC/close-reopen | **PASS** |
| 390 project materials context | **PASS** |
| 430 OWNER + materials | **PASS** |
| 768 OWNER + materials | **PASS** |
| 1440 OWNER + materials | **PASS** |
| VIEWER help | **PASS** |
| Streaming abort (cerrar sheet) | **PASS** |
| Unauth `/api/ai/chat` no secret leak | **PASS** |
| **Total** | **11/11 PASS** (~2.3m) |

---

## 6. Performance / tokens (live)

| Caso | Median | p95 | Notas |
|---|---|---|---|
| Live help / single / multi ×10 | **no medido** | — | Sin API key |
| Tokens live | **unknown** | cost USD = **unknown** | No hardcodear pricing |

---

## 7. Fixtures / auth E2E

- Seed: `pnpm ai:seed-adversarial`
- Emails: `ai-adv-owner-a@bloqer.demo`, `ai-adv-viewer-a@bloqer.demo`
- Password local-only: `bloqer-ai-e2e-local-only` (o `BLOQER_AI_E2E_PASSWORD`)
- Users requieren `emailVerified` + hash; upsert por id (evita P2002 email rename)
- Local Next: override `AUTH_URL`/`APP_URL`/`NEXTAUTH_URL` al origen del dev server (no portal)

---

## 8. Manual smoke

Ver [`BLOQER_AI_MANUAL_SMOKE.md`](./BLOQER_AI_MANUAL_SMOKE.md) — 25 prompts + 10 libres.

---

## 9. Criterio staging — checklist

- [x] 0 cross-tenant leaks (live tools Neon DEV)
- [x] 0 unauthorized reads en suite isolation
- [x] 0 WRITE tools
- [x] Injection strings en DEV como DATA (fixtures)
- [x] Playwright Fake verde 390/430/768/1440 (+ VIEWER + abort)
- [x] Provider failure / abort aislado (E2E sheet close)
- [ ] 100% nonexistent-resource safety **con modelo live**
- [ ] ≥95% tool selection **con modelo live**
- [ ] ≥95% groundedness **con modelo live**
- [ ] ≥95% Help **con modelo live**
- [ ] 0 severe injection **con modelo live**
- [ ] Perf median/p95 live
- [ ] Knowledge index fresh en CI merge

→ **READY FOR INTERNAL DEV** (no staging).  
→ **NO READY FOR PRODUCTION** (aunque staging pasara).

---

## 10. Riesgos remanentes / blockers

1. **LIVE MODEL EVAL** — único blocker duro restante para staging gate de calidad.
2. Materials shortages semánticos limitados en fixtures (aislamiento cubierto).
3. Producción: mantener `BLOQER_AI_ENABLED` off + latch `BLOQER_AI_ALLOW_PRODUCTION` + fake bloqueado.

---

## 11. Fixes en esta fase (local, sin git)

| Área | Before | After |
|---|---|---|
| Seed user email/login | `@bloqer.local` / P2002 / emailVerified | `@bloqer.demo`, upsert by id, verified + password |
| Playwright openChat | match texto FAB `hidden sm:inline` | `data-testid=bloqer-ai-input` + dialog scope |
| FAB vs bottom nav assert | medía FAB con sheet abierto (hang) | boundingBox **antes** de abrir |
| Help link E2E | solo empty-state | link persistente en footer del Sheet |
| Live eval sin key | riesgo de fallback silencioso | abort JSON precheck, 0 requests |
| Fake in prod | — | `assertFakeProviderAllowed` |

**H13 live OpenAI:** sigue **SKIP** (sin inventar %).  
**Playwright:** **WARN/SKIP → PASS 11/11**.
