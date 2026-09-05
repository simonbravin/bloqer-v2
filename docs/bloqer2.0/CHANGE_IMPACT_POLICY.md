# Bloqer Change Impact Policy (Help + Guía + Bloqer AI)

> **Idioma:** español (es-AR).  
> **Estado:** vigente.  
> **Canon también en:** [`.cursor/rules/operational-docs.mdc`](../../.cursor/rules/operational-docs.mdc) (`alwaysApply`), [`AGENTS.md`](./AGENTS.md), [`08-architecture/AGENT_GUARDRAILS.md`](./08-architecture/AGENT_GUARDRAILS.md).  
> **Relacionado:** [D-090](./00-product/DECISION_LOG.md), [`08-architecture/HELP_CENTER.md`](./08-architecture/HELP_CENTER.md), [`BLOQER_AI_ARCHITECTURE.md`](./BLOQER_AI_ARCHITECTURE.md), skill `.cursor/skills/operational-help-docs/`.

---

## 1. Propósito

Todo cambio que altere lo que el usuario **ve o hace** en Bloqer (rutas, menús, etiquetas, flujos, estados, permisos, module gates, KPIs o reglas operativas/financieras) debe mantener alineados, **en el mismo PR**:

1. **Guía operativa** — [`GUIA_OPERATIVA_BLOQER_V2.md`](./GUIA_OPERATIVA_BLOQER_V2.md)
2. **Centro de Ayuda in-app** — `apps/web/features/help/`
3. **Bloqer AI** — knowledge, tools, system policy y/o evals, según el impacto

La IA es otra interfaz del mismo producto: si la UI o la guía cambian de significado, la IA no puede seguir respondiendo con el comportamiento viejo.

---

## 2. Cuándo aplica

Aplica cuando el cambio afecta (lista no exhaustiva):

| Área | Ejemplos |
|---|---|
| Rutas / navegación | `/proyectos/[id]/ordenes-compra`, menú lateral, deep links |
| Etiquetas UI | “En revisión”, “Comprometido”, renombres de pantallas |
| Flujos operativos | crear SC → OC → recepción; aprobar OC; cargar parte de obra |
| Estados / máquinas | `SUBMITTED` → `IN_REVIEW`, nuevos estados documentados |
| Permisos / roles | quién ve CxP empresa, quién aprueba compras |
| Module gates | `PROCUREMENT`, `AP`, `AR`, `TREASURY`, `SCHEDULE`, … |
| KPIs / agregados | aging, faltantes de materiales, progreso de cronograma |
| Reglas de negocio visibles | qué significa “vencido”, qué cuenta como atrasada |

**No inventar procedimientos:** la guía, la ayuda y las descriptions de tools deben describir **lo que hace el código hoy**.

---

## 3. Cuándo marcar `sin impacto documental/AI`

Usá explícitamente en el PR / descripción del cambio:

```text
sin impacto documental/AI
```

Solo si el cambio es **exclusivamente** de este tipo:

- refactor interno sin cambio de comportamiento observable
- CSS / layout cosmético sin renombrar flujos ni etiquetas de negocio
- tests / typecheck / perf sin alterar contratos funcionales
- docs técnicas de implementación que no cambian la narrativa de usuario
- dependencias internas sin efecto en pantallas, estados o tools AI

Si hay **cualquier** duda de si el usuario o la IA “entenderían distinto” el producto → **no** uses `sin impacto documental/AI`; aplicá el checklist.

---

## 4. Checklist (antes de cerrar un cambio funcional)

- [ ] ¿Cambia Centro de Ayuda? (`apps/web/features/help/` — ficha, keywords, `relatedSlugs`, `guideRef`)
- [ ] ¿Cambia Guía Operativa? (`GUIA_OPERATIVA_BLOQER_V2.md`)
- [ ] ¿Cambia Bloqer AI knowledge (docs/help indexados)?
- [ ] ¿Cambia alguna AI tool / description / schema / implementación?
- [ ] ¿Cambia algún eval AI? (`packages/ai/evals/`)
- [ ] ¿Cambia permisos/contexto que la IA debe entender? (system prompt, `get_current_context`, module gates)

Completá solo lo que aplica. Dejá vacío / N/A lo que no toca el PR, pero **revisá** todas las filas.

---

## 5. Qué significa “actualizar Bloqer AI”

No es un único comando. Según el tipo de cambio, puede incluir una o más de estas capas:

| Capa | Qué actualizar | Cómo |
|---|---|---|
| **Knowledge** | Índice BM25 de docs + cobertura de ayuda | Regenerar con `pnpm ai:index-docs`; verificar con `pnpm ai:check-docs-index`. Preferir **fallar en CI** si el índice está stale al mergear cambios AI/docs (no silenciar stale). |
| **Tool description / schema** | Texto que ve el modelo + Zod/`jsonSchema` | Archivos en `packages/services/src/ai/tools/*` |
| **Tool implementation** | Services reutilizados, límites, filtros, mapeo de campos | Mismo path; debe seguir pasando por services + RBAC + tenant |
| **System policy** | Reglas del system prompt | `packages/ai/src/policy/system-prompt.ts` (+ tests) |
| **Evals** | Preguntas MVP / adversarial / permisos | `packages/ai/evals/mvp-questions.json` (+ runbook) |

Actualizá **solo** las capas cuyo significado funcional cambió. No regeneres knowledge “por las dudas” si el PR es puramente un fix de UI sin docs.

---

## 6. Ejemplo: estado de OC `SUBMITTED` → `IN_REVIEW`

Supuesto: se decide (y se documenta en `STATE_MACHINES.md` + módulo) que las órdenes de compra dejan de usar `SUBMITTED` como “pendiente de aprobación” y pasan a `IN_REVIEW`.

| Artefacto | Acción |
|---|---|
| `01-domain/STATE_MACHINES.md` + módulo compras | Actualizar máquina de estados y labels |
| `GUIA_OPERATIVA_BLOQER_V2.md` | Explicar el nuevo flujo de aprobación |
| `apps/web/features/help/` | Fichas “aprobar OC”, “estados de OC”, keywords (`en revisión`, `pendiente aprobación`) |
| UI | Labels, filtros, badges |
| AI tools | `search_purchase_orders` (`pendingApproval` filtraba `SUBMITTED`), `get_pending_purchase_orders` (mismo filtro), descriptions si mencionan el estado |
| System policy | Solo si el prompt cita estados concretos (hoy no debería hardcodear enums de OC) |
| Knowledge index | `pnpm ai:index-docs` + `pnpm ai:check-docs-index` si cambió la guía/docs indexados |
| Evals | Preguntas “OC esperando aprobación” / permisos de módulo PROCUREMENT |

Omitir cualquiera de estos pasos deja la UI, la ayuda y la IA desfasadas.

---

## 7. Ubicaciones canónicas (no negociable)

| Lugar | Rol |
|---|---|
| [`.cursor/rules/operational-docs.mdc`](../../.cursor/rules/operational-docs.mdc) | Regla `alwaysApply` para agentes en Cursor |
| [`AGENTS.md`](./AGENTS.md) (raíz y `docs/bloqer2.0/`) | Obligatorio antes de tocar código / docs |
| [`08-architecture/AGENT_GUARDRAILS.md`](./08-architecture/AGENT_GUARDRAILS.md) | Guardrails técnicos + referencia a esta policy |
| Este archivo | Detalle y ejemplos de la Change Impact Policy |

Si hay contradicción entre un resumen corto y este documento, **prevalece este archivo** para el alcance Help + Guía + Bloqer AI.

---

## 8. Anti-patrones

- Actualizar solo la UI y dejar la guía vieja.
- Actualizar la guía y no el catálogo de ayuda (o al revés).
- Cambiar un filtro de tool AI sin tocar evals que asumen el estado anterior.
- Regenerar el índice de knowledge a mano editando JSON sin pasar por `ai:index-docs`.
- Marcar `sin impacto documental/AI` en un PR que renombra un estado visible.
- Inventar pasos en la ayuda que el producto aún no implementa.
