# Notificaciones y alertas

Arquitectura técnica Phase 8A: [`08-architecture/NOTIFICATIONS_ARCHITECTURE.md`](../08-architecture/NOTIFICATIONS_ARCHITECTURE.md).

## 1. Objetivo
Informar en tiempo casi real a usuarios sobre eventos críticos: vencimientos AR/AP, sobrecertificación, RFIs vencidos, aprobaciones pendientes, periodo cerrado bloqueando operación ([`EVENTS_AND_AUTOMATIONS.md`](../01-domain/EVENTS_AND_AUTOMATIONS.md)).

## 2. Usuarios y roles que lo usan
Todos; configuración por usuario **Fase 2**.

## 3. Problema que resuelve
Errores por desconocimiento de estado del sistema y cuellos de botella de aprobación.

## 4. Datos que consume (inputs)
- Eventos del dominio y jobs programados (aging, RFIs).

## 5. Datos que produce (outputs)
- **Notification** in-app (obligatorio Fase 1).
- Email transaccional opcional ([Q-009]).

## 6. Entidades principales
- **Notification**, preferencias usuario (Fase 2).

## 7. Estados y transiciones
`UNREAD` → `READ` → archivada/expirada.

## 8. Acciones disponibles
- Marcar leída, marcar todas leídas.
- Ir a entidad origen (deep link).
- Silenciar tipo de notificación (Fase 2).

## 9. Pantallas y vistas necesarias
- Campana en header con lista paginada.
- Centro de notificaciones con filtros.

## 10. Reglas de negocio
- Notificaciones respetan tenant y rol destinatario.
- No enviar duplicados exactos mismo día (dedupe opcional).

## 11. Validaciones
- Payload JSON schema-valid por tipo de evento.

## 12. Fórmulas relacionadas
_No aplica._

## 13. Casos borde
- Usuario suspendido: no encolar notificaciones.

## 14. Reportes relacionados
_No usuario final_; métricas internas uso email.

## 15. Relación con otros módulos
- Consume todos los eventos listados en §4 de [`EVENTS_AND_AUTOMATIONS.md`](../01-domain/EVENTS_AND_AUTOMATIONS.md).

## 16. Permisos
Global por usuario autenticado.

## 17. Eventos disparados / consumidos
- Consume eventos; puede emitir `notification.sent`.

## 18. Fase de implementación
**Fase 1** in-app; **email** según [Q-009].

## 19. Preguntas abiertas
- Email día 1 vs Fase 2 ([Q-009]); digest diario (Fase 2).
