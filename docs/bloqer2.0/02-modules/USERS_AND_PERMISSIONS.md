# Usuarios y permisos

## 1. Objetivo
Administrar **usuarios del tenant**, **roles globales y por proyecto**, y permisos simples `VIEW / EDIT / APPROVE` por módulo ([D-012]).

## 2. Usuarios y roles que lo usan
- **ADMIN**, **OWNER** exclusivamente para cambios de permisos.

## 3. Problema que resuelve
Filtraciones entre empresas y acceso no controlado a datos financieros sensibles.

## 4. Datos que consume (inputs)
- Lista usuarios, roles definidos en [`USER_ROLES.md`](../00-product/USER_ROLES.md).
- Asignación proyecto ↔ usuario.

## 5. Datos que produce (outputs)
- **User**, **UserRoleAssignment**.
- Invitaciones ([Q-015]).

## 6. Entidades principales
- **User**, **Role**, **UserRoleAssignment**.

## 7. Estados y transiciones
Ver [`STATE_MACHINES.md`](../01-domain/STATE_MACHINES.md) § User.

## 8. Acciones disponibles
- Invitar / crear usuario.
- Asignar/quitar roles globales y por proyecto.
- Suspender / archivar usuario.
- Reset password / 2FA ([Q-016]).

## 9. Pantallas y vistas necesarias
- Lista usuarios con roles efectivos.
- Editor matriz simplificada (no por campo).

## 10. Reglas de negocio
- **BR-MT-001**: aislamiento tenant ([BR-MT-001]).
- Rentabilidad neta solo OWNER/ADMIN por defecto ([D-013]).

## 11. Validaciones
- Email único por tenant.
- No último OWNER sin transferencia ([R-USR-002]).

## 12. Fórmulas relacionadas
_No aplica._

## 13. Casos borde
- Usuario en múltiples proyectos con roles distintos: permiso = unión ([PERMISSIONS_MATRIX.md](../00-product/PERMISSIONS_MATRIX.md) §4).

## 14. Reportes relacionados
- Auditoría de cambios permisos.

## 15. Relación con otros módulos
- Transversal a todo el sistema.

## 16. Permisos
Solo ADMIN/OWNER gestionan usuarios ([PERM §2.4]).

## 17. Eventos disparados / consumidos
- `user.*`, `user.role_assigned`.

## 18. Fase de implementación
**Fase 1**.

## 19. Preguntas abiertas
- Invitación email ([Q-015]); 2FA ([Q-016]); roles custom ([Q-024]).
