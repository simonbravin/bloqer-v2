# INDARI / Casa Hogar — resultados de fase 0

Fecha: 21/10/2026. Alcance: preparación y diagnóstico del [plan de mejoras](./INDARI_CASA_HOGAR_IMPROVEMENT_PLAN.md). **Trabajo preparatorio ejecutado; quedan condiciones abiertas para liberar cambios y regularizar datos.**

Se reconstruyó el schema en una base aislada, se comparó con producción y se incorporaron fixtures y pruebas reutilizables. La estructura comparada coincide. La prueba real de adjudicación parcial detectó un timeout reproducible que debe resolverse antes de dar por validado PR-01. No se modificaron la aplicación, el schema ni los datos de INDARI en producción.

## 1. Versión y despliegue

- Código auditado: `527c824c9ad9009b0d9cf2d729a184dc5f2e31f9`, rama local `main`.
- Último deployment GitHub de entorno `Production`: `6764344935`, creado el 30/09/2026 a las 16:15:34 UTC; estado `success`; SHA idéntico al código auditado.
- El estado de Vercel del commit enlaza al [deployment G2wxsALbkwt2mWCeriW6SB9HjmGS](https://vercel.com/simons-projects-6be5b5cc/bloqer-v2-web/G2wxsALbkwt2mWCeriW6SB9HjmGS).
- La URL del deployment es `https://bloqer-v2-n5olszssg-simons-projects-6be5b5cc.vercel.app`; su consulta pública redirige a autenticación Vercel. `https://portal.bloqer.app` sirve el login de la aplicación.

**Límite:** coinciden el último deployment registrado y el código local, pero no quedó acreditada la asignación actual del alias `portal.bloqer.app` a ese deployment. Verificarla con acceso autenticado a Vercel antes de publicar; una respuesta HTTP correcta no prueba el SHA servido. P-IND-03 continúa parcialmente abierto.

## 2. Prisma: historial y estructura efectiva

Producción consultada en solo lectura: Neon `production`, compute `ep-cold-mouse-appkpn84`. Historial: 69 migraciones aplicadas, sin nombres adicionales ni pendientes frente al repositorio auditado.

Las tres discrepancias P-IND-01 son valores literales en la columna `checksum`, en lugar de hashes SHA-256:

- `20260807220000_d074_treasury_settlement_method`: `d074_treasury_settlement_method`.
- `20260807230000_d075_bank_reconciliation`: `d075_bank_reconciliation`.
- `20260808140000_d078_period_close`: `d078periodclose`.

Los mismos valores aparecen en la DB normal de desarrollo y sus timestamps de inicio y fin coinciden en cada registro. Esto acredita un registro histórico no estándar, pero no identifica quién lo hizo ni permite recuperar el SQL original a partir de esas etiquetas. D-115 sí coincide con Git/LF; su diferencia local es CRLF.

### Ensayo desde una base vacía

Se creó `bloqer_indari_phase0_20261021` dentro del compute de desarrollo `ep-curly-math-aptjniho`, separada de `neondb`. Es **otra base en el mismo compute**, no una rama Neon independiente. Contiene solo schema y datos sintéticos. No se cambió `.env` ni se copiaron documentos de clientes.

Se aplicaron las 69 migraciones versionadas mediante Prisma. El primer proceso se interrumpió por el timeout del comando durante `20260513220000_tenant_permission_matrix_notes`. Antes de reintentar se verificó que no seguía ejecutándose y que la columna esperada no existía. Se marcó **ese intento fallido de la base de prueba** como rolled back con `prisma migrate resolve --rolled-back`, y luego `migrate deploy` terminó correctamente. Esta recuperación del ensayo no modifica ni justifica alterar el historial de producción.

Control final, 16:11 ART: **69 aplicadas, 0 inconclusas y 1 intento marcado rolled back**. No se cambió el SQL de ninguna migración.

### Comparación de catálogos, 16:02 ART

Se compararon producción y la reconstrucción aislada usando lecturas del catálogo PostgreSQL del schema `public`, excluyendo `_prisma_migrations`:

- **1.206 columnas:** nombres, tipos, nulabilidad, defaults, precisión y escala.
- **346 restricciones:** definición y validación.
- **355 índices:** definiciones, incluyendo índices parciales.
- **387 valores de enum:** etiquetas y orden.

**Cero diferencias en estos cuatro conjuntos.** No se compararon exhaustivamente funciones, triggers, roles ni contenido de todas las tablas. `prisma migrate diff` no finalizó por conectividad; la evidencia estructural proviene de los catálogos, no de un resultado exitoso de ese comando.

P-IND-01 queda **verificado estructuralmente para los objetos comparados**, con salvedad de procedencia histórica. No hay evidencia que justifique editar checksums o reparar columnas. Los PR sin schema pueden desarrollarse; cualquier futura migración requiere su ensayo y revisión propios, incluyendo los objetos fuera de esta comparación que afecte.

## 3. Fixtures y pruebas incorporadas

Archivos reutilizables:

- `packages/services/src/procurement/fixtures/procurement-regression.ts`.
- `packages/services/src/procurement/procurement-fixture-guard.test.ts`.
- `packages/services/src/procurement/procurement-regression.live.test.ts`.

Se reutiliza el seed adversarial existente para dos tenants y roles OWNER/VIEWER. Los escenarios nuevos contienen una SC de dos líneas, cotización vigente, una OC independiente con recepción parcial, factura parcial, CxP y pago parcial. Son estados iniciales de pruebas: la creación por fixture no certifica el circuito de emisión de documentos. El caso de adjudicación sí llama al servicio real.

La protección exige nombre explícito de DB aislada, ambas URLs apuntando al mismo destino y hostname del compute de desarrollo verificado. Antes de sembrar se comprueba `current_database()`. Se rechazan producción, `neondb`, URLs discordantes y selección incompleta. Las pruebas live se omiten por defecto y requieren `BLOQER_PROCUREMENT_LIVE_DB=1`; una omisión no es aprobación del escenario.

### Resultados

- Typecheck de `@bloqer/services`: correcto.
- **67 pruebas unitarias aprobadas**: 61 regresiones existentes de compras/dinero/cancelación/anticipos y 6 nuevas de protección del destino de fixtures.
- Integración con DB aislada: **3 aprobadas, 1 fallida**, con el mismo resultado en dos ejecuciones.
- Aprobadas: resumen de recepción/facturación/pago parcial; rechazo de consulta desde otro tenant; rechazo de adjudicación por VIEWER.
- Fallida: adjudicar una de dos líneas. Prisma informa `P2028` al superar 5.000 ms de transacción; primer intento 5.160 ms, segundo 5.560 ms. Ocurre antes de completar la OC y llegar a las aserciones finales de cobertura.
- Lectura posterior: ambas SC sintéticas siguen `SUBMITTED`, sin líneas de OC ni líneas adjudicadas. En estos dos intentos no quedó una adjudicación parcial persistida.

No se aumentó el timeout global ni se ocultó el fallo con un mock, skip o expectativa de error. La lógica de adjudicación por subconjunto existe, pero su ejecución satisfactoria no quedó validada en esta conexión. No se atribuye este timeout a OC-051 ni a otra operación histórica del cliente. Ver P-IND-04.

### Repetición del ensayo

Usar una base vacía o exclusivamente sintética del compute autorizado, con las migraciones aplicadas. Configurar en el proceso `DATABASE_URL` y `DIRECT_URL` con esa misma base, `BLOQER_PROCUREMENT_TEST_DATABASE` con su nombre, `BLOQER_PROCUREMENT_LIVE_DB=1` y una contraseña de prueba `BLOQER_AI_E2E_PASSWORD`. Mantener las integraciones externas deshabilitadas y `RESEND_API_KEY` vacío. No guardar credenciales en el repo ni reemplazar el entorno habitual de la aplicación.

Desde `packages/services`, ejecutar `node --import tsx --test src/procurement/procurement-regression.live.test.ts`. No anteponer un wrapper que recargue `.env` y sobrescriba el destino aislado. Los fixtures agregan escenarios nuevos y conservan evidencia; no ejecutan borrados. Su numeración consulta el máximo y presupone un solo proceso de preparación por DB; la concurrencia se ensayará sobre escenarios ya preparados.

Para las protecciones sin conexión: `node --import tsx --test src/procurement/procurement-fixture-guard.test.ts`. Para tipos: `pnpm --filter @bloqer/services typecheck`.

La base aislada queda disponible para la fase 1; no está conectada al portal. Su eliminación al finalizar los ensayos es una tarea posterior, no una limpieza ejecutada en esta intervención.

## 4. Conciliación B01 y evidencia privada

Se actualizó el expediente privado de la auditoría con cuatro pares: HVAC, Guillen, ploteos y CENICO/Saldaña. Se consultaron facturas, renglones, CxP, pagos, movimientos, adjuntos, períodos, asientos y coincidencias de conciliación bancaria. Se leyeron los cuatro adjuntos disponibles; tres documentos son distintos y los dos asociados a los registros anulado/reemplazo de CENICO son el mismo PDF.

Hallazgos que cambian las medidas previstas:

- HVAC: existe una factura adjunta que respalda el importe y dos registros de pago con la misma referencia; falta cotejo bancario y confirmación de si hay otra factura.
- Guillen: el total fiscal está entre los dos totales registrados, con un centavo de diferencia respecto de cada uno; además difieren los renglones. No alcanza con borrar uno de los registros para conciliar.
- Ploteos: faltan el comprobante fiscal y la correspondencia entre las referencias de transferencia.
- CENICO: el documento respalda la factura manual en kg; la factura desde OC usa barras y otro total. Faltan remito/conversión e importes individuales de los echeqs. El registro ya anulado no se suma como factura activa.

En los casos acotados hay ocho facturas activas, ocho pagos confirmados y ocho movimientos separados. Las CxP están pagadas; no se encontraron matches bancarios de esos movimientos. Los 16 asientos asociados activos están en borrador; el del registro anulado está cancelado. El período cerrado consultado es de 2025, fuera de las fechas de estos documentos de 2026. Estos estados deben revalidarse antes de una regularización.

**No está acreditado doble desembolso bancario.** Las propuestas siguen condicionadas a la documentación de INDARI. El expediente privado contiene importes, referencias, adjuntos y medidas por caso; no se incorporan datos bancarios ni PDFs del cliente al repositorio.

## 5. Condiciones para las siguientes entregas

1. **PR-01 / B02:** investigar P-IND-04, reducir trabajo/latencia dentro de la transacción o justificar un ajuste acotado; conservar locks, validaciones y atomicidad. Exigir prueba de adjudicación parcial aprobada, concurrencia y anulación antes de liberar la UI. No cambiar una regla financiera para resolver un límite de tiempo.
2. **PR-02 / B03:** puede avanzar el trabajo de claridad de importes sin esperar comprobantes de los casos históricos; mantener los cálculos existentes y sus regresiones.
3. **Publicación:** acreditar alias/deployment en Vercel y completar controles del PR correspondiente. No se ejecutó un deploy en esta fase.
4. **B01:** INDARI confirma documentos/pagos/unidades; luego se prepara una regularización concreta con impacto antes/después y autorización separada. No hacer asociaciones por similitud ni cambios directos en DB.
5. **P-IND-02 y Q-061 a Q-064:** continúan abiertos según el plan. Este ensayo no certifica concurrencia de facturación ni resuelve los diseños multi-OC/anticipos/ofertas incompletas.

## 6. Evidencia y alcance del cambio

Evidencia privada conservada con la auditoría del 21/10: `phase0-production-environment.json`, `phase0-dev-environment.json`, `phase0-isolated-migration-resume.json`, `phase0-schema-comparison.json`, `phase0-full-schema-snapshots.json`, `phase0-live-evidence.json`, `phase0-integration-tests.json`, `phase0-integration-tests-recheck.json` y `phase0-isolated-final-state.json`. Las URLs obtenidas tras redirigir a login Vercel no identifican el deployment de Bloqer.

Cambios de esta fase: fixtures, protecciones, pruebas y documentación técnica; base de ensayo creada y migrada. Sin dependencias nuevas, nuevos campos/estados, cambios de reglas, interfaz, catálogo de ayuda, datos de producción ni despliegue. No corresponde actualizar instrucciones operativas del usuario con funcionalidades todavía no implementadas.
