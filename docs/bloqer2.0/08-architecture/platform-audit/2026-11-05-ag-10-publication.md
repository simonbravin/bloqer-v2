# Publicación de AG-10 — 05/11/2026

**Estado.** AG-10 integrada en el repositorio público, desplegada en Production y verificada en la base del portal.

## Entrega

- Se publicaron los 156 archivos del [cierre local de AG-10](./2026-11-05-ag-10-treasury-accounting.md), incluidas las dos migraciones aditivas aprobadas. El cotejo previo fijó las rutas, comprobó sus hashes y revisó patrones de credenciales.
- Commit de entrega `9a2a32215dc3aed3690038fed0742c4c446a716c`. [PR #8](https://github.com/simonbravin/bloqer-v2/pull/8) integrado en `main` como `77c9596cdc17ccc327ec96e5205cfd5425be6dcf`. El árbol `94500a01e1f747f4c2a4379bd152d93779d4bd19` coincide exactamente con la entrega.
- Controles de calidad aprobados en [CI del PR](https://github.com/simonbravin/bloqer-v2/actions/runs/42079991805) y [CI de main](https://github.com/simonbravin/bloqer-v2/actions/runs/42080744000). Los jobs E2E se omitieron por secretos ausentes.

## Portal y base

- El despliegue automático desde GitHub terminó con estado `success` en Production a las 15:43:29 de Argentina (18:43:29 UTC). GitHub registró el deployment `7582105341` para el SHA exacto del merge. [Despliegue en Vercel](https://vercel.com/simons-projects-6be5b5cc/bloqer-v2-web/7V1XS4PdTjd4dZZysri6UzRwR7mN).
- Consulta directa de solo lectura a las 18:42 UTC en `production` (`ep-cold-mouse-appkpn84`, `neondb`). Se comprobaron 73 migraciones terminadas, cero fallidas o pendientes en el registro y ambas migraciones nuevas D-134/D-137, terminadas a las 18:29 UTC. Los checksums coinciden con los archivos aprobados. Las cuatro columnas opcionales están presentes con sus tipos. El build integrado gestiona las migraciones.
- Después del despliegue, las rutas públicas de acceso y recuperación de [portal.bloqer.app](https://portal.bloqer.app) respondieron HTTP 200. La comprobación en Production se limita al acceso público, el deployment y el estado de migraciones en solo lectura.
- Evidencia local en `output/platform-audit/release-ag10-2026-11-05/`. `merged-tree.json`, `ci-main.json`, `commit-status.json`, `deployments.json`, `production-deployment-status.json`, `production-before.json`, `production-after.json` y `portal-http-after-deploy.txt`. El cierre funcional previo conserva la verificación de ambas migraciones en el entorno aislado.

AG-11 comenzó sobre el árbol de entrega y mantiene sus cambios en el espacio de trabajo.
