# AG-04 — Cancelación de presupuestos en revisión

**Estado:** aprobada explícitamente por el Owner durante AG-04; formalizada en D-121 el 04/11/2026. Q-068 resuelta. Se conserva el funcionamiento actual propuesto.

## Contradicción comprobada

`cancelBudget` y la pantalla existente permiten cancelar presupuestos en `DRAFT`, `IN_REVIEW` y `RETURNED_FOR_CHANGES`, con permiso `EDIT BUDGETS`. La [máquina de estados](../../01-domain/STATE_MACHINES.md#3-budget-presupuesto) solo dibuja `DRAFT → CANCELLED`, mientras el [catálogo de eventos](../../01-domain/EVENTS_AND_AUTOMATIONS.md#22-budget) usa un origen genérico `*`. Ninguna de estas cancelaciones corresponde a un presupuesto aprobado o cerrado.

## Propuesta recomendada: conservar el funcionamiento actual

- Permitir cancelar desde **Borrador**, **En revisión** y **Con observaciones** a quien ya tenga permiso de editar presupuestos y acceso a esa obra.
- Conservar el bloqueo de cancelación en **Aprobado**, **Cerrado** y **Cancelado**.
- Mantener la operación auditada y los documentos existentes. No se eliminan filas ni se alteran certificados o movimientos financieros.
- Explicitar los tres orígenes en el diagrama, el catálogo de eventos, la guía y la ayuda. Protegerlos con una regresión del servicio.

Esto conserva los estados, eventos, permisos y comportamiento vigentes en el código. No incorpora campos, migraciones ni una simplificación de roles.

## Alternativa

Restringir **Cancelar** únicamente a **Borrador**, como indica hoy el diagrama. Requeriría modificar el servicio y los controles actuales para impedir la cancelación durante revisión o después de una devolución.

## Por qué requiere definición

[AGENTS.md §2](../../../../AGENTS.md) exige consultar reglas ambiguas. Elegir entre conservar el flujo actual y restringirlo no se resuelve mediante una comprobación técnica. Las demás correcciones de AG-04 continúan de forma independiente.
