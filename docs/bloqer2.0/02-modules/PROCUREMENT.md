# Compras (Procurement) — visión general

> Ver [D-006](../00-product/DECISION_LOG.md#d-006--compras-impacto-al-confirmar-oc-o-al-cargarse-si-no-hay-oc), [D-020](../00-product/DECISION_LOG.md#d-020--oc-recepción-y-factura-como-entidades-separadas), [D-044](../00-product/DECISION_LOG.md#d-044--solicitud-de-compra-cotizaciones-y-flujo-de-oc), [D-050](../00-product/DECISION_LOG.md#d-050--procedimientos-de-oc-wbs-obligatorio-cotizaciones-comparables-notificaciones-y-rechazo).

## 1. Objetivo
Orquestar el **ciclo de compra** desde necesidad hasta pago: **solicitud (opcional según umbral) → cotizaciones → OC → aprobación → confirmación al proveedor → recepción → factura → pago**, con imputación a WBS y control de desvío presupuestario.

## 2. Usuarios y roles que lo usan
- **PROCUREMENT**, **PM** (y capataz vía `PURCHASE_REQUESTS`), **WAREHOUSE**, **FINANCE**, **ADMIN**, **OWNER**.

## 3. Problema que resuelve
Compras informales sin vínculo a partida de obra distorsionan presupuesto vs real, stock y caja comprometida.

## 4. Datos que consume (inputs)
- **Project**, **Supplier** (Contact rol SUPPLIER), **Product** (opcional), **WBS ITEM** obligatorio en líneas de proyecto ([BR-PUR-007]).
- Política por empresa: `CompanyProcurementSettings` (umbrales, cotizaciones mínimas, auto-aprobación, varianza).

## 5. Datos que produce (outputs)
- `PurchaseRequest`, `ProcurementQuote`, `PurchaseOrder`, `Receipt`, factura de proveedor / Payable.
- **Compromiso** (`committed_amount`) al **confirmar** OC ([D-006]); **devengado** al facturar; anti doble conteo ([BR-PUR-003], [BR-COS-002]).
- Movimientos de inventario cuando la recepción es de bien inventariable.

## 6. Entidades principales
- **PurchaseRequest**, **ProcurementQuote**, **PurchaseOrder**, **Receipt**, **PurchaseInvoice** / `SupplierInvoice`, líneas asociadas.
- Detalle: [`PURCHASE_REQUESTS.md`](./PURCHASE_REQUESTS.md), [`PURCHASE_ORDERS_AND_RECEIPTS.md`](./PURCHASE_ORDERS_AND_RECEIPTS.md).

## 7. Estados y transiciones
Ver [`STATE_MACHINES.md`](../01-domain/STATE_MACHINES.md) §7 (PurchaseOrder), §7b (PurchaseRequest) y Receipt.

**Resumen OC:** `DRAFT` → `SUBMITTED` → `APPROVED` → `CONFIRMED` → `PARTIALLY_RECEIVED` / `RECEIVED` | `CANCELLED`.  
Desde `SUBMITTED` se puede **devolver a `DRAFT`** con motivo ([BR-PUR-016]).  
**Aprobar ≠ listo:** el costo se compromete en `CONFIRMED`.

## 8. Acciones disponibles
- Crear **solicitud de compra** (camino formal con cotizaciones) o **OC directa** (si política/umbral lo permiten).
- Cargar y comparar cotizaciones (precio + plazo).
- Enviar / aprobar / rechazar-devolver / confirmar OC.
- Registrar recepciones parciales; cerrar saldo pendiente ([BR-PUR-013]); facturar y pagar.

## 9. Pantallas y vistas necesarias
- `/proyectos/[id]/solicitudes-compra` — SC y cotizaciones.
- `/proyectos/[id]/ordenes-compra` — workflow submit / approve / reject / confirm.
- Comparativa de cotizaciones (precio, plazo, ref. presupuesto).
- Bandeja de OCs pendientes de aprobación / recepción / factura.
- Vista compras del proyecto y desvío vs presupuesto.

## 10. Reglas de negocio
- [BR-COS-001], [BR-COS-002], [BR-PUR-001]–[BR-PUR-016], [BR-APR-004], [BR-APR-005].
- WBS obligatorio; GG de obra vía partida WBS ([D-050]).
- Umbral SC ([BR-PUR-008]); tiers de varianza ([BR-PUR-009]).

## 11. Validaciones
- Proveedor con rol SUPPLIER activo.
- Líneas con WBS del proyecto y presupuesto aprobado/cerrado.
- Periodo abierto para mutaciones con impacto ([BR-PUR-014]).
- Cotizaciones mínimas y vigencia antes de seleccionar ([BR-PUR-010]).

## 12. Fórmulas relacionadas
- Costo real vs presupuesto: [`../04-formulas/COST_FORMULAS.md`](../04-formulas/COST_FORMULAS.md).

## 13. Casos borde
- Compra de emergencia sobre umbral: OWNER/ADMIN + motivo + `allowEmergencyDirectPo`.
- Servicio sin stock: recepción confirma ejecución sin movimiento de inventario.
- Factura sin OC (directa): impacto al cargar factura ([D-006]); gate por umbral ([BR-APR-005]).
- Multi-moneda: FX manual ([D-008]).

## 14. Reportes relacionados
- Gastos por proveedor, desviaciones OC vs presupuesto, OC pendientes de recepción, matching 3 vías.

## 15. Relación con otros módulos
- **Inventario**, **AP/Pagos**, **Presupuesto / WBS**, **Directorio**, **Notificaciones**.

## 16. Permisos
- Solicitudes: `PURCHASE_REQUESTS` (PM/capataz EDIT).
- Cotizaciones / OC: `PURCHASE_ORDERS` / PROCUREMENT.
- Aprobación OC: `APPROVE PURCHASE_ORDERS` (alto nivel: OWNER/ADMIN).
- Pagos: FINANCE.

## 17. Eventos disparados / consumidos
- `purchase_request.*`, `procurement_quote.*`, `purchase_order.*`, `receipt.*`, `purchase_invoice.*` ([`EVENTS_AND_AUTOMATIONS.md`](../01-domain/EVENTS_AND_AUTOMATIONS.md)).
- Notificaciones in-app + email + SLA ([BR-PUR-015], [D-050]).

## 18. Fase de implementación
**Fase 1** (núcleo implementado). Alineación documental [D-050]; pendientes de producto/código: WBS hard-required en UI/validators, lead time en cotización, email automático + SLA, baseline en OC directa, rechazo con motivo, saldo de partida, cierre parcial.

## 19. Preguntas abiertas
- _Ninguna bloqueante para el procedimiento canónico._ Detalle de implementación de SLA (horas exactas) configurable en settings.
