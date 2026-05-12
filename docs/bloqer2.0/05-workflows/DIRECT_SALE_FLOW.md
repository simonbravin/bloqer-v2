# Workflow: Venta directa (sin certificación)

## 1. Objetivo
Facturar servicio/obra menor **sin pasar por certificación formal** ([D-018]).

## 2. Actor
SALES o ADMIN.

## 3. Precondiciones
- Cliente con rol; proyecto opcional.

## 4. Pasos
1. Crear **DirectSale** o factura directa.
2. Cargar líneas y impuestos manuales.
3. Emitir **SalesInvoice** → **Receivable**.
4. Cobrar vía **Collection** igual flujo estándar.

## 5. Postcondiciones
- Ingreso registrado; rentabilidad por proyecto si `project_id` informado.

## 6. Eventos
- `sales_invoice.issued`

## Referencias
- [`SALES_AND_COLLECTIONS.md`](../02-modules/SALES_AND_COLLECTIONS.md)
