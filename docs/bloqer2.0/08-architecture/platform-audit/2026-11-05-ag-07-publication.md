# AG-07 — Publicación y verificación

**Publicada el 05/11/2026.** [PR #5](https://github.com/simonbravin/bloqer-v2/pull/5), entrega **b05fa722786d935d6eef7eb666722da261a01cac**, merge productivo **d897aa7f1cbed2431ae1d8eb13356d4e770db3ae**. AG-08 quedó fuera de esa entrega.

El Owner pidió publicar los cambios cerrados en el repositorio público y [portal.bloqer.app](https://portal.bloqer.app), destinos ya autorizados. Se revisaron 106 archivos sin coincidencias de secretos. Solo se quitó una línea vacía final del registro de publicación anterior antes del commit. El árbol de entrega y merge coincide exactamente: **d085ca3f1835a266f4a820c0e1eb381f339f17ce**.

## Calidad

- Evidencia local del [cierre AG-07](./2026-11-04-ag-07-inventory.md): 2.388 pruebas generales, 111 SQL distintos aislados, 13 tareas de tipos, lint, compilación y muestra visual aprobados.
- [CI del PR](https://github.com/simonbravin/bloqer-v2/actions/runs/42025708378) y [CI de main](https://github.com/simonbravin/bloqer-v2/actions/runs/42026895825): **2.388 pruebas**, cero fallos, tipos y lint correctos en cada corrida. Son repeticiones de la misma selección.
- E2E omitido por secretos no configurados; las 33 suites live omitidas en el runner general se distinguen de las corridas SQL aisladas.

## Producción y límites

Vercel Production [3GvfMKHdTNvePxKLRCFcc4Bci3nN](https://vercel.com/simons-projects-6be5b5cc/bloqer-v2-web/3GvfMKHdTNvePxKLRCFcc4Bci3nN), GitHub deployment **7573659735**, estado **success**, SHA d897aa7f. Completado a las **09:32:09 de Argentina** (12:32:09 UTC). [Versión inmutable informada](https://bloqer-v2-7j1xe0cbc-simons-projects-6be5b5cc.vercel.app).

Sin cambios de schema, migraciones o dependencias. No se ejecutaron migraciones manuales, seeds ni pruebas mutantes en producción. No se afirma una inspección SQL productiva nueva. La conexión no expone deployments; la consulta pública devolvió vacío. Se confirmó Production mediante la API GitHub autenticada con el acceso Git existente, sin mostrar ni guardar credenciales; commit status de Vercel y deployment coinciden.

Después del despliegue, /login y /recuperar-contrasena del portal respondieron **200**, con títulos y contenido esperados. Sin sesión productiva ni operaciones financieras reales. Visual y SQL de AG-07 conservan su entorno sintético.

Evidencia en output/platform-audit/release-ag07-2026-11-05/: precommit, release, resúmenes CI PR/main, deployment autenticado y comparación de árboles/smoke HTTP. Este documento se registra después del merge, junto al trabajo separado de AG-08; no está incluido retroactivamente en el commit publicado.
