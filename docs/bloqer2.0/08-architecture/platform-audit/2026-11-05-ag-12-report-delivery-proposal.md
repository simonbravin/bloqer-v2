# Q-087 — Alcance de los reportes entregados por correo

**Estado.** Aprobada el 05/11/2026. Registrada como D-140.

AG-11 verificó el acceso de cada destinatario al parte diario D-100. El resto de los envíos programados todavía puede generar un mismo archivo para destinatarios con permisos distintos. Una persona con membresía activa puede así recibir secciones financieras o datos de una obra que quedan fuera de su acceso habitual.

## Propuesta

- En un envío programado, **Enviar ahora** o **Reintentar fallidos**, generar cada adjunto con la intersección del alcance autorizado de la configuración y de la sesión cuando corresponda, y el acceso vigente del destinatario. Se comprueban membresía activa, empresa, asignación de obra, permisos y módulos. Se conserva el alcance corporativo definido para los reportes de Tesorería.
- Aplicar los mismos filtros de acceso que ya usan las pantallas y exportaciones. Si un reporte admite secciones restringidas, el archivo incluye las autorizadas. Si el destinatario carece de acceso al reporte completo, se omite ese adjunto. Si no queda ninguno, se registra una entrega omitida y no se envía correo.
- El envío manual independiente desde una pantalla de reporte conserva la dirección elegida por la persona que tiene permiso para descargar ese archivo. Esa operación expresa una decisión puntual de compartir y no agrega destinatarios externos a las programaciones.
- Se mantienen las configuraciones, frecuencias y formatos existentes. La comprobación usa los permisos actuales al ejecutar o reintentar. No se requiere migrar ni agregar campos.

## Alternativas

- Conservar el archivo con los permisos de la configuración como una delegación de acceso. Requiere definir explícitamente quién puede delegar cada dato y cómo revocar esa delegación.
- Exigir también una membresía interna para el envío manual. Aumenta la restricción y elimina el envío puntual a una dirección elegida por quien puede exportar.

## Verificación prevista

Se probarán con un proveedor simulado destinatarios de otra empresa, sin asignación de obra, con secciones restringidas, dados de baja y plenamente autorizados. Se comprobarán generación y metadatos del envío, reintentos e historial. El envío manual seguirá usando la autorización del reporte y la validación de su dirección.

Fuentes. [P-AG12-01](../PENDING_ARCHITECTURE_ITEMS.md#p-ag12-01--alcance-de-los-archivos-que-recibe-cada-destinatario), [envíos programados](../SCHEDULED_REPORTS_ARCHITECTURE.md), [envío manual 9C](../EMAIL_NOTIFICATIONS_ARCHITECTURE.md#phase-9c--envío-manual-de-reportes-por-email-implementado), D-100 y D-120.
