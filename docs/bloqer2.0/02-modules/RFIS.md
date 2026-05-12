# RFIs — Requests for Information

## 1. Objetivo
Formalizar consultas del contratista al **cliente**, **dirección de obra** u otros actores durante la ejecución, con trazabilidad, respuesta y cierre ([`PRODUCT_SCOPE.md`](../00-product/PRODUCT_SCOPE.md)).

## 2. Usuarios y roles que lo usan
- **PM**, **SITE_FOREMAN**, **ADMIN**, **OWNER**; eventualmente **PROJECT_VIEWER** cliente (Fase 2).

## 3. Problema que resuelve
Consultas por WhatsApp sin registro generan disputas sobre plazos y decisiones.

## 4. Datos que consume (inputs)
- **Project**.
- Destinatario (`Contact` o usuario interno).
- Prioridad, fecha límite (`due_date`), adjuntos.

## 5. Datos que produce (outputs)
- **Rfi** con ciclo `DRAFT → SUBMITTED → ANSWERED → CLOSED` o cierre excepcional sin respuesta; bandera **`is_overdue`** cuando vence sin cerrar ([`STATE_MACHINES.md`](../01-domain/STATE_MACHINES.md) §16).
- Histórico consultable en auditoría y exportación.

## 6. Entidades principales
- **Rfi**.

## 7. Estados y transiciones
Ver [`STATE_MACHINES.md`](../01-domain/STATE_MACHINES.md) §16 Rfi ([BR-RFI-001], [BR-RFI-002]).

## 8. Acciones disponibles
- Crear RFI (`DRAFT`).
- Enviar (`SUBMITTED`).
- Registrar respuesta (`ANSWERED`).
- Cerrar (`CLOSED`); cierre sin respuesta solo con motivo obligatorio ([BR-RFI-001]).
- Cancelar (`CANCELLED`).
- Escalamiento si `is_overdue` ([Q-006]).

## 9. Pantallas y vistas necesarias
- Bandeja entrada/salida por proyecto.
- Detalle RFI con hilo de comunicación.
- Calendario de vencimientos.

## 10. Reglas de negocio
- **BR-RFI-001**: cierre estándar con respuesta; cierre sin respuesta solo con `closure_without_response_reason` ([BR-RFI-001]).
- **BR-RFI-002**: vencimiento = **`is_overdue`** / evento `rfi.overdue`, no estado ([BR-RFI-002]).

## 11. Validaciones
- `due_date` ≥ fecha creación (o permitir retroactivo con flag).

## 12. Fórmulas relacionadas
_No monetarias._

## 13. Casos borde
- RFI genérico sin impacto en costo vs RFI que desencadena Change Order — vínculo opcional.

## 14. Reportes relacionados
- RFIs abiertos por proyecto, tiempo medio de respuesta (Fase 2).

## 15. Relación con otros módulos
- **Proyectos**, **Documentos**, **Change Orders**.

## 16. Permisos
PM crea/edita; cliente externo solo lectura cuando exista portal.

## 17. Eventos disparados / consumidos
- `rfi.created`, `rfi.submitted`, `rfi.answered`, `rfi.closed`, `rfi.cancelled`, `rfi.overdue` (alerta); job `recompute_overdue_rfis`.

## 18. Fase de implementación
**Fase 1** núcleo; SLA avanzado según [Q-006].

## 19. Preguntas abiertas
- SLA y alertas ([Q-006]); portal cliente ([Q-014]).
