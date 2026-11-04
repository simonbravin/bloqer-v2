# AG-06 — Cambio de FX después de aprobar una OC

- Fecha: 2026-11-04.
- Estado: aprobada expresamente por el Owner el 04/11/2026, D-129; implementación y verificación en AG-06.
- Fuentes: D-008, MONEY_MODEL, APPROVAL_WORKFLOWS §2.2 y `confirmPurchaseOrder`.

## Hallazgo

Una OC aprobada puede confirmarse con otro FX manual. El importe en ARS puede pasar a un nivel de aprobación superior, pero hoy la confirmación no vuelve a comprobar ese nivel ni la segregación del aprobador. D-008 permite el FX manual al movimiento; la inmutabilidad comienza en CONFIRMED. No está definida la vigencia de la aprobación ante ese cambio.

## Propuesta recomendada

Conservar la carga manual del FX al confirmar. Si el FX cambia respecto del aprobado, el mismo actor debe poder aprobar nuevamente el importe recalculado en ARS, con las reglas vigentes de monto, varianza y segregación. Dentro de la misma transacción se actualizan el aprobador y la fecha de aprobación, se registra el evento existente `purchase_order.approved` con el cambio de FX y luego se confirma. No se agregan estados ni eventos.

Si el actor no cumple los requisitos, rechazar toda la operación y conservar intacta la OC APPROVED, con un mensaje que indique que debe revisarla y confirmarla un aprobador habilitado. Ese aprobador puede ingresar el FX al confirmar. Con el FX aprobado sin cambios se mantiene el permiso actual de confirmación. Después de CONFIRMED, monto y FX siguen inmutables.

Verificar cambio a un umbral superior, segregación, confirmación autorizada, atomicidad de auditoría y el caso sin cambio de FX. No publicar ni cambiar históricos.

## Alternativa

Fijar el FX al aprobar y quitar su edición durante la confirmación. Cualquier corrección debe prepararse en un borrador conforme al flujo vigente. Cambia el momento de carga previsto por D-008 y limita el circuito actual.

## Autorización requerida

AGENTS.md §§2 y 5 exige resolver con el Owner esta regla financiera antes de implementarla. La propuesta conserva los umbrales y roles actuales; no simplifica ni amplía permisos.
