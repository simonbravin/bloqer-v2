# AG-10 — Decisiones de Tesorería por confirmar

**Estado:** propuesta para revisión del Owner. D-008, D-023 y D-079 siguen vigentes.

## Q-081 — Tipo de cambio de nuevos movimientos

Un ingreso manual en USD puede confirmar un saldo nominal sin guardar el tipo de cambio. La misma brecha existe en saldos iniciales, ajustes de conciliación y transferencias entre dos cuentas en USD. En pagos y cobranzas, el documento guarda el dato pero su movimiento de caja no lo conserva.

**Propuesta recomendada.** Agregar `fxRate` y `amountArs` opcionales a `AccountMovement`. Para cada movimiento nuevo en ARS se registra 1 y el importe original. Los nuevos movimientos en moneda extranjera guardan el tipo de cambio de esa operación a seis decimales y el equivalente en ARS a dos decimales. Los pagos y cobros copian su propio dato al crear la pierna de caja. Ingresos, egresos, saldos iniciales y ajustes por extracto piden cotización manual si generan caja extranjera. Una transferencia entre cuentas de la misma moneda extranjera pide una sola cotización y conserva el mismo equivalente en las dos piernas. El detalle de la transferencia lo lee de las piernas vinculadas.

Conservar importes, saldos nativos y documentos históricos. Un total consolidado en ARS queda indisponible si alguna contribución extranjera carece de cotización comprobable. Los importes nativos siguen a la vista. Esto requiere migración aditiva de dos columnas, validación de todos los escritores, comparación de reintentos por valor y pruebas SQL aisladas. Las transferencias entre monedas distintas siguen como desarrollo separado.

Alternativa: separar el desarrollo del snapshot y mantener los totales nativos por moneda con la limitación visible hasta su implementación.

## Q-082 — Fecha de valor en transferencias propias

La pantalla y el esquema guardan una sola fecha, aunque D-023 pide distinguir la fecha contable de la acreditación. Hoy el extracto y los cortes del saldo usan la fecha contable como única referencia.

**Propuesta recomendada.** Incorporar una `valueDate` de calendario opcional a la transferencia y a sus movimientos. Para nuevas transferencias, la pantalla pide Fecha contable y Fecha valor, prellenando la segunda con la primera hasta que el usuario la edite. Las dos piernas guardan la fecha valor de la operación. Los cierres de período y GL siguen la fecha contable. El extracto conserva la fecha contable por defecto, permite consultar por fecha valor y muestra el criterio de saldo utilizado. Si un histórico carece de fecha valor, muestra «Sin registrar» y la vista por fecha valor señala que para esa fila se usó la fecha contable como referencia. La conciliación compara con la fecha valor disponible. Se agregan las columnas sin completar fechas históricas.

Alternativa: dejar el circuito por fecha valor como desarrollo separado y ajustar documentación y pantallas a la fecha contable que existe hoy.

## Q-083 — Dirección de transferencias en archivos OFX/QFX

D-079 define la dirección por el monto. Los tests conservan una adaptación de bancos que omiten el signo y usan un tipo inequívoco, como `DEBIT`. `XFER` puede ser ingreso o egreso, pero el parser actual lo trata siempre como débito y rechaza un `+` válido.

**Propuesta recomendada.** Conservar la compatibilidad con tipos inequívocos cuando el banco omite el signo y rechazar contradicciones entre un signo explícito y un tipo inequívoco. Para `XFER`, aceptar `+` como ingreso y `-` como egreso. Cuando `XFER` no tiene signo explícito, señalar la fila ambigua y pedir que se corrija el archivo o se registre la línea manualmente. La importación conserva su validación previa a escrituras. El cambio aplica a nuevas importaciones.

Alternativa: usar el valor numérico de `TRNAMT` como autoridad para todo el archivo, incluido un positivo sin `+`. Cambiaría la interpretación actual de archivos con `DEBIT` y magnitud positiva sin signo.

## Q-084 — Anular un origen con un borrador contable en mes cerrado

Un asiento borrador ligado a un cobro, pago o movimiento puede tener una fecha distinta de la operación. Si el mes de la operación está abierto y el del asiento está cerrado, la anulación automática omite el bloqueo del borrador. D-061 exige sincronizar la anulación con el origen. D-078 bloquea mutaciones del asiento en un período cerrado. La sincronización ya es atómica en los caminos revisados.

**Propuesta recomendada.** Bloquear la anulación completa cuando el borrador vinculado esté en un mes cerrado. Mostrar el período que hace falta reabrir. Una vez abierto, la operación y su borrador se anulan juntos. Un asiento posteado conserva su circuito de reversión autorizado y no cambia de estado por esta decisión.

Alternativa: formalizar una excepción para cancelar solo el borrador vinculado al anular su origen. Esto conserva la conducta actual y requiere aclararla en D-078.

## Q-085 — Saldo inicial negativo en una cuenta nueva

La pantalla admite un saldo inicial negativo. El servicio crea un movimiento de apertura solo cuando el saldo es positivo. En una cuenta nueva con saldo negativo, el extracto parte del campo de la cuenta sin movimiento de apertura, cotización o control de período. En moneda extranjera queda incompleto el consolidado en pesos incluso si se conoce la cotización.

**Propuesta recomendada.** Conservar la posibilidad de abrir una cuenta con saldo negativo y registrarlo como egreso de apertura `OPENING_BALANCE`, con monto positivo y signo de salida. Aplicar los mismos requisitos de empresa, fecha y período abierto que al saldo inicial positivo, y pedir FX para ambas direcciones de una apertura extranjera. El saldo sigue siendo negativo. La apertura se conserva en el extracto y no genera asiento automático. Los saldos históricos permanecen como se registraron.

Alternativa: conservar temporalmente el campo actual para aperturas negativas y diseñar la migración funcional por separado. El consolidado de una apertura extranjera sin cotización queda incompleto.

## Q-086 — Asientos de facturas cuando falta solo la cuenta de IIBB

El código y sus pruebas conservan la línea de IVA si existe su cuenta, y agrupan la percepción de IIBB con el neto si falta solo su cuenta contable. D-112 §7 describe una salida de dos líneas cuando falta una cuenta, sin distinguir qué cuenta falta. La diferencia puede cambiar la clasificación del IVA en empresas con un plan de cuentas anterior.

**Propuesta recomendada.** Documentar el circuito existente. Cuando falta solo la cuenta de IIBB, conservar IVA por separado si su cuenta está disponible y describir la percepción junto al neto. Cuando hay IVA y falta su cuenta, se mantiene el borrador de dos líneas por el total. Las empresas que tienen las cuentas pueden discriminar ambos conceptos. No se recalculan asientos existentes ni cambian los importes de las facturas.

Alternativa: aplicar el fallback literal de dos líneas también cuando falta solo IIBB. Cambiaría los borradores nuevos y dejaría de discriminar un IVA que hoy aparece separado.

## Aprobación y alcance

AGENTS §§2 y 5 exige confirmar nuevos campos, comportamiento financiero y cambios de semántica de una decisión. Cada punto se decide por separado. Una aprobación autoriza implementar y comprobar en el entorno aislado de AG-10. La publicación de AG-09 se tramita por separado.
