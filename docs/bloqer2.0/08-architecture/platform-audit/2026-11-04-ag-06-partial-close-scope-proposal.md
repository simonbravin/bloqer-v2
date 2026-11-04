# AG-06 — Cierre del saldo no recibido de una OC

- Fecha: 2026-11-04.
- Estado: aprobada expresamente por el Owner el 04/11/2026, D-128. Funcionalidad diferida a desarrollo separado.
- Fuentes: BR-PUR-013, STATE_MACHINES (destino conceptual «cierre»), módulo PURCHASE_ORDERS_AND_RECEIPTS, schema y recorridos reales de OC.

## Hallazgo

La documentación describe cerrar el saldo que ya no se recibirá en una OC confirmada o parcialmente recibida. No existe esa acción, ni un campo de cierre/cantidad desistida, ni una regla precisa que reconcilie el compromiso remanente con facturas, NC/ND y recepciones anuladas. El destino conceptual «cierre» no es un estado persistido. Las recepciones y anulaciones existentes sí están implementadas.

## Propuesta recomendada

Registrar el cierre parcial formal como desarrollo funcional separado y excluirlo expresamente del lote correctivo AG-06, conservando la brecha visible en el plan. No afirmar que existe en guía/ayuda, no reducir cantidades ni importes de una OC confirmada para simularlo y no habilitar su anulación si ya tiene recepciones/facturas que lo impiden.

Antes de implementarlo, preparar una especificación revisable: representación del remanente desistido, efectos exactos en compromiso/exposición, tratamiento de facturas/NC/ND, recepción tardía y su reversa, trazabilidad y permisos. Requerirá aprobación de los campos y la regla financiera, más migración y pruebas de sus consumidores. Esta separación no autoriza omitir bugs confirmados de los recorridos actuales de AG-06.

## Alternativa

Mantener AG-06 abierta para diseñar y aprobar primero esa nueva funcionalidad y luego implementarla en la misma etapa. No puede resolverse con un ajuste mecánico ni con datos modificados manualmente.

## Autorización requerida

El Owner decide el alcance porque BR-PUR-013 promete la capacidad y AGENTS.md §§2 y 5 impide inventar su persistencia o cálculo financiero. La propuesta recomendada delimita el lote; no declara resuelta la funcionalidad.
