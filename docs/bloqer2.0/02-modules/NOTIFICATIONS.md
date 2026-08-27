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
- **Email transaccional** para procurement (SC/OC y recordatorios SLA) según [D-050] / [BR-PUR-015], CxP/CxC ([D-069]/[D-072]), **libro de obra** ([D-091]), invitaciones y reportes. Todas las plantillas usan el mismo layout: organización (tenant) en encabezado y Subject, contexto de proyecto/entidad/actor, CTA. Auth (verificar / reset) no lleva tenant. Resto del producto: ver [Q-009](../00-product/OPEN_QUESTIONS.md) (cerrada parcial).

## 6. Entidades principales
- **Notification**, preferencias usuario (Fase 2).

## 7. Estados y transiciones
`UNREAD` ↔ `READ` → `ARCHIVED` (sin hard delete). El estado es **por destinatario** (una fila por usuario). Desde `READ` se puede volver a `UNREAD` (limpia `readAt`). Las archivadas no vuelven a leídas/no leídas en esta fase.

## 8. Acciones disponibles
- Marcar leída, marcar como no leída, marcar todas leídas, archivar.
- Ir a entidad origen (deep link).
- Silenciar tipo de notificación (Fase 2).

## 9. Pantallas y vistas necesarias
- Campana en header: dropdown con las **últimas 5** no archivadas, badge solo si hay no leídas, enlace “Ver todas” (acceso principal a la bandeja; **sin** ítem en el sidebar de empresa ni de obra — [D-087]; **sin** ítem en Configuración).
- Centro `/notificaciones` con filtros (todas = no archivadas / no leídas / leídas / archivadas) y **paginación 20** por página. Sin búsqueda en esta fase. Mobile: enlace en **Más**.
- `/notificaciones/alertas` y `/notificaciones/emails` (OWNER/ADMIN). Alertas: cron diario **12:00 UTC** en prod; panel = corrida manual. Vencimientos = día calendario **UTC**.

## 10. Reglas de negocio
- Notificaciones respetan tenant; audiencia por permiso + **CC OWNER/ADMIN** ([D-054]).
- Leído es por usuario: marcar leída no afecta otras copias.
- Dedupe de alertas operativas: misma entidad + destinatario en ventana de 7 días.
- Alertas operativas de estado (AR/AP, stock, etc.): job batch automático (cron) + runner manual opcional; AR/AP vencidos **materializan** `OVERDUE` y notifican.
- **Compras ([D-050], [BR-PUR-015], [D-094]):** in-app + email en cambios de estado de SC/OC; recordatorio por antigüedad con escalamiento a OWNER/ADMIN. El cuerpo in-app y el email incluyen organización, proyecto y solicitante; el Subject del mail va prefijado con el tenant (`[Indari] …`). Fallo de email = best-effort (no aborta la mutación). Audiencia ampliada de follow-through: `PURCHASE_ORDER_APPROVED` también a quien puede confirmar al proveedor; `PURCHASE_ORDER_CONFIRMED` a quien puede registrar recepción (Depósito / Compras / PM). La cola operativa (SC a cotizar, OC a confirmar, OC a recibir) también aparece en **Pendientes** ([D-094]); CxP **Listo para pagar** sigue solo en campana.
- **Libro de obra ([D-091]):** in-app + email en `JOBSITE_LOG_SUBMITTED` (OWNER/ADMIN ∪ equipo de obra ∩ `canSuperviseJobsiteLog`), `JOBSITE_LOG_RETURNED` y `JOBSITE_LOG_APPROVED` (`createdBy` ∪ OWNER/ADMIN). Roster = `ProjectTeamMember` (no es RBAC). Fallo de email = best-effort.
- **Título identificable:** el título in-app (y el Subject del mail) es `{evento} · {identificador}` — p. ej. `Documento listo · Factura FP-00005`, `Listo para pagar · FP-00005`, `Parte pendiente · 24/08/2026`, `Parte devuelto · 24/08/2026`, `Nueva solicitud · SC-003`. El cuerpo conserva archivo, montos y notas. Helper: `packages/services/src/notifications/notification-copy.ts`. Las filas ya persistidas no se reescriben.

## 11. Validaciones
- Payload JSON schema-valid por tipo de evento.
- `actionUrl` solo ruta relativa in-app.

## 12. Fórmulas relacionadas
_No aplica._

## 13. Casos borde
- Usuario suspendido / sin membresía ACTIVE: no encolar.
- Sin miembros en el **Equipo de obra** (`ProjectTeamMember`): `JOBSITE_LOG_SUBMITTED` llega solo a OWNER/ADMIN ([D-091]). El fan-out genérico por permiso (sin roster) sigue siendo a nivel tenant para otros módulos.
- Capataz en el roster sin techo de supervisión: no recibe avisos de partes pendientes; sí recibe devolución/aprobación de *su* parte vía `createdBy`.

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
- Preferencias / mute, Web Push, RBAC “solo su proyecto” (R-USR-007 sobre `ProjectTeamMember`), SLA de partes SUBMITTED, nuevos tipos (cobros, transferencias): diferidos — ver limitaciones en arquitectura.
