# Gastos, facturas de compra y pagos

## 1. Objetivo
Registrar **facturas de proveedor** (con o sin OC), generar **Payables**, aplicar **pagos parciales** y reflejar egresos en tesorería ([D-010], [D-006]). El payee de un gasto sin OC puede ser proveedor o empleado ([D-089]).

## 2. Usuarios y roles que lo usan
- **FINANCE**, **PROCUREMENT**, **ADMIN**, **OWNER**.

## 3. Problema que resuelve
Impagos y falta de visibilidad de obligaciones futuras (AP aging).

## 4. Datos que consume (inputs)
- Factura de proveedor (`SupplierInvoice`, implementación de `PurchaseInvoice`) con o sin compra previa.
- **Payment** con cuenta origen, FX, retenciones.

## 5. Datos que produce (outputs)
- **Payable** con saldo.
- **Payment** → **AccountMovement OUTFLOW**.
- Actualización de saldo y estado derivado de `Payable`; la factura conserva su ciclo documental.

## 6. Entidades principales
- **PurchaseInvoice** / implementación `SupplierInvoice` (incluye `invoice_letter` A/B/C/E — [D-084]), **Payable**, **Payment**. `TaxLine` es conceptual y sigue pendiente; IVA por línea e IIBB de cabecera son los campos operativos actuales.
- Condición IVA del proveedor y de la empresa alimentan la sugerencia de letra del comprobante recibido.

## 7. Estados y transiciones
`SupplierInvoice`: `DRAFT → ISSUED → CANCELLED`, con anulación de borrador permitida. `Payable`: `OPEN`, `PARTIAL`, `PAID`, `OVERDUE`, `CANCELLED`, derivado de deuda/caja/crédito. Ver [`STATE_MACHINES.md`](../01-domain/STATE_MACHINES.md). `PAID` no es un estado documental de la factura; **Saldada** puede incluir créditos NC sin salida de dinero.

## 8. Acciones disponibles
- Cargar factura compra (con imputación proyecto).
- **Desde un comprobante → Leer comprobante** en el alta manual directa de obra o empresa, cuando el piloto está habilitado (ADR-019): PDF/JPEG/PNG/WebP de hasta 3 MiB, propuesta efímera, revisión del original y **Usar datos y completar**. Solo factura normal en ARS; no elige proveedor ni partida ni sustituye líneas de una OC. La confirmación guarda un **borrador** y adjunta el original; no emite ni paga. Número fiscal leído solo informativo, sin deduplicación fiscal automática.
- Emitir el borrador según permisos y controles de compra; al emitir nace la CxP.
- Registrar pago simple o lote (Fase 2).
- Anular con reversión; los documentos emitidos y pagos confirmados requieren motivo.

## 9. Pantallas y vistas necesarias
- **Facturas y gastos:** listado documental con columna de **estado de pago** (Payable); desde OPEN/PARTIAL/OVERDUE se puede ir a pagar; alta corporativa en diálogo desde la misma pantalla.
- **Oficina → Finanzas → Facturas y gastos** (`/finanzas/facturas-proveedor`): **Nueva nota de crédito / Nueva nota de débito** abre un selector de **Factura de referencia**, con búsqueda por código/proveedor y solo facturas emitidas de empresa sin proyecto. La nota queda en borrador para editar y emitir; la NC admite monto total o parcial hasta el saldo vigente. Se conserva el acceso desde el detalle de la factura y el filtro **Tipo de documento** para encontrar las notas.
- **Proyecto → Facturas proveedor:** **Nueva nota de crédito / Nueva nota de débito** permite elegir una factura emitida de esa obra como referencia, con búsqueda paginada por código/proveedor. Se conserva el acceso desde el detalle. **Letra del comprobante** selecciona A/B/C/E y es independiente del tipo de documento.
- **Alta de factura en proyecto:** formulario con borrador → emitir; opción express **"Emitir y pagar ahora"** (cuenta de tesorería + fecha), visible solo con permiso de tesorería ([D-052]).
- **Adjuntos:** foto/copia de factura en el alta (create-then-upload) y en el detalle (`SUPPLIER_INVOICE`).
- **Recuperación del adjunto de un borrador nuevo:** si la creación devolvió un ID y falla el archivo, **Reintentar adjunto** reutiliza ese ID; **Abrir borrador** permite continuar desde el detalle. Una respuesta de creación incierta bloquea la repetición en ese formulario y ofrece **Revisar listado**; no equivale a idempotencia persistente de alta.
- **Refinamiento UX autorizado (19/11/2026):** dentro de la misma alta, elegir **Carga manual** o **Desde un comprobante** cuando la capacidad está disponible. Archivo → revisión de pendientes → **Usar datos y completar** → revisión del formulario y **Guardar borrador**. Los datos ausentes quedan vacíos, incluidos IVA, descuentos e IIBB; el usuario los completa explícitamente (cero cuando corresponda). La selección con/sin IVA no se presume. Se muestran primero las observaciones y un resumen; el detalle completo queda desplegable. El total calculado se muestra recién cuando están completos sus datos. Se confirma la comparación contra el original antes de guardar; editar invalida esa confirmación. No se cambian las reglas financieras del alta. Moneda/tipo incompatibles, impuestos no representables identificados, líneas fuera de alcance e inconsistencias comprobables continúan bloqueando el prellenado. Ausencia no verificable de impuestos requiere revisión humana explícita, no equivale a ausencia confirmada.
- **Cuentas por pagar:** bandeja de obligaciones ordenadas por vencimiento; “Registrar pago” posterior (parcial o total).
- **Transacciones:** ledger de **caja operativa** confirmada (cobros/pagos/ingresos/egresos); transferencias entre cuentas propias solo en Tesorería; no hay listado independiente de pagos.
- Detalle contextual de `Payment` para trazabilidad, anulación y contabilidad.
- Wizard de pago con retenciones manuales (Fase 2).
- **Fondos:** el pago bloquea si la cuenta quedaría en saldo negativo ([D-052], alineado a [BR-TRZ-004]).

> Ver [D-048](../00-product/DECISION_LOG.md), [D-052](../00-product/DECISION_LOG.md).

## 10. Reglas de negocio
- **BR-PAY-001**: pago no excede saldo Payable ([BR-TRZ-005]).
- AP sin proyecto permitido ([D-009]).
- Payee de gasto/factura sin OC: Contact con rol `SUPPLIER` o `EMPLOYEE` ([BR-AP-001], [D-089]).
- Letra de comprobante A/B/C/E sugerida y editable; requerida al emitir si operación AR ([D-084]).
- **Tipo de documento ([D-115]):** Factura / Nota de crédito / Nota de débito en `SupplierInvoice.documentKind`. NC aplica crédito a CxP sin caja; ND abre Payable nueva.
- Las ND copian los importes guardados de las líneas de origen, incluido el redondeo de IVA; las líneas ingresadas o modificadas se calculan con el kernel vigente. La NC por monto conserva por defecto la partida y el tipo de costo de la primera línea de origen, como la NC por saldo completo; revisar la imputación del borrador si la factura contiene varias partidas. No se inventa un prorrateo ni se vinculan líneas de OC/APU automáticamente.
- El alta de NC vuelve a comprobar dentro de la transacción que la CxP esté activa y tenga saldo positivo; si se saldó durante la espera, rechaza el alta. Las fechas explícitas `YYYY-MM-DD` se conservan como fechas calendario, sin convertirlas a un día anterior por zona horaria.
- IVA y percepción IIBB no negativos, incluidos ajustes explícitos del importe de percepción; cero permitido. Un borrador negativo debe corregirse antes de emitir, sin alterar documentos históricos ([D-133]).

## 11. Validaciones
- Vínculo a OC, incluso manual solo de cabecera: misma empresa, tenant, obra, proveedor y moneda; OC y padres WBS/APU coherentes. Se revalida al crear/editar/emitir antes de mutar. No se atribuyen renglones por descripción/importe y la carga manual sin FK de línea sigue permitida con sus avisos.
- Lectura asistida: autoriza AP y alcance antes del proveedor; valida bytes/formato/tamaño y salida estructurada sin herramientas. No usa valores habituales para completar datos ausentes. Las comprobaciones de importes reutilizan el kernel y tolerancia vigentes; diferencias no generan renglones de ajuste. El servicio de alta vuelve a aplicar todas las reglas al guardar.
- Payee coherente en factura y pago ([BR-AP-001] / [D-089]): `SUPPLIER` o `EMPLOYEE` si no hay OC; `SUPPLIER` si hay OC.
- Periodo abierto ([BR-TRZ-003]).
- `invoice_letter` presente al emitir si empresa o proveedor tienen `country = AR` ([D-084]).
- Pago en la misma moneda de la deuda y cuenta compatible con su empresa; moneda extranjera exige FX manual del pago (ARS por 1 unidad, hasta 6 decimales; D-008). **Pagar saldo total** usa el saldo guardado en servidor.

## 12. Fórmulas relacionadas
- [`TAX_FORMULAS.md`](../04-formulas/TAX_FORMULAS.md), [`TREASURY_BALANCE_FORMULAS.md`](../04-formulas/TREASURY_BALANCE_FORMULAS.md).

## 13. Casos borde
- Anticipo sin factura y compensación posterior mediante cuenta puente: diseño futuro, sin procedimiento implementado de aplicación a CxP. El pago actual siempre se vincula a una obligación emitida.
- Sueldo / reintegro: gasto AP al contacto `EMPLOYEE`; no es liquidación de haberes. Monotributista que factura: rol `SUPPLIER` (más `EMPLOYEE` si es personal interno).

## 14. Reportes relacionados
- Aging AP, gastos por proveedor, cashflow egresos.

## 15. Relación con otros módulos
- **PROCUREMENT**, **Subcontratos**, **Tesorería**.

## 16. Permisos
FINANCE opera pagos; PROCUREMENT ve montos según política.

## 17. Eventos disparados / consumidos
- `purchase_invoice.*`, `payment.confirmed`, `payable.*`.

## 18. Fase de implementación
**Fase 1**.

## 19. Preguntas abiertas
- Pagos batch / archivos ([Q-007] relacionado).

## Hallazgo — AG-09: estados documentales y deuda separados

La descripción previa atribuía `PAID/OVERDUE` a la factura y anunciaba una aprobación `APPROVED` no presente en `SupplierInvoice`. Se armoniza con las máquinas actuales y D-089/D-115: emitir crea CxP; pagos y NC explican su saldo, con `OUTFLOW` solo al pagar. El modelo `TaxLine` y la cuenta puente se distinguen de los flujos disponibles. D-133 agrega la protección de signo aprobada, sin migrar históricos.
