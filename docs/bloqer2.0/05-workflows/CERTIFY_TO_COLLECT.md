# Workflow: De certificación a cobranza

## 1. Objetivo
Encadenar **certificación aprobada → factura venta → receivable → cobranza en caja**.

## 2. Actor
FINANCE (+ PM para hitos intermedios).

## 3. Precondiciones
- Certificación `APPROVED` (facturación desde certificación; la UI y el service gateean en `APPROVED`).
- Datos fiscales cliente completos.

## 4. Pasos
1. Generar **SalesInvoice** desde certificación (o manual). A lo sumo **una factura activa** (no `CANCELLED`) por `certificationId` — guard en service + índice parcial DB `sales_invoices_one_active_per_certification_key`.
2. Estado factura `ISSUED` → crea **Receivable** (`receivable.created`) y aviso `RECEIVABLE_READY_TO_COLLECT` a finanzas empresa ([D-072]).
3. Registrar **Collection**: seleccionar cuenta destino, montos, FX. Solo la cobranza acredita tesorería ([D-072]).
4. Aplicar cobranza a factura(s); permite parciales ([D-010]).
5. Confirmar → **AccountMovement INCOME** + actualización `paid_amount`.

## 5. Postcondiciones
- Avance financiero del proyecto actualizado.
- `Certification.payment_status` recalculado desde AR/cobranzas (`receivable.payment_status_recalculated` / cadena desde `collection.confirmed`); **`Certification.status`** solo cambia por ciclo documental (emitir/aprobar/rechazar/anular), **no** por facturación.

## 6. Eventos
- `sales_invoice.issued`, `collection.confirmed`, `receivable.fully_paid`, `receivable.overdue_detected`, `receivable.payment_status_recalculated`

## Referencias
- [`SALES_AND_COLLECTIONS.md`](../02-modules/SALES_AND_COLLECTIONS.md)
