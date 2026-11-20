# Piloto documental — preparación del 20/11/2026

Estado al 20/11/2026: preflight de DB ejecutado por la consola autenticada de Neon; empresa demo confirmada en desarrollo. Recorrido funcional con servicios externos todavía pendiente. Se guardó una corrección de AUTH_URL exclusiva de la rama del piloto; el redeploy manual se canceló al quedar pendiente la verificación de identidad. No se creó otra empresa en Neon ni se ejecutó su seed.

El Owner reiteró autorización para usar **Bloqer Demo** en todas las pruebas necesarias, preservando los clientes reales. No volver a pedir autorización para cada ensayo sobre esa demo. La preparación y las pruebas automatizadas independientes de Neon/Vercel pueden avanzar sin esperar una sesión de navegador.

### Continuación independiente del acceso del navegador

Se agregó un caso de navegador autenticado que crea una factura manual de empresa mediante el formulario y el servicio reales, recarga el detalle y comprueba que conserva el documento y la acción de emitir (sigue siendo borrador). Usa la demo sembrada en Postgres descartable de CI; se ejecuta en escritorio, tablet y celular. No activa IA, R2, emisión ni pagos; no utiliza la DB de Neon. El resultado se acredita con el check del commit, no con la existencia del test. Las capturas se adjuntan al reporte autenticado de CI.

Primera corrida: `44743449756`, commit `a1970c3f8c74c3bdea7b15753781b68cc45c4b7a`. Lint, tipos, pruebas unitarias, índice, build, nueve casos públicos y los nueve autenticados anteriores pasaron. El caso nuevo falló en los tres tamaños antes de guardar: su selector omitía el asterisco del label obligatorio **Letra del comprobante \***. Se corrigió el selector; no se alteró el formulario ni se debilitó la prueba. El check de la revisión posterior es la evidencia de su resultado.

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
