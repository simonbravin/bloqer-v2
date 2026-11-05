# Q-091 — Alcance de registros históricos sin empresa comprobable

**Estado.** Aprobada el 05/11/2026. Registrada como D-144.

El Registro contiene entradas que preceden a sus campos de alcance. Además, algunas escrituras de Configuración todavía omiten la empresa en eventos de una empresa o membresía. Un campo vacío puede representar un dato compartido o una relación que nunca se registró. Mostrar ambos como compartidos puede exponer una operación de otra empresa. Reasignar una persona tampoco demuestra que las acciones históricas pertenecieran a la empresa actual.

## Propuesta

- Para una sesión anclada, respetar la empresa del registro, la obra y los vínculos comprobables del evento. Los eventos genuinamente compartidos de la organización siguen disponibles.
- Para eventos históricos de entidades con empresa cuyo alcance no puede verificarse, reservar la consulta a una sesión autorizada con alcance global. Aplicar el mismo criterio en listado, detalle y CSV/PDF. Mantener los registros en su estado original.
- Guardar la empresa en los próximos eventos cuando ya la conoce el servicio de origen. Para datos históricamente parciales, usar vínculos inequívocos como el identificador de la propia empresa. Evitar reasignar eventos de una membresía a partir de su empresa actual.

Fuentes. [Módulo de auditoría](../../02-modules/AUDIT_LOG.md), [alcance de empresa](../TENANT_COMPANY_SCOPING.md) y D-111.
