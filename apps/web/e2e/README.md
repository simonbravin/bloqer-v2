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

## Smoke público obligatorio, sin credenciales

El job `quality` ahora compila la aplicación con servicios aislados y ejecuta `pnpm --filter @bloqer/web test:e2e:public`. Usa `playwright-smoke.config.ts`, Chromium headless y un proceso propio del artefacto compilado. No reutiliza el navegador del usuario ni un servidor ya abierto. Para repetirlo localmente hace falta un build previo aislado y un pedido explícito de verificación local; no se abre el browser MCP/IDE.

Se ejecutan tres casos en cada tamaño: escritorio 1280 px, tablet 768 px y teléfono 360 px. Comprueban render/fuentes/ausencia de desborde, el control de contraseña por teclado y las barreras de sesión en pantallas y endpoints de comprobantes/PDF. El middleware actual redirige solicitudes anónimas a login antes de los handlers privados; las pruebas de ruta unitarias cubren además sus respuestas 401. No se registra ni emite una factura, no se sube un archivo, no se envían mensajes y no se llama a IA o DB operativa.

Capturas de login, reporte HTML y trazas de fallos se conservan siete días en el artefacto `public-smoke-<sha>` de CI. El smoke autenticado anterior mantiene sus requisitos y no se cuenta como ejecutado si el job fue omitido. Este smoke público no acredita el recorrido AP autenticado, el PDF con datos reales ni la calidad del extractor; esos controles siguen en el piloto del primer paquete.

## Smoke autenticado con base descartable

`pnpm --filter @bloqer/web test:e2e:authenticated` usa `playwright-authenticated.config.ts` exclusivamente en CI. Reutiliza el build anterior, los tres tamaños de pantalla y los seeds existentes `seed.ts`/`seedDocsGuideDataset`. El job crea Postgres 16 vacío en loopback, aplica las migraciones versionadas y carga usuarios/documentos sintéticos; al terminar se descarta el contenedor. No accede a Neon ni reutiliza cuentas, contraseñas o cookies de personas reales.

La configuración fija servidor y DB de prueba, exige credenciales de fixture explícitas y conserva IA, R2, correo y cron deshabilitados. Los nueve casos comprueban login real, capacidad de extracción apagada, apertura/cancelación de factura manual, PDF preparado/descargado mediante la UI y rechazo del mismo PDF tras quitar la sesión. Reporte, capturas y PDF sintético quedan siete días en `authenticated-smoke-<sha>`.

Esto verifica Auth.js, middleware, servicios, Prisma y renderer juntos; no acredita OCR real, guardado de factura/adjunto en R2, envío a proveedores, aislamiento cruzado integral ni un piloto humano. El job `e2e` externo conserva sus secretos y su alcance independiente.
