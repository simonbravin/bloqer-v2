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
- **Referencia de techo RBAC** en `/configuracion/permisos`: matriz agrupada + notas internas por módulo (JSON en `Tenant`), sin sustituir la asignación real de roles por usuario (sigue en equipo / invitaciones).

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

## 20. Implementación vigente y revalidación AG-01 (03/11/2026)

- Invitación por email implementada según [D-064]. La cuenta global `User` y la membresía `UserMembership` son distintas; Equipo cambia membresía/roles, no suspende todas las organizaciones del usuario.
- Los roles fijos viven en `UserMembership.roles`; no existe una entidad persistida `Role`/`UserRoleAssignment` separada en el schema actual. `ProjectMembership` implementa el ACL [D-111]; `ProjectTeamMember` es el roster de avisos [D-091].
- Ingreso: cuenta, tenant y membresía activos, al menos un rol y anclaje de empresa válido. Una empresa explícita inválida no se convierte en acceso global. [D-092] solo completa un anclaje originalmente nulo.
- El último propietario elegible para operar exige cuenta y membresía activas. Roles/estado, asignaciones e invitaciones comparten bloqueo por tenant, lectura y auditoría dentro de transacción; se verificaron cambios simultáneos sobre SQL aislado.
- Gates de configuración y permisos se aplican en servidor y formularios. Consola de plataforma usa una autoridad distinta; un OWNER del tenant no obtiene acceso a `/platform`.
- El ciclo funcional general de User conserva estados objetivo no implementados; ver el **Hallazgo AG-01** en [STATE_MACHINES §21](../01-domain/STATE_MACHINES.md#21-user-usuario). No se agregó un flujo de archivado ni nuevos estados en esta auditoría.

Evidencia, correcciones y límites de ejecución: [informe AG-01](../08-architecture/platform-audit/2026-11-03-ag-01-identity-access.md).
