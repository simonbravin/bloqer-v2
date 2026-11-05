# Q-090 — Entregas programadas sin confirmación

**Estado.** Aprobada el 05/11/2026. Registrada como D-143.

Un proveedor puede aceptar un correo y perderse la respuesta o el registro local. Hoy un reintento puede mandar el mismo reporte de nuevo. Una clave de idempotencia de Resend dura 24 horas y requiere el mismo contenido. D-140 vuelve a comprobar los permisos y los reportes pueden cambiar entre intentos. La ventana de siete días de 17E sigue siendo adecuada para fallos confirmados. [P-AG13-01](../PENDING_ARCHITECTURE_ITEMS.md#p-ag13-01--confirmación-del-proveedor-y-persistencia-de-la-entrega) · [Resend](https://resend.com/changelog/idempotency-keys).

## Propuesta

- Cuando el proveedor devuelve un identificador, volver a intentar guardar esa confirmación si falla la escritura local. Evitar una segunda llamada al proveedor para ese intento.
- Cuando no se puede determinar si el proveedor aceptó un envío programado, conservar la evidencia y mostrar que la entrega quedó sin confirmar. Excluirla de los reenvíos automáticos y de **Reintentar fallidos**. Aplicar la misma protección al recuperar una corrida cuyo intento ya había quedado pendiente.
- Mantener el reintento de siete días para fallos confirmados y los controles de permisos vigentes por destinatario. **Enviar ahora** sigue disponible como una nueva entrega explícita de la configuración y vuelve a comprobar los permisos.
- Reutilizar los registros, estados y acciones existentes. No persistir copias de adjuntos, agregar campos ni ejecutar pruebas con correo real.

La alternativa es permitir reintentos de una entrega ambigua durante la garantía del proveedor si puede acreditarse la identidad del archivo y el permiso vigente. Requiere un mecanismo para probar que el contenido coincide y gestionar la expiración. La prueba de la propuesta simulará aceptación, rechazo y pérdida de respuesta o persistencia.
