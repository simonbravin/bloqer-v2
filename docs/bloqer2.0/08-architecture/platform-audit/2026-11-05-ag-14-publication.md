# Publicación de AG-14 — 05/11/2026

**Estado.** Integrada en el repositorio y desplegada en Production.

- Los 131 archivos coincidieron con el manifiesto del [cierre de AG-14](./2026-11-05-ag-14-cross-regression.md). Las 116 fuentes congeladas coincidieron con la compilación verificada. La entrega no incorporó migraciones ni cambios de esquema.
- El commit `18179baccbca65a1b99771be486cf12e03f3dccc` se integró como `a3e88ef41bfa314eb9ab1f1ffc13f924eb189205`. El árbol integrado coincide con el auditado en `48093f388518aa196133a3e13d838fd00913989a`. [PR #12](https://github.com/simonbravin/bloqer-v2/pull/12).
- Los controles de calidad aprobaron el [PR](https://github.com/simonbravin/bloqer-v2/actions/runs/42138073998) y [`main`](https://github.com/simonbravin/bloqer-v2/actions/runs/42140101398). El E2E remoto se omitió por configuración de secretos.
- Preview usaba el compute productivo. El control de AG-14 detuvo la compilación antes de ejecutar Prisma. La vista previa queda pendiente de `DATABASE_URL` y `DIRECT_URL` aisladas del compute de portal. [Vista previa detenida](https://vercel.com/simons-projects-6be5b5cc/bloqer-v2-web/44NKvPJ2veoyuhu1D9zHoTt5Cd7X).
- Vercel Production completó a las 22:00:09 de Argentina (01:00:09 UTC del 06/11), deployment `7589461635`. En el portal, Acceso y Recuperar contraseña respondieron HTTP 200 y el cron de reportes devolvió HTTP 401 sin autorización. [Despliegue de producción](https://vercel.com/simons-projects-6be5b5cc/bloqer-v2-web/6uKPe5Wcjw2YJuhnmMZxrnYKQQbC).

Evidencia en `output/platform-audit/release-ag14-2026-11-05/`. La revisión integral de UX/UI es un lote separado.
