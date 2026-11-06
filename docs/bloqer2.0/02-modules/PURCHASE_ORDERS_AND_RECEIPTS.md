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
- En `CONFIRMED` aporta a **`committed_amount`**; la factura asociada aporta a **`accrued_amount`** sin duplicar ([BR-COS-002], [D-006], [D-065]).
- **Receipt** parcial o total → **StockMovement IN** si hay producto ([BR-INV-005]).
- Trazabilidad: SC (si aplica) → cotización → OC → recepción → factura → pago. Líneas de factura desde OC pueden persistir `SupplierInvoiceLine.purchaseOrderLineId` ([D-066]).
- Matching 3 vías: recepción respeta `overReceiptTolerancePct` (bloqueo); factura vs recibido usa `invoiceMatchTolerancePct` como **aviso** ([D-067]).
- `PurchaseOrderLine.costAnalysisLineId` / `PurchaseRequestLine.costAnalysisLineId` opcionales: hint de insumo APU; imputación de $ sigue en `wbs_node_id` ([D-068] / [D-057]).

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
- **Autorizar y comprometer ([D-105]):** si `CompanyProcurementSettings.allowAuthorizeAndCommit` (default off) y la OC no es de alto nivel, desde `DRAFT`/`SUBMITTED` se puede autorizar y confirmar en un acto (persiste APPROVED+CONFIRMED). Alto nivel sigue sin atajo.
- Al enviar: calcular tiers de varianza ([BR-PUR-009]); si no hay alto nivel, puede auto-aprobarse en el mismo acto (con segregación [BR-APR-004]); **no** auto-confirma.
- Mostrar **costo referencial** y **saldo de partida** al armar/enviar ([BR-PUR-011]).
- Registrar recepción(es) parciales. **Cerrar saldo** no recibido ([BR-PUR-013]) requiere desarrollo separado (D-128); no hay acción disponible ni estado nuevo.
- Anular solo si no hay recepciones confirmadas ni facturas activas.

## 9. Pantallas y vistas necesarias
- Listado y detalle OC con estado de aprobación, recepción y facturación por línea.
- Detalle con orientación de próximo paso y área interviniente según el estado existente, compartida con las OC vinculadas de la SC. Es lectura informativa: no determina permisos/transiciones ni afirma que recibido equivale a pagado.
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
- **Unidad del producto (D-130):** crear/editar una compra con producto exige que la unidad explícita coincida con la del catálogo, sin conversión. Confirmar una recepción vuelve a comprobarla antes de generar stock. Una OC histórica incompatible se conserva consultable; un nuevo ingreso incompatible se rechaza sin efectos parciales y requiere revisar el documento origen, sin editar una OC confirmada para eludir el control. Los replays ya confirmados no repiten efectos.
- Período cerrado: controles D-078 sobre tesorería y asientos; el control transversal de OC/recepción/factura operativa sigue diferido ([BR-PUR-014]).
- Sumar líneas repetidas de una recepción por ítem de OC antes de comprobar tolerancia. Para productos se requiere depósito destino; servicios sin producto no generan stock.
- Alta y modificación, aprobación, recepción y vínculo OC→AP validan empresa/obra y el grafo de padres. Las comprobaciones se repiten dentro de la transacción antes de mutar.
- Emergencia sobre umbral: motivo + OWNER/ADMIN + flag de settings.

## 12. Fórmulas relacionadas
- Valor recepción = Σ qty × unit_cost línea; [`STOCK_FORMULAS.md`](../04-formulas/STOCK_FORMULAS.md).
- Exposición de costo: [`COST_FORMULAS.md`](../04-formulas/COST_FORMULAS.md).

## 13. Casos borde
- Servicio sin stock: recepción confirma “hecho” sin movimiento inventario.
- OC en moneda extranjera: FX en factura puede diferir — política multi-moneda ([D-008]).
- Matching 3 vías OC ↔ recepción ↔ factura ([BR-PUR-012]).
- Panel de facturación: cobertura monetaria neto + IVA, sin IIBB (D-112); pagos son importes efectivos completos. El indicador `allIssuedInvoicesSettled` es derivado, no persistido: requiere facturas emitidas, Payables consistentes en estado PAID y saldo canónico normalizado cero (D-115). Sin facturas/Payable válido no afirma cierre. La nota de crédito puede saldar sin pago de caja; la presentación dice sin saldo pendiente, no pago efectivo.
- Ese indicador financiero incluye obligaciones de ND emitidas vinculadas a la OC o referenciadas a sus facturas; las NC/ND siguen fuera de la cobertura/cantidades de recepción. El indicador derivado `allReceivedAmountIssued` usa solo cobertura emitida: las reservas DRAFT evitan duplicados pero no completan Facturar (D-006/D-108).
- El atajo D-108 usa las cantidades recibidas pendientes comprobables por línea, incluso cuando la diferencia entre importes es cero. Para líneas históricas sin vínculo se conserva el criterio de cobertura monetaria disponible. Si hay una edición guardada en el borrador automático, **Completar factura** permite incorporar las nuevas cantidades manualmente ([D-145](../00-product/DECISION_LOG.md#d-145--protección-de-un-borrador-de-proveedor-editado-al-recibir-otra-entrega)).
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
**Fase 1, núcleo implementado.** Baseline directo, devolución con motivo, email/SLA y saldo están implementados. El cierre parcial formal BR-PUR-013 sigue sin acción/representación física; Q-076 requiere definición de alcance. AG-06 corrige alcance, concurrencia, FX/monedas e integridad de recepciones/facturación. D-127 agrega correlativo a recepciones nuevas: `RC-NNN`, único por tenant y empresa; los históricos conservan UUID y número nulo. Anulación y reintento no reutilizan ni cambian el número.

## Hallazgo — AG-06: numeración, período y estado de implementación

La afirmación de numeración ya cerrada omitía que el schema solo tenía UUID para recepciones. Q-074/D-127 aprueba el campo y la migración aditiva, sin backfill. Se reemplaza la lista obsoleta de gaps por el inventario actual y se armoniza el alcance de períodos con D-078.

## 19. Preguntas abiertas
- Q-075 resuelta en D-129: si cambia el FX al confirmar se renueva la aprobación con actor habilitado y segregación dentro de la misma transacción; si no, OC intacta. Numeración: D-050 para OC/SC y D-127 para recepciones nuevas, con históricos UUID preservados. Cierre parcial formal diferido expresamente por D-128.
