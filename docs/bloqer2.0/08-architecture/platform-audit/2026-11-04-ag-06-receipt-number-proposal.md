# AG-06 — Identificación de recepciones de compra

- Fecha: 2026-11-04.
- Estado: aprobada expresamente por el Owner el 04/11/2026, D-127; implementación y verificación en AG-06.
- Fuentes: D-050.8, Q-002, `PurchaseReceipt` en `schema.prisma`, `createPurchaseReceipt` y pantallas de recepciones.

## Hallazgo

D-050 promete correlativos por empresa para solicitudes, órdenes y recepciones. Las recepciones solo tienen UUID: varias recepciones de una misma OC se muestran con el mismo código de OC. No hay un correlativo de recepción existente que pueda recuperarse.

## Propuesta recomendada

Agregar `PurchaseReceipt.number` entero opcional para conservar los históricos, con unicidad por `(tenantId, companyId, number)`. Toda recepción nueva creada por el servicio recibe un correlativo propio de su empresa dentro de la transacción, mediante el mismo bloqueo de empresa que protege la numeración de SC/OC. El número se conserva al anular y no se reutiliza. Mostrar `RC-<número>` junto con la OC de origen; los registros previos conservan su UUID y se identifican como recepción histórica, sin inventar números retroactivos.

La migración solo agrega el campo y el índice; no elimina ni renumera documentos. Verificar creación concurrente, aislamiento entre empresas y visualización de históricos en la base aislada de auditoría. No aplicar en producción ni publicar como parte de esta aprobación.

## Alternativa

Conservar únicamente UUID, hacerlo visible para distinguir recepciones y enmendar expresamente D-050.8 para diferir el correlativo. Evita una migración, pero mantiene la excepción al esquema de numeración previsto.

## Autorización requerida

AGENTS.md §5 exige consultar antes de agregar un campo persistido. Esta propuesta autoriza únicamente el campo, índice, numeración, migración y recorridos descritos, sin nuevos estados ni reglas financieras.
