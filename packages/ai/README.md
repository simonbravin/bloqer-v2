# @bloqer/ai

Provider-agnostic AI orchestration for Bloqer.

## Layout

- `src/types.ts` — normalized messages/tools/usage
- `src/provider.ts` + `provider-registry.ts` — `AiProvider` abstraction
- `src/providers/*` — vendor adapters (OpenAI first)
- `src/orchestration/` — tool loop (Bloqer tools, not vendor tools)
- `src/knowledge/` — local BM25 retrieval (independent of LLM vendor)
- `scripts/index-docs.ts` — reproducible docs → `knowledge/generated/docs-index.json`

Bloqer domain tools live in `@bloqer/services` (`src/ai/`), not here.

## Index docs

```bash
pnpm ai:index-docs
```

## Env

See root `.env.example` (`BLOQER_AI_*`, provider keys).
