# AG-09 — Publicación y verificación

Publicada el **05/11/2026 a las 14:01 de Argentina**. El [PR #7](https://github.com/simonbravin/bloqer-v2/pull/7) integró `cae3e539ad5b05d265cedc09adbc62c6fd8758d5` en `main` como `75ab172925497a33b5047ef09cafb83d8c3bbae6`.

Los 160 archivos de la entrega coinciden con el manifiesto del [cierre local de AG-09](./2026-11-05-ag-09-ar-ap-payments.md). El árbol de entrega y producción coincide en `dc17f52f3b7c4e4f8fa8429336f1c3efc226db90`. La entrega no incluye migraciones, cambios de dependencias ni de entorno.

- El cierre local registró 2.650 pruebas generales, 75 casos SQL aislados, tipos, lint, compilación y muestra visual de escritorio y teléfono.
- Los controles de [PR](https://github.com/simonbravin/bloqer-v2/actions/runs/42068973177) y [main](https://github.com/simonbravin/bloqer-v2/actions/runs/42069638025) completaron instalación, Prisma, lint, tipos y pruebas unitarias. El job E2E se omitió por configuración.
- [Vercel Production](https://vercel.com/simons-projects-6be5b5cc/bloqer-v2-web/6a2FVyMmq2ounnJFHfTkNRvYrR9R) confirmó el despliegue `7579920502` para el mismo SHA. Las rutas públicas de [acceso](https://portal.bloqer.app/login) y [recuperación](https://portal.bloqer.app/recuperar-contrasena) respondieron HTTP 200. Los recorridos con escritura se verificaron en la base de auditoría.

Evidencia operativa en `output/platform-audit/release-ag09-2026-11-05/`. Este registro posterior al merge documenta la publicación mientras se prepara AG-10.
