# E2E mínimo (Phase 5 / P-REP-03)

Ubicación canónica: `apps/web/e2e` ([`PENDING_ARCHITECTURE_ITEMS.md`](../../../docs/bloqer2.0/08-architecture/PENDING_ARCHITECTURE_ITEMS.md) P-REP-03).

## Happy path

1. Login con credenciales.
2. Navegar a Tesorería (`/tesoreria`).

## Cómo correr

```bash
# App ya levantada (staging o local)
export E2E_BASE_URL=https://staging.example.com
export E2E_USER_EMAIL=...
export E2E_USER_PASSWORD=...
pnpm --filter @bloqer/web test:e2e
```

Sin esas variables, el spec se **omite** (`test.skip`) para no romper CI local.

## CI

Job `e2e` en `.github/workflows/ci.yml` solo corre si existen secrets `E2E_BASE_URL`, `E2E_USER_EMAIL`, `E2E_USER_PASSWORD`.
