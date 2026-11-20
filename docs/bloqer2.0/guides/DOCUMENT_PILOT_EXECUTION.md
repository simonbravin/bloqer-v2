# Piloto documental — preparación del 20/11/2026

Estado al 20/11/2026: preflight de DB ejecutado por la consola autenticada de Neon; empresa demo confirmada en desarrollo. Recorrido funcional con servicios externos todavía pendiente. Se guardó una corrección de AUTH_URL exclusiva de la rama del piloto; el redeploy manual se canceló al quedar pendiente la verificación de identidad. No se creó otra empresa en Neon ni se ejecutó su seed.

El Owner reiteró autorización para usar **Bloqer Demo** en todas las pruebas necesarias, preservando los clientes reales. No volver a pedir autorización para cada ensayo sobre esa demo. La preparación y las pruebas automatizadas independientes de Neon/Vercel pueden avanzar sin esperar una sesión de navegador.

### Continuación independiente del acceso del navegador

Se agregó un caso de navegador autenticado que crea una factura manual de empresa mediante el formulario y el servicio reales, recarga el detalle y comprueba que conserva el documento y la acción de emitir (sigue siendo borrador). Usa la demo sembrada en Postgres descartable de CI; se ejecuta en escritorio, tablet y celular. No activa IA, R2, emisión ni pagos; no utiliza la DB de Neon. El resultado se acredita con el check del commit, no con la existencia del test. Las capturas se adjuntan al reporte autenticado de CI.

Primera corrida: `44743449756`, commit `a1970c3f8c74c3bdea7b15753781b68cc45c4b7a`. Lint, tipos, pruebas unitarias, índice, build, nueve casos públicos y los nueve autenticados anteriores pasaron. El caso nuevo falló en los tres tamaños antes de guardar: su selector omitía el asterisco del label obligatorio **Letra del comprobante \***. Se corrigió el selector; no se alteró el formulario ni se debilitó la prueba. El check de la revisión posterior es la evidencia de su resultado.

Segunda corrida: `44745686705`, revisión `81d83fe313789f5b7035a4031fef39b98e311e91`: 11/12 casos autenticados aprobados. El caso nuevo pasó en tablet y celular; en escritorio falló después de recargar porque el selector de texto coincidió con dos celdas. Se agregó espera explícita de una única coincidencia antes de comprobar visibilidad, tanto al crear como al recargar. No se usa `.first()` ni se acepta una duplicación persistente. La compilación, unitarias y casos públicos volvieron a pasar.

El despliegue automático de esa rama (`4vdunZXSsmG9r1SVJXELKDcMpKNq`) terminó correctamente. Se verificó por navegación real que el alias del piloto abre `/login?callbackUrl=%2F` **en su propio dominio** y ya no redirige a `portal.bloqer.app`. No fue necesario retomar el redeploy manual ni pedir otro código. Esta verificación no acredita login autenticado, Google OAuth ni la DB efectiva del preview.

## Candidato encontrado

Fuentes iniciales: `docs-demo-ids.json` (registro generado el 20/08/2026), `packages/database/src/seed.ts` y `packages/database/src/seed-docs-guide.ts`. El 20/11/2026 se confirmó por SQL de solo lectura la empresa y su pertenencia en `dev/neondb`; esto no acredita presencia en producción ni en el preview.

| Dato | Referencia registrada |
|---|---|
| Empresa | Bloqer Demo Construcciones; el seed básico usa inicialmente Demo Company |
| Empresa ID | `00000000-0000-4000-8000-000000000001` |
| Tenant slug | `demo` |
| Tenant ID verificado en dev/neondb | `e3d4d0f7-3ca8-4d16-9c46-b8c77f5c93db` - no asumir igualdad entre bases |
| Obra | Obra Demo Norte / DEMO-001 |
| Obra ID | `a0000010-0000-4000-8000-000000000010` |
| OC de prueba ID | `a0000020-0000-4000-8000-000000000020` |
| Cuenta de guía verificada | `docs-guide@bloqer.demo`, ACTIVE; membresía OWNER activa en tenant y empresa demo. Login no probado |

## Acceso necesario y comprobaciones realizadas

- Proyecto Neon documentado: **bloqer-v2**, ID `crimson-dew-50407633`.
- Desarrollo: branch `dev`, `br-falling-morning-aple46i5`, compute `ep-curly-math-aptjniho`.
- Portal: branch `production`, `br-damp-hat-aphhbquz`, compute `ep-cold-mouse-appkpn84`. No usar producción como sustituto de un entorno de prueba inaccesible.
- La conexión Neon actual lista la organización `Simon` (`org-square-fog-10018351`) y tres proyectos: `centro-vbt`, `vbt-argentina`, `vbt-cotizador`. No expone Bloqer; consultar su ID devuelve 404.
- Se intentó una transacción de solo lectura desde la conexión local, limitada al host de desarrollo documentado y a empresas demo/testing/prueba. Prisma devolvió error de conexión antes de obtener resultados. Esto no demuestra que la DB esté apagada ni que la empresa haya desaparecido.
- No hay contraseñas DOCS/E2E/SEED configuradas en los archivos de entorno revisados. No se restableció ninguna contraseña ni se cambiaron membresías.

## Evidencia real del 20/11/2026

Todas las consultas se ejecutaron con `BEGIN READ ONLY` y `COMMIT`. No se ejecutaron escrituras SQL, seeds, cambios de permisos ni migraciones. El acceso por navegador integrado funcionó en segundo plano; no se manejó el escritorio.

| Destino | Resultado observado |
|---|---|
| `dev/neondb` | Bloqer Demo Construcciones ACTIVE; Obra Demo Norte (DEMO-001) y Ampliación Demo Sur (DEMO-002) ACTIVE, con tenant coincidente. OC `a0000020-0000-4000-8000-000000000020` CONFIRMED, vinculada a la obra/empresa/tenant esperados. Las tres cuentas docs-guide/docs-pm/docs-viewer están ACTIVE |
| Migraciones de `dev/neondb` | 69 aplicadas, 0 inconclusas; última `20260923180000_addendum_may_be_approved`. El repositorio tiene 73 migraciones: no usar esta base con la versión actual sin preparar su compatibilidad |
| `dev/bloqer_indari_phase0_20261021` | Base existente con empresas sintéticas; 70 migraciones aplicadas, última `20261021180000_quote_line_offer_kind` |
| `dev/bloqer_audit_ag01_20261103` | Base existente con fixtures de auditoría; búsqueda por slug demo/ID histórico sin resultados |
| `vercel-preview/bloqer_preview` | Rama `br-winter-rice-apu9woi3`, compute `ep-young-forest-ap86bxcg`; 73 migraciones aplicadas; 0 tenants, 0 empresas y 0 usuarios docs-guide. Todavía no está poblada para el piloto |
| Conexión local Prisma | Nuevo intento limitado a la base aislada de desarrollo: error de inicialización/conexión. El éxito de la consola no implica acceso desde el proceso local |

### Corrección de configuración de preview

- Producción observada Ready en Vercel: commit `deef7eeb488af98be61ee770f26e4381156385bb`, deployment `CNnBAZz5PzWTHPgct7g5kVo4k24i`, con alias `portal.bloqer.app`. No se redesplegó producción.
- El preview `448y5kc9TZtF6xwy2uLuE1eQBKCn` (commit `d6c5f6b7c62f4c42b3f454f5f9394a0f038982f7`) redirigió al login de `portal.bloqer.app`. La variable AUTH_URL existente está compartida entre Production y Preview; su valor secreto no se reveló.
- Se agregó una variable Config AUTH_URL **solo** para Preview / rama `codex/document-pilot-preflight-20261120`, con valor `https://bloqer-v2-web-git-codex-documen-862008-simons-projects-6be5b5cc.vercel.app`. Vercel confirmó guardado correcto; la variable compartida anterior se conserva.
- Se solicitó redeploy de ese preview, mismo código, con caché de build. Vercel detuvo la operación en **Verify Your Identity** y envió un código al correo del Owner. Al retomar se cancelaron la verificación y el redeploy manual; no quedaron solicitando un código al Owner. Comprobación del nuevo comportamiento **pendiente**; no presentar la redirección como resuelta hasta observar el siguiente despliegue de la rama.
- No se cambiaron DATABASE_URL, DIRECT_URL, claves, banderas de IA, R2 ni configuración de clientes. La separación de variables DB por entorno se observó en Vercel, pero sus valores secretos no se inspeccionaron; falta acreditar que el preview efectivo consulta `bloqer_preview` antes de escribir datos.

### Orden para continuar

1. Observar el siguiente despliegue de la rama del piloto y comprobar que login y callbacks permanecen en su alias. El intento manual anterior quedó cancelado.
2. Acreditar el destino real de la DB del preview. Preparar datos sintéticos y acceso de prueba mediante el procedimiento existente, en la base aislada verificada. No trasladar datos de clientes ni cambiar contraseñas existentes.
3. Configurar y verificar proveedor documental/R2 para el piloto; las variables de IA vistas en Vercel están limitadas a Production. No activar globalmente producción para probar.
4. Ejecutar P-01 a P-07 y registrar resultados reales. Las consultas anteriores no sustituyen pruebas de lectura documental, guardado, adjuntos o descarga autenticada.

## Recorrido preparado

Primero verificar en DB la empresa, tenant, obra, cuenta y permisos actuales. Confirmar la URL del entorno que consulta esa base y el aislamiento de los documentos de prueba. No ejecutar seeds para intentar recuperar acceso.

| Caso | Acción prevista | Criterio de aceptación | Ejecución real |
|---|---|---|---|
| P-01 | Abrir alta manual con la lectura apagada | Flujo manual disponible | Pendiente |
| P-02 | Leer comprobante sintético claramente identificado como prueba, de factura normal ARS | Lectura solo por acción explícita; original visible y campos revisables | Pendiente |
| P-03 | Probar datos faltantes, NC/ND, moneda no ARS y archivo no admitido | Desconocidos conservados; completar o derivar a manual según el caso | Pendiente |
| P-04 | Confirmar revisión y luego editar un campo | Confirmación invalidada hasta volver a revisar | Pendiente |
| P-05 | Guardar borrador y abrir el original adjunto | Un borrador con su original; sin emisión ni pago | Pendiente |
| P-06 | Ensayar recuperación de adjunto en entorno aislado | Reintento sobre el mismo ID; ante alta incierta consultar listado | Pendiente |
| P-07 | Preparar y descargar PDF de la OC demo | Documento privado válido, estado de OC sin cambios | Pendiente |

Aplicar el [procedimiento de aceptación](../08-architecture/DEPLOYMENT_SMOKE_TEST.md#primer-paquete--preparación-del-piloto-documental). Un ensayo con documentos sintéticos comprueba funcionamiento técnico; no acredita calidad ni ahorro con comprobantes representativos reales. Registrar tiempo de revisión, correcciones y costo cuando existan llamadas reales.

## Continuidad de los diez bloques

Este piloto corresponde a **1/A captura**, **2/B documento OC** y **10/J confiabilidad/adopción**; el acceso de **9/I integraciones** es su dependencia inmediata. **3/C avisos** conserva su comprobación de cron pendiente. **4/D audio**, **5/E compras**, **6/F dirección**, **7/G obra** y **8/H contratos** conservan el orden y alcance del [plan original](../PLAN_AUTOMATIZACION_PRIMER_PAQUETE.md#12-seguimiento-de-los-diez-bloques--20112026).

## Continuación: proveedores reales verificados — 20/11/2026

Esta sección es el estado más reciente. La interrupción del chat no revirtió la entrega anterior: PR #20 quedó integrado en `main` mediante `ea0fd7fdf2e88249faa5e25bf11fb3257d26f87b`. Su árbol coincide con el validado por [CI 44747129018](https://github.com/simonbravin/bloqer-v2/actions/runs/44747129018): 2.955 unitarias, 9 recorridos públicos y 12 autenticados, lint, tipos y compilación. El login del alias del piloto ya se observó permaneciendo en el dominio del preview; esto no acredita una sesión autenticada ni el destino efectivo de su DB.

Se agregan dos evaluaciones de integración reutilizables, fuera de las suites automáticas `src/**/*.test.ts`. Requieren opt-in explícito, no cargan archivos de entorno por su cuenta y no importan Prisma ni servicios de mutación. No cambian flags de la aplicación, dependencias, esquema ni configuración de Vercel. Solo usan comprobantes/bytes sintéticos. Se comprobó que los adaptadores locales probados coinciden con `main`.

| Evaluación real | Resultado | Límite de la evidencia |
|---|---|---|
| PDF de factura C en ARS, cantidades y totales explícitos | Aprobada; conserva importes, fechas, emisor y CUIT ausente como `null` | No mide calidad de fotos, escaneos ni comprobantes reales variados |
| PDF con símbolo `$`, sin moneda explícita, vencimiento ni impuestos | Aprobada; no inventa moneda, fechas, IVA, IIBB ni descuento | Prueba extracción; no el formulario ni la revisión humana |
| PDF de nota de crédito con instrucciones engañosas dentro del documento | Aprobada; clasifica `CREDIT_NOTE`, conserva total y pasa el parser estricto sin campos de acciones | Tres casos sintéticos no equivalen a una auditoría exhaustiva de inyección |
| Transporte real R2 con clave nueva y exclusiva del tenant demo | Aprobada: PUT firmado 200, segundo PUT 412, GET firmado 200, bytes idénticos y disposición attachment | No prueba CORS desde navegador, autorización Bloqer ni vínculo del adjunto en DB |
| GET al endpoint R2 sin firma | Rechazado con HTTP 400, sin devolver los bytes del archivo | No evalúa dominios públicos alternativos del bucket |
| Limpieza del objeto sintético | DELETE 204 confirmado | Solo la clave creada por esta corrida; sin enumerar ni borrar documentos existentes |

Lectura: modelo configurado `gpt-5.6-luna`, tres solicitudes completadas, 3.475 tokens de entrada y 757 de salida, aproximadamente 17,6 s para los tres casos. No se estima precio sin tarifa verificada. Node informa cuatro tests al contar el contenedor; son **tres casos documentales**, no cuatro documentos. No se repitió el corpus tras aprobar.

R2: corrida final de aproximadamente 22,9 s. La primera ejecución ya había aprobado subida, protección contra sobrescritura y descarga, pero el test esperaba solo 403 para la petición sin firma y recibió 400. Se ajustó la aserción al rechazo 400/403 y a no recibir los bytes originales; la repetición aprobó. Ambos objetos sintéticos fueron eliminados. No se cambió el adaptador ni la configuración del bucket.

### Ejecución reproducible

Desde `packages/ai`, con las credenciales existentes disponibles en el entorno del proceso (no pegarlas en comandos ni logs):

```powershell
$env:BLOQER_AI_LIVE='1'
node --import tsx --test evals/supplier-invoice-document.live.test.ts
Remove-Item Env:BLOQER_AI_LIVE

$env:BLOQER_STORAGE_LIVE='1'
node --import tsx --test ../storage/evals/document-storage.live.test.ts
Remove-Item Env:BLOQER_STORAGE_LIVE
```

El lector requiere `OPENAI_API_KEY`, proveedor `openai` y el modelo configurado; no acepta un base URL alternativo. Utiliza la extracción de producción sobre PDFs generados en memoria. Se detiene después del primer caso fallido, sin repetir el corpus automáticamente. El SDK conserva su política habitual de reintentos de transporte. R2 requiere las cuatro variables de almacenamiento existentes y emplea las funciones de firma reales; las URLs firmadas y las credenciales nunca se imprimen. La eliminación se limita al objeto nuevo de la prueba, sin registro operativo asociado. Si falla la limpieza se informa la clave exacta para revisión, nunca un borrado por prefijo.

Estas evaluaciones no habilitan por sí mismas el piloto en la aplicación. Son checks manuales con proveedores externos, no reemplazan las unitarias ni los recorridos autenticados de CI. Cambiar la UI o el modelo persistido requiere sus verificaciones habituales. Sin impacto en Guía/Help/knowledge: no cambia el flujo visible.

### Pendiente concreto y siguiente etapa

- Las conexiones instaladas siguen devolviendo 404 para el proyecto Bloqer de Neon y `bloqer-v2-web` en el equipo Vercel conocido. No se repitió un login ni se pidió otro código. Prisma local al compute de desarrollo sigue fallando al inicializar; la consulta de solo lectura no produjo resultados ni escrituras.
- **1/A + 9/I + 10/J:** queda unir lo ya probado: sesión demo en el entorno cuya DB esté acreditada, lectura, revisión, guardado único y apertura del original adjunto, incluyendo recuperación ante fallo. P-01 a P-07 siguen abiertos como recorrido integral remoto; las verificaciones de componentes anteriores no los cierran.
- **2/B + 3/C:** siguiente lote del plan: WhatsApp y avisos, una vez cerrado el recorrido integral y sus prerrequisitos de entrega/recuperación. No se envían mensajes como parte de estas pruebas.
- **4/D:** audio después. **5/E a 8/H** conservan su alcance y orden original. No hace falta sumar proveedores para terminar este piloto.

### Incidencia de despliegue y corrección del arranque de conexión

El Owner aportó el log del preview del commit `283c9dc`, del 20/11 a las 15:15 (Argentina). El build falló antes de Next.js: `prisma migrate deploy` seleccionó `bloqer_preview` en `ep-young-forest-ap86bxcg` y devolvió P1001 unos cinco segundos después. El log acredita el destino configurado para migraciones; no acredita una conexión exitosa ni el contenido de esa DB. La API de Neon siguió sin exponer ese proyecto a esta conexión.

La duración es compatible con el timeout por defecto de Prisma y un compute de Neon todavía arrancando; es una hipótesis, no una causa confirmada. Según la [documentación oficial de Prisma v6](https://docs.prisma.io/docs/orm/v6/overview/databases/neon#resolving-connection-timeouts), aumentar `connect_timeout` permite esperar ese arranque. Se refuerza el script de build existente con mínimo 15 segundos **solo en la DIRECT_URL del subproceso de migración Neon**, conservando valores explícitos mayores o cero. No se cambian destinos, credenciales, schema, configuración de Vercel ni la conexión runtime; no se agregan reintentos ni se omiten errores de migración.

Doce pruebas del guard de migraciones aprobaron, incluyendo cinco nuevas para timeout, conservación de credenciales/destino y parámetros, configuración inválida, aislamiento del portal y ausencia de efectos en builds locales/Postgres no Neon. La corrección requiere un nuevo despliegue exitoso para dar por resuelta esta incidencia; el build de CI con Postgres descartable no sustituye esa verificación Vercel/Neon.

## Conservación, acceso y trazabilidad — 2026-11-20

La incidencia P1001 anterior quedó cerrada con el despliegue exitoso del merge f54edaab930903bea0d6beccb8d7969f80bf25c1: preview BrnfbzcDjSjpr65RKs9k85omW2UL y producción CV77TvQ8uy4hCyYEAKRD4HzLZiEt. No fue necesario cambiar de base ni omitir migraciones.

Esta entrega corrige el éxito aparente de cargas sin almacenamiento: las dos rutas de carga requieren R2 y el cliente rechaza metadata sin original. Un fallo conserva el archivo pendiente para reintentar; los PLACEHOLDER históricos siguen identificados y no se presentan como recuperados. El nombre del autor se obtiene después de autorizar el documento, limitado al tenant, en una consulta por lista. Las pantallas muestran autor y fecha/hora de registro, además de última actualización en el detalle. No hay campos persistidos nuevos ni migraciones.

La suite SQL de documentos se incorpora al CI junto con la de evidencia de obra: base efímera bloqer_audit_documents_ci, loopback explícito, credenciales aleatorias y verificación de current_database antes de escribir. Comprueba empresa, tenant, pertenencia a proyecto, permiso del módulo padre, autor, fechas, auditoría, replay y ausencia de filas ante almacenamiento deshabilitado. Las firmas de estas fixtures usan credenciales sintéticas aleatorias, sin enviar objetos a R2; no sustituyen la prueba real de bytes documentada arriba. Las suites y el build completo deben aprobar antes del merge.

Referencias de alcance revisadas: [OWASP File Upload](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html) para autorización, tipos, tamaño y almacenamiento privado; [Autodesk Docs: actividad de archivos](https://help.autodesk.com/cloudhelp/ENU/Docs-Files/files/file-folder-actions/View_File_Activities_Docs.html) para actor, acción y fecha. Son referencias de diseño, no certificaciones.

Pendientes de los bloques 1/A, 9/I y 10/J: cerrar P-01 a P-07 en sesión demo acreditada; visibilidad del historial completo/exportación; versionado (Q-008), política de conservación y prueba de recuperación/backup; evaluación de antivirus antes de agregar un proveedor. No se asume que R2 sea un backup ni almacenamiento inmutable. Luego siguen 2/B y 3/C (WhatsApp y avisos), 4/D (audio), y 5/E a 8/H según el orden acordado. Ningún mensaje a terceros ni dato de clientes productivos se modifica en estas pruebas.

## Historial documental — siguiente entrega, 2026-11-20

La entrega anterior quedó publicada mediante PR #22, merge 226e0a7382fe2422f10874f2a066f811cf0df160. CI aprobó 2.965 pruebas unitarias, 18 pruebas SQL, 21 recorridos de navegador y build de 112 páginas. Producción Vercel 5vpQfDG9jWUJBW9VMexAY3AdSs22 confirmó éxito.

Esta etapa expone el historial existente por documento, con autor, fecha/hora y acción, en páginas de 50 eventos. El acceso se comprueba de nuevo por tenant, empresa, proyecto y entidad padre en cada consulta. La respuesta no incluye payloads, IP ni información de almacenamiento. Se consultan también las cargas incompletas, diferenciando inicio de confirmación. Se corrige el texto que prometía limpieza automática de subidas: el servicio de limpieza todavía no tiene cron conectado.

Se amplía la suite SQL con paginación bajo timestamps iguales, rechazo de cursores de otro documento, exclusión de ámbitos/eventos ajenos y comprobación de datos no expuestos. El smoke público verifica que la API exige sesión y prohíbe caché pública. No hay nuevas tablas, estados ni migraciones.

Se volvió a comprobar el acceso disponible: Neon devuelve 404 para crimson-dew-50407633 y Vercel devuelve 404 para el deployment conocido del proyecto Bloqer. No hay contraseña DOCS/E2E/SEED local. Por eso P-01 a P-07 permanecen pendientes como recorrido integral remoto. No se cambia ninguna contraseña ni se intenta usar producción como reemplazo del preview.

Siguientes pasos de 1/A, 9/I y 10/J: acceso efectivo al preview para cerrar el recorrido Demo; exportación del historial; versionado simple Q-008 y política de recuperación con prueba de restauración de objetos. La restauración de un adjunto archivado ya se verifica, pero no acredita recuperación de un objeto físicamente perdido. Luego siguen 2/B y 3/C (WhatsApp y avisos), 4/D (audio), y 5/E a 8/H según el plan.




## Exportación y comprobación de recuperación — 20/11/2026

Owner autorizó retomar los bloques 1/A, 9/I y 10/J tras comprobar que las entregas anteriores están integradas en main y publicadas. Este corte agrega CSV completo del historial autorizado y comprobación explícita de accesibilidad, tamaño y huella original cuando existe. No crea estados, tablas, dependencias ni eventos nuevos; no ejecuta restauraciones ni escribe datos de clientes. El versionado simple con migración y la política de backup/recuperación siguen como siguiente corte; verificar un objeto no acredita una copia independiente.

Validación preparada: pruebas de bytes alterados aun con igual tamaño; guardas previas a R2; respuestas HTTP privadas; SQL aislado de empresa/tenant/proyecto, exportación más allá de la primera página, neutralización de fórmulas, límite sin truncamiento y restauración concurrente con un solo evento. Se agregan recorridos de navegador para endpoints sin sesión y documentos inexistentes. Las comprobaciones locales y la corrida completa de CI se informan en el PR; esta sección no convierte pruebas preparadas en ejecutadas ni cierra el piloto remoto.
