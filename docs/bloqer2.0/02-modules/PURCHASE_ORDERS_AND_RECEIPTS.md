# Órdenes de compra y Recepciones

> Ver [D-006](../00-product/DECISION_LOG.md), [D-020](../00-product/DECISION_LOG.md), [D-044](../00-product/DECISION_LOG.md), [D-050](../00-product/DECISION_LOG.md#d-050--procedimientos-de-oc-wbs-obligatorio-cotizaciones-comparables-notificaciones-y-rechazo).

## 1. Objetivo
Formalizar la compra con **OC** como compromiso con el proveedor (tras **confirmación**) y **Recepción** como confirmación física, **separadas de la factura** ([D-020]).

## 2. Usuarios y roles que lo usan
- **PROCUREMENT**, **WAREHOUSE**, **PM**, **ADMIN**, **OWNER**.

## 3. Problema que resuelve
Mezclar OC, recepción y factura genera errores de stock, de compromiso de caja y de control presupuestario.

## 4. Datos que consume (inputs)
- Proveedor, proyecto, líneas con cantidad/precio y **`wbs_node_id` obligatorio** ([BR-PUR-007]).
- Origen opcional: `PurchaseRequest` + cotización seleccionada; o **OC directa** si política/umbral lo permiten ([BR-PUR-008]).
- Depósito destino para recepción física de bienes inventariables.
- Snapshot de costo presupuestario por línea (también en OC directa, [D-050]).

## 5. Datos que produce (outputs)
- **PurchaseOrder** numerada `OC-NNN` **por empresa** ([D-050] / Q-002).
- En `CONFIRMED` aporta a **`committed_amount`**; la factura asociada aporta a **`accrued_amount`** sin duplicar ([BR-COS-002], [D-006]).
- **Receipt** parcial o total → **StockMovement IN** si hay producto ([BR-INV-005]).
- Trazabilidad: SC (si aplica) → cotización → OC → recepción → factura → pago.

## 6. Entidades principales
- **PurchaseOrder**, **PurchaseOrderLine**, **Receipt** / `PurchaseReceipt`, **ReceiptLine**.

## 7. Estados y transiciones
Ver [`STATE_MACHINES.md`](../01-domain/STATE_MACHINES.md) §7.

```
DRAFT → SUBMITTED → APPROVED → CONFIRMED → PARTIALLY_RECEIVED / RECEIVED
              ↘ DRAFT (rechazo con motivo)
```

### Significado de estados clave
| Estado | Significado operativo |
|---|---|
| `DRAFT` | Editable; sin compromiso. |
| `SUBMITTED` | Pendiente de aprobación (alto monto o desvío). |
| `APPROVED` | Autorizada internamente; **aún no** compromete costo; habilita confirmar al proveedor. |
| `CONFIRMED` | Confirmada al proveedor; **sí** compromete costo; habilita recepción y factura. |
| `PARTIALLY_RECEIVED` / `RECEIVED` | Avance físico. |

## 8. Acciones disponibles
- Crear/editar OC borrador (desde SC o directa) → **enviar** → **aprobar** o **rechazar/devolver** → **confirmar al proveedor**.
- Al enviar: calcular tiers de varianza ([BR-PUR-009]); si no hay alto nivel, puede auto-aprobarse en el mismo acto (con segregación [BR-APR-004]).
- Mostrar **costo referencial** y **saldo de partida** al armar/enviar ([BR-PUR-011]).
- Registrar recepción(es) parciales; **cerrar saldo** no recibido ([BR-PUR-013]).
- Anular solo si no hay recepciones confirmadas ni facturas activas.

## 9. Pantallas y vistas necesarias
- Listado y detalle OC con estado de aprobación, recepción y facturación por línea.
- Editor de líneas con WBS, precio, ref. presupuesto, justificación de desvío.
- Registro de recepción; panel “siguiente paso: facturar desde OC”.

## 10. Reglas de negocio
- [BR-PUR-001] compromiso en `CONFIRMED`.
- [BR-PUR-004] recepción solo si OC `CONFIRMED+`.
- [BR-PUR-005] recepciones parciales.
- [BR-PUR-006] tolerancia sobrecantidad.
- [BR-PUR-007] WBS obligatorio.
- [BR-PUR-008]–[BR-PUR-016] (umbrales, varianza, cotizaciones, saldo, matching, cierre, periodo, notificaciones, rechazo).

## 11. Validaciones
- Cantidades recepción ≤ pendiente OC ± tolerancia.
- Depósito obligatorio si línea inventariable.
- Periodo abierto para confirmar OC/recepción/factura con impacto ([BR-PUR-014]).
- Emergencia sobre umbral: motivo + OWNER/ADMIN + flag de settings.

## 12. Fórmulas relacionadas
- Valor recepción = Σ qty × unit_cost línea; [`STOCK_FORMULAS.md`](../04-formulas/STOCK_FORMULAS.md).
- Exposición de costo: [`COST_FORMULAS.md`](../04-formulas/COST_FORMULAS.md).

## 13. Casos borde
- Servicio sin stock: recepción confirma “hecho” sin movimiento inventario.
- OC en moneda extranjera: FX en factura puede diferir — política multi-moneda ([D-008]).
- Matching 3 vías OC ↔ recepción ↔ factura ([BR-PUR-012]).
- Cierre parcial con saldo sin recibir ([BR-PUR-013]).

## 14. Reportes relacionados
- OC pendientes de aprobación / recepción / factura; desvío vs presupuesto; matching 3 vías.

## 15. Relación con otros módulos
- [`PROCUREMENT.md`](./PROCUREMENT.md), [`PURCHASE_REQUESTS.md`](./PURCHASE_REQUESTS.md), Inventario, AP/Pagos, Presupuesto.

## 16. Permisos
- Crear/editar/confirmar: PROCUREMENT, PM (borrador), ADMIN, OWNER.
- Aprobar estándar: PROCUREMENT, ADMIN, OWNER.
- Aprobar alto monto / `EXTRA_APPROVAL`: solo ADMIN u OWNER ([D-044], [Q-017] cerrada).
- Recepción: WAREHOUSE, PROCUREMENT, ADMIN, OWNER.

## 17. Eventos disparados / consumidos
- `purchase_order.submitted` / `approved` / `returned_for_changes` (o equivalente de rechazo) / `confirmed` / `cancelled`
- `receipt.confirmed`, `receipt.cancelled`
- Notificaciones ([BR-PUR-015]).

## 18. Fase de implementación
**Fase 1** (núcleo). Gaps de implementación documentados en [D-050] y [BR-PUR-011]–[BR-PUR-016]: baseline en OC directa, rechazo con motivo, email/SLA, saldo de partida, cierre parcial formal.

## 19. Preguntas abiertas
- _Ninguna bloqueante._ Numeración por empresa cerrada en [D-050] (ex Q-002 para OC/SC/recepciones).
