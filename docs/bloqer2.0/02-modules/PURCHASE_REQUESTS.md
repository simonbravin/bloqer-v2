# Solicitudes de compra y cotizaciones

> Ver [D-044](../00-product/DECISION_LOG.md#d-044--solicitud-de-compra-cotizaciones-y-flujo-de-oc).

## Propósito

Canalizar pedidos de obra (PM / capataz) hacia compras con cotizaciones comparables y aprobación de OC segregada, antes de comprometer costo en proyecto.

## Entidades

| Entidad | Descripción |
|---|---|
| `PurchaseRequest` | Solicitud por proyecto (`SC-NNN`). |
| `PurchaseRequestLine` | Ítems pedidos (WBS opcional, snapshot APU al enviar). |
| `ProcurementQuote` | Cotización de un proveedor sobre una solicitud. |
| `ProcurementQuoteLine` | Precio por línea de solicitud. |
| `CompanyProcurementSettings` | Política 1:1 con `Company` (umbrales, cotizaciones mínimas, auto-aprobación). |

## Estados

### PurchaseRequest

`DRAFT` → `SUBMITTED` → `QUOTE_SELECTED` → `COMPLETED` | `CANCELLED`

### ProcurementQuote

`DRAFT` | `RECEIVED` → `SELECTED` | `REJECTED` | `SUPERSEDED`

### PurchaseOrder (extensión)

`DRAFT` → `SUBMITTED` → `APPROVED` → `CONFIRMED` → `PARTIALLY_RECEIVED` / `RECEIVED`

El costo comprometido (`committed_amount`) se reconoce solo en `CONFIRMED` ([D-006](../00-product/DECISION_LOG.md)).

## Flujo Fase 1

1. PM crea solicitud (`PURCHASE_REQUESTS: EDIT`).
2. Envía solicitud → snapshot de costo unitario presupuestario por WBS.
3. Compras carga ≥ `minQuotesRequired` cotizaciones (`PROCUREMENT` / `PURCHASE_ORDERS`).
4. Selección de cotización → genera OC en `DRAFT` vinculada.
5. Compras envía OC → aprobación (estándar o alto monto / varianza) → confirmación al proveedor.
6. Recepciones y AP solo sobre OC `CONFIRMED+`.

## Reglas de negocio

- [BR-PUR-008] OC directa restringida por `CompanyProcurementSettings` y umbral ARS.
- [BR-PUR-009] Tiers de varianza: `NONE`, `NOTE_REQUIRED`, `EXTRA_APPROVAL`, `UNIT_MISMATCH`, `NO_BUDGET_BASELINE`.
- [BR-APR-004] Segregación: quien solicita no aprueba (salvo `allowSelfApproval` y sin varianza/alto monto).
- [BR-APR-005] Factura directa a obra sobre umbral requiere rol AP aprobador u OC/solicitud completada.

## UI

- `/proyectos/[id]/solicitudes-compra` — listado; filtro `?status=SUBMITTED` (pendientes de cotización)
- `/proyectos/[id]/ordenes-compra` (workflow submit / approve / confirm)
- Resumen del proyecto: contador de solicitudes + alerta si hay enviadas sin cotizar (rol compras)

## Permisos (resumen)

| Acción | Módulo / helper | Roles típicos |
|--------|-----------------|-------------|
| Ver solicitudes | `VIEW PURCHASE_REQUESTS` o `canViewPurchaseRequests` | PM, capataz, compras, depósito (V), finanzas (V) |
| Crear / enviar solicitud | `EDIT PURCHASE_REQUESTS` o `canEditPurchaseRequests` | PM, capataz |
| Cargar cotización / generar OC | `canManageProcurementQuotes` (= editar OC) | Compras, PM (OC borrador) |
| Aprobar OC | `canApprovePurchaseOrders` | Compras, owner/admin — no el solicitante (BR-APR-004) |

Matriz canónica: `PERMISSIONS_MATRIX.md` §2.1; gates en `packages/services/src/procurement/procurement-access.ts`.
