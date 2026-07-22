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
- **Collection** → **AccountMovement INCOME**.
- Estados factura y saldo ([`STATE_MACHINES.md`](../01-domain/STATE_MACHINES.md)).
- Si la factura referencia **`certification_id`**, actualización del **`payment_status` derivado** de esa certificación vía AR (**sin** `Certification.status = INVOICED` — [BR-CERT-007], [BR-CERT-PAYMENT-001]; eventos en [`EVENTS_AND_AUTOMATIONS.md`](../01-domain/EVENTS_AND_AUTOMATIONS.md) §3.2–3.3b).

## 6. Entidades principales
- **SalesInvoice**, **Receivable**, **Collection**, **TaxLine**.

## 7. Estados y transiciones
Ver máquinas SalesInvoice y Receivable.

## 8. Acciones disponibles
- Emitir factura borrador → emitida.
- Registrar cobranza aplicada a una o varias facturas ([D-010]).
- Anular factura/cobranza con reversión ([BR-AUD-002]).

## 9. Pantallas y vistas necesarias
- Facturas pendientes de cobro por cliente/proyecto.
- Registro cobranza con aplicación de montos a facturas.
- Venta directa simplificada (sin certificación).
- **Adjuntos** en detalle de factura de venta (`SALES_INVOICE`) — foto/copia del comprobante ([D-052]).
- AR corporativo: alta rápida con cobro opcional vía Registrar transacción ([D-051]); “Cobrar ahora” inline en facturas de venta **de proyecto** diferido ([Q-055]).

> Ver [D-051](../00-product/DECISION_LOG.md), [D-052](../00-product/DECISION_LOG.md).

## 10. Reglas de negocio
- Retenciones/percepciones manuales por línea ([D-011]).
- AR puede existir sin proyecto ([D-009]).

## 11. Validaciones
- Suma aplicaciones cobranza ≤ saldo factura.
- FX si cobranza en moneda distinta a factura.

## 12. Fórmulas relacionadas
- [`TAX_FORMULAS.md`](../04-formulas/TAX_FORMULAS.md), [`CURRENCY_CONVERSION_FORMULAS.md`](../04-formulas/CURRENCY_CONVERSION_FORMULAS.md).

## 13. Casos borde
- Anticipo sin factura: registrar como ingreso manual + AR negativa o cuenta puente (definir política tenant).

## 14. Reportes relacionados
- Aging AR, cobranzas vs certificado, flujo de caja ingresos.

## 15. Relación con otros módulos
- **Certificaciones**, **Tesorería**, **Impuestos**.

## 16. Permisos
SALES emite; FINANCE cobra y anula.

## 17. Ingresos corporativos sin proyecto ([D-037], [D-049], [D-051])

- **Con CxC (D-051):** `SalesInvoice` / `Receivable` / `Collection` admiten **`projectId` null**. Flujo en `/finanzas/transacciones` → “Ingreso / cobro” → **Factura / cuenta por cobrar** (`AR_INCOME`): líneas, vencimiento, N° comprobante externo opcional, cobro opcional. Listado y cobranza en `/finanzas/cuentas-por-cobrar`.
- **Sin CxC ([D-037], [D-049]):** ingresos de estructura que solo mueven caja → **`TREASURY_INFLOW`** (`AccountMovement` `MANUAL_ADJUSTMENT`) con `counterpartyContactId` / `externalInvoiceRef` opcionales. No crea factura ni CxC.
- Emisión legal ARCA desde Bloqer: **fuera de alcance** (puente = `externalInvoiceRef`).

## 18. Eventos disparados / consumidos
- `sales_invoice.*`, `collection.confirmed`, `receivable.*`.

## 19. Fase de implementación
**Fase 1** (+ AR corporativo D-051).

## 20. Preguntas abiertas
- Facturación electrónica AFIP / ARCA (Fase 3).
