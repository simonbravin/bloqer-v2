# Órdenes de compra y Recepciones

## 1. Objetivo
Formalizar la compra con **OC** como compromiso con proveedor y **Recepción** como confirmación física de ingreso de bienes/servicios, **separadas de la factura** ([D-020]).

## 2. Usuarios y roles que lo usan
- **PROCUREMENT**, **WAREHOUSE**, **PM**, **ADMIN**.

## 3. Problema que resuelve
Mezclar OC, recepción y factura genera errores de stock y de compromiso de caja.

## 4. Datos que consume (inputs)
- Proveedor, proyecto, líneas con cantidad/precio, ítem WBS opcional.
- Depósito destino para recepción física.

## 5. Datos que produce (outputs)
- **PurchaseOrder** numerada; en `APPROVED`/`CONFIRMED` aporta a **`committed_amount`**; la factura asociada aporta a **`accrued_amount`** sin duplicar el mismo compromiso ([BR-COS-002], [D-006]).
- **Receipt** parcial o total → **StockMovement IN** si hay producto ([BR-INV-005]).
- Trazabilidad OC → recepción → factura.

## 6. Entidades principales
- **PurchaseOrder**, **PurchaseOrderLine**, **Receipt**, **ReceiptLine**.

## 7. Estados y transiciones
Ver [`STATE_MACHINES.md`](../01-domain/STATE_MACHINES.md) § PurchaseOrder y Receipt.

## 8. Acciones disponibles
- Crear/editar OC borrador → enviar → aprobar → **confirmar al proveedor**.
- Registrar recepción(es) parciales.
- Cerrar OC cuando cantidades completas.
- Anular con validaciones de stock ya consumido.

## 9. Pantallas y vistas necesarias
- Detalle OC con estado recepción y facturación por línea.
- Registro recepción con escaneo / cantidades (futuro código barras).

## 10. Reglas de negocio
- **BR-PUR-004**: recepción solo si OC `CONFIRMED+` ([BR-PUR-004]).
- **BR-PUR-005**: recepciones parciales permitidas ([BR-PUR-005]).
- **BR-PUR-006**: tolerancia sobrecantidad configurable ([BR-PUR-006]).

## 11. Validaciones
- Cantidades recepción ≤ pendiente OC ± tolerancia.
- Depósito obligatorio si línea es inventariable.

## 12. Fórmulas relacionadas
- Valor recepción = Σ qty × unit_cost línea; ver [`STOCK_FORMULAS.md`](../04-formulas/STOCK_FORMULAS.md).

## 13. Casos borde
- Servicio sin stock: recepción confirma “hecho” sin movimiento inventario.
- OC en moneda extranjera: FX en factura puede diferir — seguir política multi-moneda.

## 14. Reportes relacionados
- OC pendientes de recepción, recepciones sin factura, matching 3 vías.

## 15. Relación con otros módulos
- **PROCUREMENT**, **INVENTORY**, **EXPENSES_AND_PAYMENTS** (factura).

## 16. Permisos
PROCUREMENT crea; umbral OC superior requiere ADMIN/OWNER ([D-044], [Q-017] cerrada).

## 17. Eventos disparados / consumidos
- `purchase_order.*`, `receipt.confirmed`, `receipt.cancelled`.

## 18. Fase de implementación
**Fase 1**.

## 19. Preguntas abiertas
- Numeración OC por empresa vs proyecto ([Q-002]).
