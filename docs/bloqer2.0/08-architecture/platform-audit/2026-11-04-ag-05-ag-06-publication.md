# Publicación de AG-05 y AG-06 — 04/11/2026

**Estado: código integrado y desplegado en Production; migración productiva y acceso público comprobados.** El Owner pidió publicar los pendientes antes de AG-07 y confirmó expresamente el repositorio público y el despliegue del payload preparado.

## Entrega y autorización

- Base anterior: `3407c023eb00dec9d6361e4842af016480b1c813`, publicación AG-00–04.
- Entrega AG-05/06: `4a9af2816abdb41595b0fbda23ea0c7afb75646e`, **264 archivos**, 19.338 inserciones y 3.301 eliminaciones.
- Integración: [PR #4](https://github.com/simonbravin/bloqer-v2/pull/4), merge `74bb2c9d345b4c1320cd4a8a6668714fa2673ae8`.
- El árbol Git de entrega y main coincide: `ff07c25693886b75f985eee66c73c32525a86198`. Los cambios posteriores de AG-07 no están en esta entrega.
- Antes del commit coincidieron los 2.604 hashes del manifiesto AG-06; ninguna ruta de entorno, caché u output temporal se agregó. La búsqueda de patrones de credenciales en los archivos publicables no encontró coincidencias.
- El primer push fue rechazado por revisión automática porque requería confirmación del destino público y de los 264 archivos. No se eludió: el Owner respondió «Sí, publicar en ese repositorio público y desplegar» a la pregunta que identificaba [el repositorio](https://github.com/simonbravin/bloqer-v2), commit y portal. El mismo push posterior fue aprobado y terminó correctamente.

## Verificación de código e integración

- Evidencia local heredada del cierre AG-06: **2.335 pruebas generales**, **100 casos SQL distintos aislados**, 13 tareas de tipos, lint y compilación raíz aprobados. No se repitieron SQL mutantes para publicar.
- CI del PR: `41914693811`; calidad aprobada, **2.335 casos**, cero fallos, tipos y lint aprobados.
- CI de main: `41915744577`; calidad aprobada, **2.335 casos**, cero fallos, tipos y lint aprobados. Los contadores son ejecuciones de la misma suite, no defectos o cobertura únicos adicionales.
- E2E en ambos CI **omitido por secretos no configurados**; no se cuenta como aprobado. Las 29 suites live omitidas en el comando general conservan el límite documentado por AG-06.
- Preview Vercel del commit de entrega aprobado: `HgRJWw6dJHFDuNdFaDVex8wyGGKp`. No se usa como prueba de Production.

## Production y base de datos

- Vercel Production: [`9W8fMzdH3HEk91QHyXuaFQB9L2oZ`](https://vercel.com/simons-projects-6be5b5cc/bloqer-v2-web/9W8fMzdH3HEk91QHyXuaFQB9L2oZ), estado **success**, GitHub deployment `7558387913` para el merge SHA anterior.
- Completado a las **18:29:13, hora Argentina**, del 04/11/2026 (**21:29:13 UTC**). URL inmutable informada: `https://bloqer-v2-cttl0orl6-simons-projects-6be5b5cc.vercel.app`.
- Alias habitual: [portal.bloqer.app](https://portal.bloqer.app).
- SQL final en **`ep-cold-mouse-appkpn84.c-7.us-east-1.aws.neon.tech` / `neondb`**, con identidad exacta y `SET TRANSACTION READ ONLY`: **71 migraciones**, ninguna fallida o pendiente. D-127 `20261104183000_purchase_receipt_company_number` terminada a las 21:17:17 UTC, antes de la integración/despliegue productivo final.
- Columna `purchase_receipts.number`: integer nullable. Índice único `purchase_receipts_tenantId_companyId_number_key`: tenant, empresa y número. Checksum Prisma coincide con el archivo aprobado: `3e87faea207af5ee7c44e7ef77b78d9e1842ed88defb617fb5f70e3c262ccd63`.
- La migración ya estaba aplicada al consultarla; no se repitió manualmente ni se ejecutó `db push`, backfill, seed o pruebas mutantes en producción. Su código es aditivo y no renumera históricos. La aplicación mediante el build integrado es consistente con el migrador idempotente existente; la evidencia directa conservada acredita el estado SQL, no logs internos de Vercel.
- El plugin Neon devolvió 404/UNAVAILABLE. Se utilizó la conexión existente del mismo proyecto, sin escribir archivos de entorno y con host productivo conocido y transacción de solo lectura. El token local de gh no funcionaba; el plugin GitHub conectado realizó PR/merge y lectura de CI.

## Smoke y límites

Después de comprobar Production, GET de `/login` y `/recuperar-contrasena` en el portal respondió **200**, títulos y contenido de acceso/recuperación esperados. No se enviaron formularios ni se abrió sesión operativa productiva.

Esto verifica publicación, metadatos de migración y superficie HTTP pública. No certifica workflows autenticados de Production, OAuth/email/R2 reales, todas las rutas, ni inspección visual del código desplegado. La revisión visual y SQL funcionales de AG-05/06 conservan el entorno sintético aislado de sus informes.

## Evidencia y continuación

Evidencia: `output/platform-audit/release-ag05-ag06-2026-11-04/`: `release.json`, `precommit-check.json`, `authorization-and-retry.json`, `merged-source-tree.json`, `ci-pr-quality-summary.*`, `ci-main-quality-summary.*`, `production-before.json`, `production-after.json`, `github-postmerge.json` y `deployment-and-http-smoke.json`.

Informes funcionales: [cierre AG-05](./2026-11-04-ag-05-closure.md) y [cierre AG-06](./2026-11-04-ag-06-procurement.md). Sus estados locales originales son históricos y no se sobrescriben como si los smokes aislados se hubieran ejecutado en Production.

AG-07 continúa por pedido del Owner con sus cambios separados. Este registro posterior de publicación se crea localmente después del merge; no mueve el checkout ni agrega los cambios AG-07 a la entrega publicada.
