# AG-03 — Acceso del creador a una obra nueva

> **Propuesta recomendada aprobada por el Owner, 03/11/2026:** «Acceso del creador solo a la obra nueva». Se registra como enmienda de D-111 y se implementa y verifica en AG-03. La simplificación general de roles y límites por usuario sigue como evaluación separada, sin aprobación de rediseño.

## Situación comprobada

`createProject` permite crear a quien tiene `EDIT PROJECTS`. En una organización con `MEMBERSHIP_SCOPED`, un `PROJECT_MANAGER` sin acceso global crea la obra pero no obtiene `ProjectMembership`. El formulario intenta abrirla y el guard de acceso la rechaza. La alta automática de `ProjectTeamMember` es únicamente el roster de avisos, conforme a D-091; no concede acceso.

Fuentes: [Proyectos](../../02-modules/PROJECTS.md), [D-111 — ACL de proyectos](../../00-product/DECISION_LOG.md#d-111--project-membership-acl-procurement--view-projects-treasury-sin-viewer), [D-091](../../00-product/DECISION_LOG.md#d-091--equipo-de-obra-roster--notificaciones-de-libro-de-obra), `packages/services/src/project/project.service.ts:createProject` y `packages/services/src/security/access.ts:requireProjectAccess`.

D-111 exigía permiso y asignación bajo ese modo, sin definir quién recibía acceso al dar de alta una obra. [Q-067](../../00-product/OPEN_QUESTIONS.md#q-067--acceso-del-creador-a-una-obra-nueva-en-modo-por-asignación) queda resuelta mediante la enmienda aprobada; se adopta la propuesta recomendada que sigue.

## Propuesta recomendada: acceso del creador a la nueva obra

- Si el creador necesita asignación para acceder según el modo vigente, crear un `ProjectMembership` para ese mismo usuario, tenant y proyecto recién creado.
- Usar la tabla y los campos existentes; no agregar campos, estados o una nueva clase de permiso.
- Persistir la obra, su auditoría y la asignación en la misma transacción. Conservar el roster D-091 como mecanismo de avisos independiente.
- El acceso queda limitado a la obra creada y al techo de permisos de los roles que ya posee el usuario. No modificar asignaciones de otras obras ni realizar una migración histórica.
- Registrar la definición como enmienda explícita de D-111 y reflejarla en Proyectos, workflow de alta, Guía y Ayuda.
- Verificar creación por PM en modo por asignación, lectura inmediata de la nueva obra, rechazo de obras ajenas, rollback ante fallo y conservación del comportamiento para quienes ya tienen acceso global.

## Alternativas concretas

1. **Reservar el alta a administradores con acceso global cuando rige el modo por asignación.** Ocultar la acción y rechazarla antes de escribir para PM sin acceso global. El administrador crea y asigna la obra.
2. **Conservar el alta y la asignación manual.** Mostrar confirmación de creación y regresar al listado con una indicación para solicitar asignación, sin intentar abrir una obra que el creador todavía no puede ver.

Las alternativas se conservan como antecedentes de la decisión; no se aplican.
