# AG-08 — Publicación y verificación

**Publicada el 05/11/2026.** [PR #6](https://github.com/simonbravin/bloqer-v2/pull/6), entrega **4f5b672e74bb9df133b1dc83f68918fa2b32555e**, merge productivo **e817d82f1ce68eb4da77b118d5aec3994443ca34**. AG-09 queda fuera de esa entrega.

El Owner pidió publicar en el repositorio público y portal.bloqer.app, destinos ya autorizados. Los 94 archivos coinciden con el manifiesto del cierre AG-08; revisión de secretos y diff sin hallazgos. El árbol de entrega y merge coincide: **0e6a71495af4bb28142686b458fbd1dc312c4682**.

## Calidad

- [Cierre local AG-08](./2026-11-05-ag-08-certifications-subcontracts.md): 2.528 pruebas generales, 90 casos SQL distintos aislados, 13 tareas de tipos, lint, compilación y muestra visual aprobados.
- [CI del PR](https://github.com/simonbravin/bloqer-v2/actions/runs/42048715600) y [CI de main](https://github.com/simonbravin/bloqer-v2/actions/runs/42049833364) aprobados: 2.528 pruebas, cero fallos, tipos y lint correctos en cada corrida. Son repeticiones de la misma selección.
- E2E omitido por secretos no configurados; las 36 suites live omitidas en el runner general se distinguen de las corridas SQL aisladas.

## Producción y límites

Vercel Production [GHJ4Nci53gRd5dwxqhA7Nem3nzbR](https://vercel.com/simons-projects-6be5b5cc/bloqer-v2-web/GHJ4Nci53gRd5dwxqhA7Nem3nzbR), GitHub deployment **7577028724**, estado **success**, SHA e817d82f. Completado a las **12:00:15 de Argentina** (15:00:15 UTC). [Versión inmutable informada](https://bloqer-v2-nvr6jr12z-simons-projects-6be5b5cc.vercel.app).

Sin cambios de schema, migraciones o dependencias. No se ejecutaron migraciones manuales, seeds ni pruebas mutantes en producción. Production se confirmó mediante API GitHub autenticada con el acceso Git existente, sin mostrar ni guardar credenciales. /login y /recuperar-contrasena del portal respondieron **200** después del despliegue; sin sesión productiva ni operaciones financieras reales. La muestra visual y SQL de AG-08 conserva su entorno sintético.

Evidencia en output/platform-audit/release-ag08-2026-11-05/: precommit, release-summary, resúmenes CI, deployment autenticado y smoke público. Este registro se escribe después del merge, junto al trabajo separado de AG-09; no se incluye retroactivamente en el commit publicado.
