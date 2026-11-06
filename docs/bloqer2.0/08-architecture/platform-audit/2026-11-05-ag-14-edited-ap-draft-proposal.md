# Q-092 — Recepción posterior a una factura de proveedor editada

**Estado** · Aprobada por el Owner durante AG-14. Registrada como [D-145](../../00-product/DECISION_LOG.md#d-145--protección-de-un-borrador-de-proveedor-editado-al-recibir-otra-entrega).

## Caso reproducible

1. Activar **Al recibir, crear borrador de factura** en una empresa. Confirmar una recepción parcial de una OC por un renglón de 100 ARS.
2. Abrir la factura en borrador. Cambiar el unitario a 120 ARS para reflejar el comprobante del proveedor y guardar.
3. Confirmar otra recepción de la misma OC con cantidades pendientes de facturar. El sistema toma el borrador existente y regenera todas sus líneas desde la OC. El unitario del primer renglón vuelve a 100 ARS. El mismo cambio puede ocurrir al pulsar **Actualizar borrador** desde la OC.

La causa está en `syncAutoFromPoDraftLines`. Cuando cambia la cobertura por renglón, elimina las líneas existentes y las crea desde la OC. El reemplazo también alcanza cantidades, descripciones, descuentos, IVA y referencias EDT/APU. [Servicio](../../../../packages/services/src/ap/supplier-invoice-from-po.service.ts).

D-108 permite generar un borrador al recibir y P-IND-02 describe ampliarlo cuando entra una nueva recepción. Ambos dejan abierta la prioridad entre una sugerencia nueva y las ediciones ya guardadas por Finanzas. [D-108](../../00-product/DECISION_LOG.md#d-108--borrador-ap-automático-al-confirmar-recepción) y [P-IND-02](../PENDING_ARCHITECTURE_ITEMS.md#p-ind-02--cobertura-de-factura-y-concurrencia-ocrecepción).

## Alternativas

- **Conservar el borrador editado y pedir revisión manual.** Si la actualización cambiaría sus líneas y existe un evento `supplier_invoice.updated` del mismo documento, conservar el borrador y comunicar **Completá la factura manualmente**. Una recepción confirmada permanece confirmada y muestra el aviso del atajo D-108. La acción **Actualizar borrador** muestra el mismo motivo con acceso al documento para completarlo. Los borradores generados que todavía no se editaron se pueden ampliar como hoy.
- **Combinar automáticamente las líneas existentes con las nuevas.** Preservar los datos fiscales editados y agregar o ampliar líneas según la nueva recepción. Requiere definir qué hacer ante cantidades ajustadas, más de una línea por ítem y dos precios o alícuotas distintos para el mismo ítem. La definición debe precisar cuándo dividir renglones y cómo validar el nuevo total del comprobante.

## Propuesta recomendada

Aplicar la primera alternativa. Usar el evento de edición que `updateSupplierInvoice` registra en la misma transacción, acotado al tenant y al documento que el servicio ya verificó. Comprobarlo bajo los bloqueos existentes de proyecto y OC, antes de reemplazar líneas. La consulta usa evidencia histórica disponible. Los documentos históricos y los eventos guardados se conservan sin backfill ni migración. El evento identifica que hubo una edición guardada. Su contenido no se usa para calcular montos ni para inferir qué campos editó Finanzas. [Servicio de edición](../../../../packages/services/src/ap/supplier-invoice.service.ts).

El caso de aceptación confirma una recepción posterior después de editar el unitario y verifica el mismo ID de borrador, sus líneas e importes intactos, el aviso y la recepción confirmada. La regresión D-108 mantiene la ampliación de un borrador automático sin ediciones. Si se aprueba, se actualizan la guía y la ayuda de Compras en el mismo lote.
