# Solicitudes de compra y cotizaciones

> Ver [D-044](../00-product/DECISION_LOG.md#d-044--solicitud-de-compra-cotizaciones-y-flujo-de-oc), [D-050](../00-product/DECISION_LOG.md#d-050--procedimientos-de-oc-wbs-obligatorio-cotizaciones-comparables-notificaciones-y-rechazo).

## 1. Objetivo
Canalizar pedidos de obra (PM / capataz) hacia compras con **cotizaciones comparables** (precio y plazo) y aprobación de OC segregada, **antes** de comprometer costo en proyecto.

## 2. Usuarios y roles que lo usan
- **PM / capataz:** crean y envían solicitudes (`EDIT PURCHASE_REQUESTS`).
- **PROCUREMENT:** cargan cotizaciones, seleccionan proveedor, generan y operan la OC.
- **OWNER / ADMIN:** aprueban OC de alto monto o desvío; emergencia sobre umbral.

## 3. Problema que resuelve
Pedidos informales sin comparación de ofertas ni vínculo a partida presupuestada.

## 4. Datos que consume (inputs)
- Proyecto, líneas con **WBS ITEM obligatorio** ([BR-PUR-007]), cantidad, unidad, descripción.
- Proveedores (Contact rol SUPPLIER) para cotizaciones.
- `CompanyProcurementSettings` (`minQuotesRequired`, `maxQuotesAllowed`, umbrales).

## 5. Datos que produce (outputs)
- `PurchaseRequest` numerada `SC-NNN` (por empresa).
- `ProcurementQuote` / líneas con precio, impuestos, **plazo de entrega**, vigencia.
- OC en `DRAFT` al seleccionar cotización; SC `COMPLETED` al confirmar esa OC.

## 6. Entidades principales

| Entidad | Descripción |
|---|---|
| `PurchaseRequest` | Solicitud por proyecto (`SC-NNN`). |
| `PurchaseRequestLine` | Ítems pedidos (**WBS obligatorio**); snapshot APU al enviar. |
| `ProcurementQuote` | Cotización de un proveedor sobre una solicitud. |
| `ProcurementQuoteLine` | Precio por línea de solicitud. |
| `CompanyProcurementSettings` | Política 1:1 con `Company`. |

## 7. Estados y transiciones
Ver [`STATE_MACHINES.md`](../01-domain/STATE_MACHINES.md) §7b.

`DRAFT` → `SUBMITTED` → `QUOTE_SELECTED` → `COMPLETED` | `CANCELLED`

### ProcurementQuote
`DRAFT` | `RECEIVED` → `SELECTED` | `REJECTED` | `SUPERSEDED`

## 8. Acciones disponibles
1. Crear / editar SC en borrador (todas las líneas con WBS).
2. **Enviar** → snapshot de costo unitario presupuestario + cantidad; notifica a Compras ([BR-PUR-015]).
3. Cargar ≥ `minQuotesRequired` cotizaciones (precio por línea + **plazo de entrega** + `validUntil`).
4. **Comparar** cotizaciones (total, desglose, plazo, ref. presupuesto / saldo de partida).
5. Seleccionar cotización → genera OC `DRAFT` vinculada (una OC activa por SC en Fase 1).
6. Seguir workflow de OC (enviar → aprobar o devolver → confirmar).

## 9. Pantallas y vistas necesarias
- `/proyectos/[id]/solicitudes-compra` — listado; filtro pendientes de cotización.
- Detalle SC: líneas con **costo referencial** y WBS; tabla comparativa de cotizaciones; adjuntos.
- Resumen del proyecto: contador de SC + alerta si hay enviadas sin cotizar.

## 10. Reglas de negocio
- [BR-PUR-007] WBS obligatorio; GG de obra = partida WBS, no línea sin imputación.
- [BR-PUR-008] OC directa restringida por umbral / política.
- [BR-PUR-009] Tiers de varianza (aplican al enviar la OC generada).
- [BR-PUR-010] Cotizaciones mínimas + vigencia + plazo comparable.
- [BR-PUR-011] Costo referencial y saldo de partida visibles.
- [BR-APR-004] Segregación: quien solicita no aprueba (salvo excepción de settings).
- [BR-APR-005] Factura directa a obra sobre umbral.

## 11. Validaciones
- Cada línea: `wbs_node_id` de ítem del presupuesto APPROVED/CLOSED del proyecto.
- Cotización debe cubrir **todas** las líneas de la SC; un proveedor activo por cotización activa.
- No seleccionar cotización vencida ni por debajo del mínimo de cotizaciones recibidas.

## 12. Fórmulas relacionadas
- Baseline material / unitario: APU del `CostItem` del WBS; ver [`COST_FORMULAS.md`](../04-formulas/COST_FORMULAS.md).

## 13. Casos borde
- Anular SC con OC `DRAFT`: se puede; con OC activa no-DRAFT: bloqueado.
- Anular OC `DRAFT` vinculada: SC vuelve a `SUBMITTED` y cotización seleccionada vuelve a `RECEIVED`.
- Sin baseline APU en la partida: al enviar la OC → `NO_BUDGET_BASELINE` + justificación ([BR-PUR-009]).

## 14. Reportes relacionados
- SC pendientes de cotización; tiempo promedio SC → OC confirmada; desvío cotización vs presupuesto.

## 15. Relación con otros módulos
- [`PROCUREMENT.md`](./PROCUREMENT.md), [`PURCHASE_ORDERS_AND_RECEIPTS.md`](./PURCHASE_ORDERS_AND_RECEIPTS.md), WBS/Presupuesto, Notificaciones.

## 16. Permisos (resumen)

| Acción | Módulo / helper | Roles típicos |
|--------|-----------------|-------------|
| Ver solicitudes | `VIEW PURCHASE_REQUESTS` | PM, capataz, compras, depósito (V), finanzas (V) |
| Crear / enviar solicitud | `EDIT PURCHASE_REQUESTS` | PM, capataz |
| Cargar cotización / generar OC | `canManageProcurementQuotes` (= editar OC) | Compras, PM (OC borrador) |
| Aprobar OC | `canApprovePurchaseOrders` | Compras, owner/admin — no el solicitante (BR-APR-004) |

Matriz canónica: [`PERMISSIONS_MATRIX.md`](../00-product/PERMISSIONS_MATRIX.md).

## 17. Eventos / notificaciones
- `purchase_request.created` / `submitted` / `cancelled`
- `procurement_quote.received` / `selected`
- Notificar Compras al enviar SC; notificar solicitante cuando hay cotización seleccionada / OC confirmada o rechazada ([BR-PUR-015], [D-050]).

## 18. Fase de implementación
**Fase 1** (núcleo). Pendiente de implementación respecto a [D-050]: WBS hard-required, lead time en cotización, UI de costo referencial / saldo, email + SLA.

## 19. Preguntas abiertas
- SLA exacto (horas) por defecto en settings — sugerido 48–72 h; no bloquea el procedimiento.
