# Risk register — Bloqer 2.0 implementation

> Registro vivo de **riesgos técnicos y de entrega**. Actualizar al cerrar fases.

| ID | Riesgo | Fase | Probabilidad | Impacto | Mitigación | Owner |
|---|---|---|---|---|---|---|
| R-01 | Fuga de datos entre tenants | 1–∞ | M | Crítico | Middleware Prisma, tests isolation, revisión PR checklist | Eng |
| R-02 | Reglas financieras solo en UI | 2–3 | A | Crítico | Service layer obligatorio, [`AGENT_GUARDRAILS`](./AGENT_GUARDRAILS.md) | Eng |
| R-03 | Drift schema vs docs funcionales | 0–2 | A | Alto | Migraciones revisadas; cambios funcionales primero en docs | PM+Eng |
| R-04 | Doble conteo en reporting costos | 4 | M | Alto | BR-COS-002 tests; queries revisadas por finance-minded dev | Eng |
| R-05 | Cobranzas/pagos duplicados (reintentos) | 3 | M | Alto | Idempotency-Key + constraint | Eng |
| R-06 | Period lock bypass | 3 | B | Alto | Tests servicio + auditoría | Eng |
| R-07 | Performance sin índices tenant-first | 4–5 | A | Medio | [`INDEXING_STRATEGY`](./INDEXING_STRATEGY.md) | Eng |
| R-08 | Q-001 multi-empresa mal modelado | 1 | M | Alto | Modelo 1:N company desde inicio ([`DATA_MODEL_OVERVIEW`](./DATA_MODEL_OVERVIEW.md)) | Architect |
| R-09 | Dependencia de features no resueltas en OPEN_QUESTIONS | 2–4 | A | Medio | Etiquetar issues “blocked-by-Q-xxx” | PM |
| R-10 | Deuda de observabilidad → incidentes largos | 5 | A | Medio | Logs estructurados desde Phase 3 crítico | Eng |
| R-11 | Migraciones Neon en preview rompen datos | 0–1 | M | Medio | Branches Neon por dev; política preview | Eng |

**Leyenda probabilidad:** A=Alta, M=Media, B=Baja.

## Vinculación

- Pendientes técnicos: [`PENDING_ARCHITECTURE_ITEMS.md`](./PENDING_ARCHITECTURE_ITEMS.md)  
- Preguntas producto: [`../00-product/OPEN_QUESTIONS.md`](../00-product/OPEN_QUESTIONS.md)

## Qué NO hacer

- No usar este registro como sustituto de issues en tracker; **copiar** IDs a Linear/Jira/GitHub.
