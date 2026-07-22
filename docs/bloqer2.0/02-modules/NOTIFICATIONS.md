# Notificaciones y alertas

Arquitectura técnica: [`08-architecture/NOTIFICATIONS_ARCHITECTURE.md`](../08-architecture/NOTIFICATIONS_ARCHITECTURE.md). Decisión de campana in-app + audiencia: [D-054](../00-product/DECISION_LOG.md#d-054--campana-in-app-polling-y-cc-owneradmin).

## 1. Objetivo
Informar en tiempo casi real a usuarios sobre eventos críticos: vencimientos AR/AP, certificaciones, documentos, aprobaciones de compra, alertas operativas ([`EVENTS_AND_AUTOMATIONS.md`](../01-domain/EVENTS_AND_AUTOMATIONS.md)).

## 2. Usuarios y roles que lo usan
Todos los miembros activos del tenant (bandeja personal). OWNER/ADMIN reciben copia de las notificaciones generadas (CC). Preferencias por usuario **Fase 2**.

## 3. Problema que resuelve
Errores por desconocimiento de estado del sistema y cuellos de botella de aprobación.

## 4. Datos que consume (inputs)
- Eventos del dominio y jobs programados (aging, stock, SLA compras).

## 5. Datos que produce (outputs)
- **Notification** in-app (obligatorio).
- **Email transaccional** para procurement (SC/OC y recordatorios SLA) según [D-050] / [BR-PUR-015]. Resto del producto: ver [Q-009](../00-product/OPEN_QUESTIONS.md) (cerrada parcial).

## 6. Entidades principales
- **Notification**, preferencias usuario (Fase 2).

## 7. Estados y transiciones
`UNREAD` → `READ` → `ARCHIVED` (sin hard delete). El estado es **por destinatario** (una fila por usuario).

## 8. Acciones disponibles
- Marcar leída, marcar todas leídas, archivar.
- Ir a entidad origen (deep link).
- Silenciar tipo de notificación (Fase 2).

## 9. Pantallas y vistas necesarias
- Campana en header: dropdown con las **últimas 5** no archivadas, badge solo si hay no leídas, enlace “Ver todas” (acceso principal a la bandeja; **sin** ítem en Configuración).
- Centro `/notificaciones` con filtros (todas / no leídas / leídas / archivadas) y **paginación 20** por página. Sin búsqueda en esta fase.
- `/notificaciones/alertas` y `/notificaciones/emails` (OWNER/ADMIN). Alertas: cron diario **12:00 UTC** en prod; panel = corrida manual. Vencimientos = día calendario **UTC**.

## 10. Reglas de negocio
- Notificaciones respetan tenant; audiencia por permiso + **CC OWNER/ADMIN** ([D-054]).
- Leído es por usuario: marcar leída no afecta otras copias.
- Dedupe de alertas operativas: misma entidad + destinatario en ventana de 7 días.
- Alertas operativas de estado (AR/AP, stock, etc.): job batch automático (cron) + runner manual opcional; AR/AP vencidos **materializan** `OVERDUE` y notifican.
- **Compras ([D-050], [BR-PUR-015]):** in-app + email en cambios de estado de SC/OC; recordatorio por antigüedad con escalamiento a OWNER/ADMIN. Fallo de email = best-effort (no aborta la mutación).

## 11. Validaciones
- Payload JSON schema-valid por tipo de evento.
- `actionUrl` solo ruta relativa in-app.

## 12. Fórmulas relacionadas
_No aplica._

## 13. Casos borde
- Usuario suspendido / sin membresía ACTIVE: no encolar.
- Sin asignación usuario↔proyecto: el fan-out por permiso es a nivel tenant.

## 14. Reportes relacionados
_No usuario final_; métricas internas uso email (`EmailDeliveryLog`).

## 15. Relación con otros módulos
- Consume eventos listados en arquitectura y procurement; alertas operativas vía cron / runner manual.

## 16. Permisos
Bandeja personal: cualquier usuario autenticado con tenant. Alertas operativas y log de emails: OWNER/ADMIN. No exige `VIEW NOTIFICATIONS` para el inbox.

## 17. Eventos disparados / consumidos
- Consume eventos; puede emitir `notification.sent`.

## 18. Fase de implementación
In-app + campana con polling ([D-054]); email según [Q-009] / [D-050].

## 19. Preguntas abiertas
- Preferencias / mute, Web Push, routing por obra, nuevos tipos (cobros, transferencias): diferidos — ver limitaciones en arquitectura.
