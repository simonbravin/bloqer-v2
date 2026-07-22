# Gastos, facturas de compra y pagos

## 1. Objetivo
Registrar **facturas de proveedor** (con o sin OC), generar **Payables**, aplicar **pagos parciales** y reflejar egresos en tesorería ([D-010], [D-006]).

## 2. Usuarios y roles que lo usan
- **FINANCE**, **PROCUREMENT**, **ADMIN**, **OWNER**.

## 3. Problema que resuelve
Impagos y falta de visibilidad de obligaciones futuras (AP aging).

## 4. Datos que consume (inputs)
- **PurchaseInvoice** confirmada o factura gasto sin compra previa.
- **Payment** con cuenta origen, FX, retenciones.

## 5. Datos que produce (outputs)
- **Payable** con saldo.
- **Payment** → **AccountMovement OUTCOME**.
- Actualización estado factura `PAID/OVERDUE`.

## 6. Entidades principales
- **PurchaseInvoice**, **Payable**, **Payment**, **TaxLine**.

## 7. Estados y transiciones
Ver PurchaseInvoice, Payable en [`STATE_MACHINES.md`](../01-domain/STATE_MACHINES.md).

## 8. Acciones disponibles
- Cargar factura compra (con imputación proyecto).
- Aprobar para pago.
- Registrar pago simple o lote (Fase 2).
- Anular con reversión.

## 9. Pantallas y vistas necesarias
- **Facturas y gastos:** listado documental con columna de **estado de pago** (Payable); desde OPEN/PARTIAL/OVERDUE se puede ir a pagar; alta corporativa en diálogo desde la misma pantalla.
- **Alta de factura en proyecto:** formulario con borrador → emitir; opción express **“Emitir y pagar ahora”** (cuenta de tesorería + fecha), visible solo con permiso de tesorería ([D-052]).
- **Adjuntos:** foto/copia de factura en el alta (create-then-upload) y en el detalle (`SUPPLIER_INVOICE`).
- **Cuentas por pagar:** bandeja de obligaciones ordenadas por vencimiento; “Registrar pago” posterior (parcial o total).
- **Transacciones:** ledger de **caja operativa** confirmada (cobros/pagos/ingresos/egresos); transferencias entre cuentas propias solo en Tesorería; no hay listado independiente de pagos.
- Detalle contextual de `Payment` para trazabilidad, anulación y contabilidad.
- Wizard de pago con retenciones manuales (Fase 2).
- **Fondos:** el pago bloquea si la cuenta quedaría en saldo negativo ([D-052], alineado a [BR-TRZ-004]).

> Ver [D-048](../00-product/DECISION_LOG.md), [D-052](../00-product/DECISION_LOG.md).

## 10. Reglas de negocio
- **BR-PAY-001**: pago no excede saldo Payable ([BR-TRZ-005]).
- AP sin proyecto permitido ([D-009]).

## 11. Validaciones
- Proveedor coherente en factura y pago.
- Periodo abierto ([BR-TRZ-003]).

## 12. Fórmulas relacionadas
- [`TAX_FORMULAS.md`](../04-formulas/TAX_FORMULAS.md), [`TREASURY_BALANCE_FORMULAS.md`](../04-formulas/TREASURY_BALANCE_FORMULAS.md).

## 13. Casos borde
- Pago anticipado sin factura: registrar anticipo como movimiento y compensar al facturar (Fase 2 cuenta puente).

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
