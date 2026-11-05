# AG-07 — Unidad de producto y cantidades de stock

**Estado: aprobada por el Owner el 05/11/2026, implementada y verificada.** Q-077 resuelta en D-130. Ambas protecciones sin conversiones: quince casos SQL de unidades/partes/APU y ocho de compras, además de regresiones generales, UI y revisión independiente. Evidencia en el [informe AG-07](./2026-11-04-ag-07-inventory.md). AG-08 espera indicación del usuario.

## Problema comprobado

- `Product.unit` admite edición. `StockMovement` no guarda una unidad histórica propia; historial, transferencias y reportes leen la unidad actual del producto. Cambiar kg por toneladas puede hacer que 100 kg aparezcan como 100 toneladas, manteniendo cantidad 100.
- Una recepción copia `quantityReceived` desde la línea de OC al movimiento sin comprobar que la unidad del documento coincida con la del producto. Dos bolsas pueden incorporarse como dos kg, sin conversión.
- MASTER_DATA §8.3 impide eliminar unidades referenciadas, pero no define editar la unidad del producto. BR-INV-004 regula el método de valuación; D-123/D-125 no definen esta frontera física.

## Propuesta recomendada

1. **Unidad fija desde la primera referencia.** Permitir cambiar `Product.unit` solo mientras el producto no tenga referencias en SC, OC, APU, material de parte, transferencia o movimiento de stock, cualquiera sea su estado. Con referencias, permitir corregir nombre, descripción, categoría, notas y estado según reglas actuales, conservando la unidad. Reenviar la misma unidad no es un cambio. Para operar otra unidad, crear otro producto.
2. **Misma unidad antes de afectar existencias.** En operaciones nuevas que vinculan un producto con una unidad explícita, comprobar compatibilidad de etiquetas al crear/editar la compra y al confirmar la recepción o el consumo desde parte. No convertir cantidades. Admitir únicamente normalizaciones de escritura ya definidas por el catálogo/helper vigente; una etiqueta desconocida o una diferencia física se rechaza con un mensaje que indique revisar producto/unidad del documento.
3. **Revalidación atómica.** Comprobar referencias/unidad bajo el bloqueo del producto y las operaciones relacionadas, de forma que crear una referencia y editar la unidad simultáneamente no eludan el control. Conservar auditoría y rollback existentes.
4. **Históricos conservados.** No renombrar, convertir, reconstruir ni migrar cantidades anteriores. Reintentar una operación idempotente ya realizada devuelve su resultado sin repetir efectos. Si una OC histórica incompatible intenta generar un ingreso nuevo, bloquear ese ingreso e indicar revisar el documento origen; no editar una OC confirmada ni inventar equivalencias para recibirla.

No agrega campos persistidos, estados, conversiones, dependencias, roles ni migraciones. No implementa FIFO, reservas o cierre parcial de OC. Un método de conversión futuro requiere diseño y aprobación separados.

## Verificación prevista

- Producto libre: cambiar unidad y auditar. Producto referenciado: rechazar cambio y conservar unidad/auditoría; permitir edición de otros campos y misma unidad.
- Carreras entre primera referencia y cambio de unidad: un solo contrato válido, sin reinterpretación de documentos.
- Nueva OC/recepción/parte compatibles: cantidad exacta y efecto único. Incompatibles: ningún movimiento ni cantidad parcial; error visible y formulario conservado.
- Históricos, anulaciones y replays sin conversión; controles de tenant/empresa/obra y regresiones de compras/partes intactos.
- Guía, ayuda y conocimiento explican el control sin atribuir una conversión automática al producto.

## Alternativa

**Precisión de implementación:** la inspección del schema confirma que el material del parte no guarda unidad explícita. Usa la del producto y la fija desde su referencia en borrador; aprobación revalida ese producto bajo bloqueo. No se agrega un campo ni se compara contra la unidad WBS. La comprobación de etiquetas se aplica a los documentos que sí las tienen (SC/OC/APU).

Diseñar conversiones y unidad histórica por documento/movimiento. Requiere nuevos campos, factores, redondeos, migración y tratamiento de datos previos; no es un arreglo seguro para incluir sin ese diseño.
