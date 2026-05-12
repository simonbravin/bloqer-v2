# Compras (Procurement) — visión general

## 1. Objetivo
Orquestar el **ciclo de compra** desde necesidad hasta pago: OC opcional, recepción, factura de compra e imputación a proyecto/WBS, respetando impacto en costo según política ([D-006]).

## 2. Usuarios y roles que lo usan
- **PROCUREMENT**, **PM**, **WAREHOUSE**, **FINANCE**, **ADMIN**.

## 3. Problema que resuelve
Compras informales sin vínculo a obra distorsionan presupuesto vs real y stock.

## 4. Datos que consume (inputs)
- **Project**, **Supplier**, **Product** (opcional), **Budget/CostItem** para imputación.
- Política OC obligatoria por categoría (config tenant Fase 2).

## 5. Datos que produce (outputs)
- Órdenes de compra, recepciones, facturas de compra ([`PURCHASE_ORDERS_AND_RECEIPTS.md`](./PURCHASE_ORDERS_AND_RECEIPTS.md)).
- Movimientos de inventario cuando aplica.
- **Payables** (capa **devengada**) y **compromiso** (`committed_amount` en OC `APPROVED`/`CONFIRMED`) con **anti doble conteo** vs factura con `po_id` ([BR-PUR-003], [BR-COS-002], [`COST_FORMULAS.md`](../04-formulas/COST_FORMULAS.md)).

## 6. Entidades principales
- **PurchaseOrder**, **Receipt**, **PurchaseInvoice**, líneas asociadas.

## 7. Estados y transiciones
Ver máquinas en [`STATE_MACHINES.md`](../01-domain/STATE_MACHINES.md) para cada documento.

## 8. Acciones disponibles
- Crear OC o cargar **factura directa** sin OC.
- Confirmar OC → impacto comprometido ([D-006]).
- Registrar recepción y factura proveedor.
- Anular con reversión de efectos.

## 9. Pantallas y vistas necesarias
- Bandeja de OCs pendientes de recepción / factura.
- Vista “compras del proyecto” consolidada.
- Comparativa OC vs factura (tolerancia).

## 10. Reglas de negocio
- **BR-COS-001**, **BR-COS-002**: definición de capas comprometido/devengado/pagado y fórmula de exposición esperada.
- **BR-PUR-001**: OC confirmada impacta costo comprometido ([D-006]).
- **BR-PUR-002**: factura directa impacta al registrar factura ([D-006]).
- **BR-PUR-003**: evitar doble conteo OC + factura ([BR-PUR-003]).
- **BR-PUR-007**: imputación proyecto o gasto general ([BR-PUR-007]).

## 11. Validaciones
- Proveedor con rol SUPPLIER (o alta rápida).
- Periodo abierto para movimientos que afecten periodo cerrado ([BR-TRZ-003]).

## 12. Fórmulas relacionadas
- Costo real vs presupuesto: [`../04-formulas/COST_FORMULAS.md`](../04-formulas/COST_FORMULAS.md).

## 13. Casos borde
- Compra multi-proyecto: prorrateo de líneas.
- Factura en moneda extranjera: FX manual ([D-008]).

## 14. Reportes relacionados
- Gastos por proveedor, compras multi-proyecto, inventario entrante.

## 15. Relación con otros módulos
- **Inventario**, **AP/Pagos**, **Presupuesto**, **Directorio**.

## 16. Permisos
PROCUREMENT opera; FINANCE aprueba pagos.

## 17. Eventos disparados / consumidos
- `purchase_order.*`, `receipt.*`, `purchase_invoice.*` ([`EVENTS_AND_AUTOMATIONS.md`](../01-domain/EVENTS_AND_AUTOMATIONS.md)).

## 18. Fase de implementación
**Fase 1**.

## 19. Preguntas abiertas
- OC obligatoria por categoría de ítem ([Q-017] umbrales).
