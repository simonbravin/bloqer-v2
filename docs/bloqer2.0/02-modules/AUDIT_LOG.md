# Auditoría (Audit Log)

## 1. Objetivo
Registrar **quién hizo qué y cuándo** sobre entidades críticas: cambios de datos, aprobaciones, anulaciones, cierres de periodo, cambios de permisos ([`PRODUCT_PRINCIPLES.md`](../00-product/PRODUCT_PRINCIPLES.md) §13).

## 2. Usuarios y roles que lo usan
- **ADMIN**, **OWNER** (consulta completa); otros roles sin acceso salvo lectura parcial futura.

## 3. Problema que resuelve
Disputas legales internas y falta de trazabilidad para organismos de control.

## 4. Datos que consume (inputs)
- Eventos de aplicación y middleware de persistencia.

## 5. Datos que produce (outputs)
- **AuditLog** entries inmutables.

## 6. Entidades principales
- **AuditLog** (append-only).

## 7. Estados y transiciones
_No hay_; solo inserción.

## 8. Acciones disponibles
- Buscar por usuario, entidad, rango fechas.
- Exportar CSV/PDF para auditoría externa.

## 9. Pantallas y vistas necesarias
- UI tipo tabla con filtros avanzados.
- Vista detalle diff JSON antes/después.

## 10. Reglas de negocio
- Logs **no se borran** ([BR-AUD-004]).
- Retención configurable (ej. 7 años) — política tenant Fase 2.

## 11. Validaciones
- Payload tamaño máximo por entrada.

## 12. Fórmulas relacionadas
_No aplica._

## 13. Casos borde
- Acciones sistema (cron): `actor_user_id = SYSTEM`.

## 14. Reportes relacionados
- Export auditoría mensual.

## 15. Relación con otros módulos
- Observa **todos** los módulos.

## 16. Permisos
Solo ADMIN/OWNER por defecto.

## 17. Eventos disparados / consumidos
- Emite logs en cada mutación crítica.

## 18. Fase de implementación
**Fase 1**.

## 19. Preguntas abiertas
- SIEM integration (Fase 3).
