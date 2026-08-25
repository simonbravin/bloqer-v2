# Capturas automáticas — Guía Operativa

Pipeline reproducible para generar screenshots reales de Bloqer v2 a partir de `GUIA_OPERATIVA_BLOQER_V2.md`.

## Requisitos

1. App local con `.env` completo (`AUTH_SECRET`, `DATABASE_URL`, …).
2. Dev server **con dotenv**: `npx dotenv -e .env -- pnpm --filter @bloqer/web dev`
3. Credenciales vía env (nunca en Git):
   - `DOCS_BASE_URL` (default: `http://localhost:3000`)
   - `DOCS_USER_EMAIL` / `DOCS_USER_PASSWORD` (o `E2E_*` / `SEED_*` como fallback)
4. **Tenant demo aislado** sin datos reales de clientes. El pipeline rechaza capturas autenticadas si detecta marcas de tenant productivo (configurable con `DOCS_ALLOW_REAL_TENANT=1` solo en local controlado).
5. Playwright Chromium: `pnpm --filter @bloqer/web exec playwright install chromium`

## Comandos (desde la raíz del repo)

| Comando | Descripción |
|--------|-------------|
| `pnpm db:seed:docs` | Seed idempotente del tenant demo + `docs-demo-ids.json` |
| `pnpm docs:manifest` | Regenera `screenshots-manifest.json` desde la guía |
| `pnpm docs:capture-pilot` | Piloto: capturas canónicas |
| `pnpm docs:capture-full` | Capturas restantes (navegación + interacciones) |
| `pnpm docs:capture-pending` | Suite focalizada de capturas con datos/interacciones complejas |
| `pnpm docs:capture-validate` | Valida PNG + `CAPTURE_REPORT.md` (tamaño/dimensiones; el overlay de error se rechaza en la captura) |
| `pnpm docs:apply-images` | Inserta imágenes OK en el Markdown (idempotente) |
| `pnpm docs:capture-guide` | Manifest → pilot → full → pending → validate → MD → DOCX |
| `pnpm docs:build-guide` | Genera `Guía_Operativa_Bloqer_v2.docx` |

## Credenciales demo

- Usuario: `docs-guide@bloqer.demo` (solo tenant `demo` / Bloqer Demo Construcciones)
- Password: `DOCS_USER_PASSWORD` o `SEED_USER_PASSWORD`
- IDs estables: `guides/docs-demo-ids.json` (sin tokens ni secretos)

## Fuera de la guía cliente

La consola de plataforma (`/platform`) **no** se documenta en la guía operativa ni en el DOCX. Es administración interna del servicio.

## Overlay de error (dev)

La captura **falla** si hay overlay de Next.js (`Runtime TypeError`, toast `N Issue(s)`), incluso dentro de `<nextjs-portal>` / iframes. `docs:capture-validate` no hace OCR: solo comprueba que el PNG exista y el ancho coincida.

## Salidas

- PNG: `guides/assets/screenshots/{nn}-{slug}.png`
- Manifest: `guides/screenshots-manifest.json`
- Reporte: `guides/CAPTURE_REPORT.md`
- Validación JSON: `guides/capture-validation.json`

## Piloto (5 capturas)

IDs en manifest: `01`, `02`, `19`, `23`, `27`.

## Datos demo pendientes

El seed mínimo (`db:seed`) crea usuario + tenant `demo`. Para capturas autenticadas hace falta:

- Usuario dedicado solo al tenant demo (no mezclar con tenants productivos).
- `SEED_USER_PASSWORD` opcional en seed para habilitar login por credenciales.
- Dataset operativo (proyecto, cronograma, OC CONFIRMED, …) vía workflows reales — **sin inventar estados**.

Variables opcionales: `DOCS_PROJECT_ID`, `DOCS_PO_ID`, `DOCS_BUDGET_ID`, `DOCS_ACCOUNT_ID`.

## Help Center ([D-090])

El centro de ayuda in-app (`/ayuda`) usa un **catálogo tipado** en `apps/web/features/help/`, no el manifest de capturas. Las capturas de la guía operativa pueden enlazarse desde fichas vía `guideRef`; no duplicar PNG en el help center. Ver [`HELP_CENTER.md`](../../08-architecture/HELP_CENTER.md).
