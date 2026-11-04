# Propuesta pendiente — Simplificar roles sin alterar accesos existentes

**Origen:** aclaración del Owner durante AG-03, 03/11/2026. Sugirió 4 o 5 roles y poder limitar visibilidad o dejar solo lectura a cada usuario. Esta propuesta no cambia el producto ni autoriza una migración. La aprobación de Q-067 cubre únicamente el acceso del creador a su obra nueva.

## Punto de partida real

Hoy hay 12 roles canónicos en `UserMembership.roles`, una matriz por módulo con `VIEW / EDIT / APPROVE`, módulos habilitados por organización, contexto de empresa y `ProjectMembership` para asignar obras. Los permisos de varios roles se unen: agregar un rol de lectura no reduce otro rol de edición. `ProjectTeamMember` es el roster de avisos, y los roles de contactos son relaciones comerciales; ninguno reemplaza los permisos del usuario.

Fuentes: [implementación vigente de Usuarios](../../02-modules/USERS_AND_PERMISSIONS.md#20-implementación-vigente-y-revalidación-ag-01-03112026), [matriz](../../00-product/PERMISSIONS_MATRIX.md), [roles](../../00-product/USER_ROLES.md), ADR-Phase1-04 y D-111. Las restricciones personales por módulo que reduzcan el techo de un rol no existen como contrato general aprobado.

## Diseño funcional para evaluar

Presentar cinco perfiles comprensibles: **Propietario**, **Administración**, **Finanzas**, **Operación** y **Consulta**. Es un punto de partida para discutir los perfiles; todavía no se define una equivalencia con los 12 roles ni se combinan sus permisos. Por ejemplo, unificar Compras, Depósito y Jefe de obra sin revisar cada capacidad podría mostrar costos o habilitar aprobaciones que antes no correspondían.

Cada usuario podría tener tres decisiones separadas:

1. **Perfil base:** funciones habituales y acciones que permite.
2. **Alcance:** empresa y obras a las que puede entrar, reutilizando las asignaciones vigentes cuando corresponda.
3. **Límites personales:** módulos ocultos o solo lectura. Un límite reduciría el permiso base; no concedería capacidades que el perfil no tiene. Debe definirse expresamente cómo se resuelven conflictos y cuáles son las protecciones del último propietario.

No proponer permisos por cada campo. Mantener nombres de módulos comprensibles y una vista previa que explique qué puede ver, modificar o aprobar cada persona antes de guardar.

## Desarrollo y verificación por etapas

1. **Comparar antes de cambiar.** Inventariar capacidades efectivas de los usuarios actuales por empresa/obra/módulo, sin registrar datos privados. Acordar los cinco perfiles y los límites personales. Resolver [Q-024](../../00-product/OPEN_QUESTIONS.md#q-024--roles-personalizables-vs-solo-predefinidos) y registrar decisión de producto y ADR antes de nuevos campos o cambios de semántica.
2. **Preparar una propuesta de conversión.** Para cada usuario, mostrar capacidades conservadas, reducidas o ampliadas. La conversión inicial debe preservar sus permisos efectivos. Cualquier diferencia necesita una decisión explícita; no inferir concesiones por el nombre de un perfil.
3. **Construir una autoridad compartida.** Si se aprueba el diseño, UI, Actions, servicios, listados, reportes, documentos, notificaciones y Bloqer AI deben consultar el mismo resultado. Ocultar un menú por sí solo no restringe el acceso.
4. **Validar en una base aislada.** Comprobar URL directa, lectura, edición, aprobación, empresa, obra, módulo deshabilitado, varios perfiles, revocación y cambios simultáneos. Comparar el antes/después de los dos usuarios actuales y probar la restauración del esquema previo.
5. **Aplicar una vez revisado el resultado.** Publicación y eventual migración se autorizan sobre la conversión concreta. Actualizar Guía, Ayuda, knowledge y pruebas de permisos en el mismo lote.

## Relación con la auditoría

AG-03 conserva y corrige el esquema actual. Esta simplificación es un desarrollo posterior que reutiliza AG-01 para identidad/permisos y el runbook para auditar cambios por área. Al implementarla, se debe revalidar el permiso efectivo en todos los módulos que cambien; no es necesario repetir áreas cuyo contrato y dependencias permanezcan iguales.
