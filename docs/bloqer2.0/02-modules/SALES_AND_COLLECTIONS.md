# Ventas y cobranzas

## 1. Objetivo
Emitir **facturas de venta** al cliente (desde certificación o venta directa) y registrar **cobranzas parciales/totales** que impactan **Receivable** y **tesorería** ([D-010], [D-018]).

## 2. Usuarios y roles que lo usan
- **SALES**, **FINANCE**, **ADMIN**, **OWNER**, **PM** (consulta cobranzas de su obra).

## 3. Problema que resuelve
Desconexión entre lo certificado/facturado y lo cobrado (avance financiero).

## 4. Datos que consume (inputs)
- **Certification** (opcional) o líneas manuales venta directa.
- **Contact** cliente, **Project** opcional.
- Cuenta destino cobranza.

## 5. Datos que produce (outputs)
- **SalesInvoice** → **Receivable**.
- **Collection** → **AccountMovement INFLOW**.
- Estados factura y saldo ([`STATE_MACHINES.md`](../01-domain/STATE_MACHINES.md)).
- Si la factura referencia **`certification_id`**, actualización del **`payment_status` derivado** de esa certificación vía AR (**sin** `Certification.status = INVOICED` — [BR-CERT-007], [BR-CERT-PAYMENT-001]; eventos en [`EVENTS_AND_AUTOMATIONS.md`](../01-domain/EVENTS_AND_AUTOMATIONS.md) §3.2–3.3b).

## 6. Entidades principales
- **SalesInvoice** (incluye `invoice_letter` A/B/C/E — [D-084]), **Receivable**, **Collection**. `TaxLine` es el modelo conceptual futuro; hoy IVA por línea y percepción IIBB en cabecera ([D-112]).
- Condición IVA del emisor (`Company.iva_condition`) y del cliente (`Contact.iva_condition`) alimentan la sugerencia de letra.

## 7. Estados y transiciones
Ver máquinas SalesInvoice y Receivable.

## 8. Acciones disponibles
- Emitir factura borrador → emitida.
- Registrar cobranzas parciales o totales ([D-010]); cada `Collection` actual se aplica a una `Receivable`.
- Anular factura/cobranza con reversión y motivo para documentos emitidos o cobros confirmados ([BR-AUD-002/003]).

## 9. Pantallas y vistas necesarias
- Facturas pendientes de cobro por cliente/proyecto.
- Registro cobranza con aplicación de montos a facturas.
- Venta directa simplificada (sin certificación).
- **Adjuntos** en el alta (create-then-upload) y en el detalle de factura de venta (`SALES_INVOICE`) — foto/copia del comprobante ([D-052]). Aplica a obra y a ingresos corporativos (`projectId` null; panel en CxC empresa).
- AR corporativo: alta rápida con cobro opcional vía Registrar transacción ([D-051]).

### Ingresos corporativos sin proyecto ([D-037], [D-049], [D-051])

- **Con CxC (D-051):** `SalesInvoice` / `Receivable` / `Collection` admiten **`projectId` null**. Flujo en `/finanzas/transacciones` → “Ingreso / cobro” → **Factura / cuenta por cobrar** (`AR_INCOME`): líneas, vencimiento, N° comprobante externo opcional, cobro opcional. Listado y cobranza en `/finanzas/cuentas-por-cobrar`.
- **Sin CxC ([D-037], [D-049]):** ingresos de estructura que solo mueven caja → **`TREASURY_INFLOW`** (`AccountMovement` `MANUAL_ADJUSTMENT`) con `counterpartyContactId` / `externalInvoiceRef` opcionales. No crea factura ni CxC.
- Emisión legal ARCA desde Bloqer: **fuera de alcance** (puente = `externalInvoiceRef`).

## Clase financiera derivada ([D-102])

Etiqueta de solo lectura. Helper `classifySalesInvoice` / movimientos:

| classCode | Label UI | Hechos |
|---|---|---|
| `SALE_CERT` | Venta — certificación | `projectId` + `certificationId` |
| `SALE_PROJECT` | Venta de obra | `projectId` sin cert (incluye anticipo hoy) |
| `INCOME_CORPORATE` | Ingreso corporativo | sin `projectId` |
| `INCOME_CASH` | Ingreso solo caja | movimiento `INFLOW` + `MANUAL_ADJUSTMENT` |
| `COLLECTION` / `PAYMENT` | Cobranza / Pago | `sourceType` del movimiento |

UI: columna/filtro **Clase** en listados; chip “Se registrará como…” en altas. No confundir con letra A/B/C/E ni con **Tipo de documento** (Factura / Nota de crédito / Nota de débito — [D-115]).

## Tipo de documento ([D-115])

Campo persistido `documentKind` en `SalesInvoice`:

| Valor | UI | Al emitir |
|---|---|---|
| `INVOICE` | Factura | Crea `Receivable` 1:1 |
| `CREDIT_NOTE` | Nota de crédito | Aplica crédito a CxC de la factura referenciada (sin caja) |
| `DEBIT_NOTE` | Nota de débito | Crea `Receivable` nueva; referencia factura origen |

NC/ND exigen factura `ISSUED` del mismo cliente/moneda/alcance. Series de numeración separadas por tipo.

## 10. Reglas de negocio
- Factura de venta **manual de proyecto**: “Emitir y cobrar ahora” opcional ([D-077] / Q-055); visible con `EDIT TREASURY`.
- IVA por línea y percepción IIBB de cabecera, de carga manual ([D-011], [D-112]); el circuito fino de retenciones/`TaxLine` sigue pendiente.
- AR puede existir sin proyecto ([D-009]).
- Letra de comprobante A/B/C/E sugerida y editable; requerida al emitir si operación AR ([D-084]).
- IVA y percepción IIBB no negativos en facturas y notas; cero permitido y sin recálculo de históricos ([D-133]). Un borrador con valores negativos debe corregirse antes de emitir.

> Ver [D-051](../00-product/DECISION_LOG.md), [D-052](../00-product/DECISION_LOG.md), [D-102](../00-product/DECISION_LOG.md).

## 11. Validaciones
- Suma aplicaciones cobranza ≤ saldo factura.
- Factura, deuda y cuenta de cobranza conservan la misma moneda y un ámbito compatible. Para moneda extranjera se requiere FX manual del comprobante y del cobro (ARS por 1 unidad, 6 decimales; D-008); no se habilita una conversión entre cuenta y factura de distinta moneda.
- `invoice_letter` presente al emitir si empresa o cliente tienen `country = AR` ([D-084]).

## 12. Fórmulas relacionadas
- [`TAX_FORMULAS.md`](../04-formulas/TAX_FORMULAS.md), [`CURRENCY_CONVERSION_FORMULAS.md`](../04-formulas/CURRENCY_CONVERSION_FORMULAS.md).

## 13. Casos borde
- **Anticipo / venta rápida de obra:** el flujo actual crea factura, CxC y cobranza con cuenta, fechas y monto; resuelve la letra con los datos fiscales de empresa/cliente y exige FX manual cuando corresponde. No crea una CxC negativa ni aplica una cuenta puente.
- La compensación de un anticipo sin factura mediante una cuenta puente no es un procedimiento operativo habilitado.

## 14. Reportes relacionados
- Aging AR, cobranzas vs certificado, flujo de caja ingresos.

## 15. Relación con otros módulos
- **Certificaciones**, **Tesorería**, **Impuestos**.

## 16. Permisos
SALES emite; FINANCE cobra y anula.

## 17. Eventos disparados / consumidos
- `sales_invoice.*`, `collection.confirmed`, `receivable.*`.

## 18. Fase de implementación
**Fase 1** (+ AR corporativo D-051).

## 19. Preguntas abiertas
- Facturación electrónica AFIP / ARCA (Fase 3).

## Hallazgo — AG-09: circuito actual de cobranza y anticipos

Se reemplazaron las referencias a `INCOME`, aplicaciones múltiples por registro, FX entre monedas y anticipos mediante AR negativa por los contratos implementados: `INFLOW`, una deuda por cobranza, misma moneda y anticipo con factura/CxC/caja. D-077 conserva el cobro inmediato opcional de la factura manual de obra. D-010 sigue habilitando varias cobranzas parciales sobre una deuda; no se promete una aplicación batch inexistente. D-133 explicita el signo de IVA/percepción sin modificar históricos. Los ingresos corporativos se conservan bajo pantallas/vistas para respetar las 19 secciones canónicas del módulo.
