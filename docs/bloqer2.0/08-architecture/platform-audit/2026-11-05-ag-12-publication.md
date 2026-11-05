# Publicación de AG-12 — 05/11/2026

**Estado.** Integrada en el repositorio y desplegada en Production.

- Los 149 archivos del [cierre local](./2026-11-05-ag-12-reporting.md) coincidieron con el manifiesto. Se verificaron los hashes de las 128 fuentes compiladas, el diff y los patrones de credenciales. El esquema, las migraciones, las dependencias y el entorno conservan su revisión base.
- Commit `65c2d0ad907f6736e717adc9e10cb2c0251eb837`. [PR #10](https://github.com/simonbravin/bloqer-v2/pull/10) integrado en `main` como `8c18f331c5193723322e96d449036a122600e47e`. El árbol `cf4a10d8309f712becc6f78b3a04c082c42b3dad` coincide en ambos commits.
- Calidad aprobada en [CI del PR](https://github.com/simonbravin/bloqer-v2/actions/runs/42098538341) y [CI de main](https://github.com/simonbravin/bloqer-v2/actions/runs/42099490390). El job E2E remoto se omitió por configuración de secretos. El lote conserva las 2.733 pruebas generales, 32 casos SQL y la muestra visual local del cierre.
- [Vercel](https://vercel.com/simons-projects-6be5b5cc/bloqer-v2-web/5r1cK3V1X6VUdanBH2xFdSWM8SHT) confirmó Production a las 17:05:23 de Argentina (20:05:23 UTC), deployment `7584025726` del commit integrado. Las rutas de acceso y recuperación de [portal.bloqer.app](https://portal.bloqer.app) respondieron HTTP 200.
- Evidencia en `output/platform-audit/release-ag12-2026-11-05/`. AG-13 se mantiene separada de la publicación.
