# Service layer — Bloqer 2.0

## Decisión

Toda **mutación de negocio** y toda **operación que combine** validación de estado + persistencia + efectos colaterales (otras tablas, eventos, jobs) pasa por **application services** (service layer). Los servicios son la **API interna** del dominio hacia handlers/acciones; **no** dependen de React.

## Justificación para Bloqer 2.0

- Reglas como **BR-SUB-003**, **BR-CERT-007**, cierres de presupuesto, **collection.confirmed** canónico ([`../00-product/DECISION_LOG.md`](../00-product/DECISION_LOG.md) D-028, D-026, D-029) requieren un lugar único y testeable.
- **Eventos funcionales** ([`../01-domain/EVENTS_AND_AUTOMATIONS.md`](../01-domain/EVENTS_AND_AUTOMATIONS.md)) mapean a **efectos en servidor**: actualizar AR, mover tesorería, recalcular derivados — trabajo de servicio + transacción.
- **Auditoría** ([`../02-modules/AUDIT_LOG.md`](../02-modules/AUDIT_LOG.md)) debe registrarse de forma sistemática en el mismo lugar donde se confirma la operación.

## Problemas que evita

- Lógica duplicada entre **varios** endpoints o acciones.
- Estados inválidos al **omitir** una verificación en un solo camino.
- Dificultad para **razonar** sobre transacciones y rollback.

## Qué NO hacer

- No crear servicios “Dios” que importen **todo** el mundo; respetar límites de [`MODULAR_MONOLITH.md`](./MODULAR_MONOLITH.md).
- No poner **serialización JSON** o headers HTTP dentro del service core.
- No usar el service layer para **queries de reporte masivo** sin estrategia (ver [`REPORTING_ARCHITECTURE.md`](./REPORTING_ARCHITECTURE.md)); puede haber **read models** o servicios de lectura separados.
- No implementar aquí **Prisma models** concretos (eso es implementación).

## Responsabilidades típicas (conceptuales)

- **Cargar** agregado mínimo necesario con `tenant_id` y permisos.
- **Validar** transición contra [`../01-domain/STATE_MACHINES.md`](../01-domain/STATE_MACHINES.md).
- **Aplicar** [`../01-domain/BUSINESS_RULES.md`](../01-domain/BUSINESS_RULES.md) y políticas de [`../00-product/DECISION_LOG.md`](../00-product/DECISION_LOG.md).
- **Persistir** en transacción; emitir **eventos de aplicación** / encolar jobs ([`BACKGROUND_JOBS_ARCHITECTURE.md`](./BACKGROUND_JOBS_ARCHITECTURE.md)).
- **Registrar** auditoría cuando corresponda.

## Revalidación transaccional de Proyectos y Directorio (AG-03)

Un guard previo al comienzo de una transacción da una respuesta temprana, pero no protege por sí solo frente a otro escritor. Los caminos corregidos en AG-03 conservan rol/ACL/gate y vuelven a comprobar la condición mutable dentro de la transacción:

- `lockProjectForMutation` toma la fila de la obra por `id` + `tenantId` con `FOR NO KEY UPDATE`. Los wrappers operativos y de planificación reutilizan las políticas de estado existentes. Este bloqueo precede a PR/PO, presupuesto, certificación, factura o empresa cuando se componen esos caminos.
- Cancelar consulta sus bloqueantes mediante el mismo `tx` después del bloqueo de la obra. Crear un documento o cambiarlo a un estado bloqueante usa ese mismo bloqueo antes de escribir. No se cambian las reglas existentes de reversión que permiten cerrar obligaciones.
- Editar `Project.code`, incluso si el formulario reenvía el mismo valor, toma antes `Tenant FOR KEY SHARE`: actualizar una columna del índice único puede elevar el lock de la obra. El orden evita invertir la comprobación FK de auditoría frente a la administración de ACL, que ya coordina por tenant.
- El alta de obra con posible asignación del creador lee el modo fresco bajo `Tenant FOR NO KEY UPDATE`, y confirma obra, asignación y auditoría en una única transacción. Se aplica la enmienda aprobada Q-067; no se crean permisos generales.
- La validación CLIENT al crear o cambiar cliente y la baja del rol se coordinan por la fila `Contact` con `FOR NO KEY UPDATE`. La comprobación del rol y de proyectos vinculados se repite por `tx`; el mismo orden protege la edición de perfiles frente a bajas concurrentes.

Son correcciones de integridad dentro del service layer y de las transacciones existentes, sin nuevos modelos ni estados. El alcance y las pruebas de los consumidores adaptados se registran en el informe AG-03; no equivale a haber auditado íntegramente los módulos financieros, de compras o planificación.

## Referencias funcionales

- Reglas: [`../01-domain/BUSINESS_RULES.md`](../01-domain/BUSINESS_RULES.md)
- Estados: [`../01-domain/STATE_MACHINES.md`](../01-domain/STATE_MACHINES.md)
- Eventos: [`../01-domain/EVENTS_AND_AUTOMATIONS.md`](../01-domain/EVENTS_AND_AUTOMATIONS.md)
- Workflows: [`../05-workflows/`](../05-workflows/)

## Documentos técnicos relacionados

- [`BACKEND_LAYERING.md`](./BACKEND_LAYERING.md)
- [`MULTITENANCY_ARCHITECTURE.md`](./MULTITENANCY_ARCHITECTURE.md)
- [`SECURITY_ARCHITECTURE.md`](./SECURITY_ARCHITECTURE.md)
