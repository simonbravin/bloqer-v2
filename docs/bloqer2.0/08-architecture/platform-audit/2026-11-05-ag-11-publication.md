# Publicación de AG-11 — 05/11/2026

**Estado.** AG-11 integrada en el repositorio y desplegada en Production.

- Los 81 archivos del [cierre de AG-11](./2026-11-05-ag-11-field-jobsite.md) coincidieron con el manifiesto local, incluidos los hashes de las 70 fuentes verificadas en la compilación. Se comprobó el diff y se revisaron patrones de credenciales. El esquema, las migraciones, las dependencias y el entorno coinciden con la base de la entrega.
- Commit `86134c599cb6c28ad2a3961d9f034169c0c312a5`. [PR #9](https://github.com/simonbravin/bloqer-v2/pull/9) integrado en `main` como `06963cfaa3b02b211e9a0acf1439128a9e50c931`. El árbol exacto de la entrega es `79a6ead55206f1d2a29e989018b8090482a3fe20` en ambos commits.
- Calidad aprobada en [CI del PR](https://github.com/simonbravin/bloqer-v2/actions/runs/42088785461) y [CI de main](https://github.com/simonbravin/bloqer-v2/actions/runs/42090242518). Los E2E remotos dependen de secretos configurados y el job se omitió en el PR. La evidencia local del lote conserva las 2.706 pruebas generales, 49 casos SQL aislados y la muestra en tres tamaños.
- [Vercel](https://vercel.com/simons-projects-6be5b5cc/bloqer-v2-web/2mniWwHs37aKYYsiKfgFpgxWkPsE) confirmó Production con estado `success` a las 16:06:46 de Argentina (19:06:46 UTC), deployment GitHub `7582748472` para el SHA exacto. Las rutas públicas de acceso y recuperación de [portal.bloqer.app](https://portal.bloqer.app) respondieron HTTP 200 después del despliegue.
- Evidencia en `output/platform-audit/release-ag11-2026-11-05/`. Incluye comprobación previa, árbol integrado, CI, estado Production y prueba HTTP. El acceso autenticado y los flujos funcionales conservan la evidencia del entorno sintético del cierre.

AG-12 queda separada de esta publicación.
