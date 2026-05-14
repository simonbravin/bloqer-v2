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

## 17. Ingresos corporativos sin proyecto ([D-037], Phase 1)

- Mientras `SalesInvoice` / `Receivable` / `Collection` exijan **`projectId`** en schema, los **ingresos de estructura** (sin obra en DB) se reflejan vía **`JournalEntry`** (+ líneas, `projectId` null donde corresponda) y **tesorería** (`AccountMovement` / ingresos no ligados a `Receivable` de obra), con política interna del tenant. **No** se usa `SalesInvoice` “ficticia” para este fin.
- Si el negocio exige **C×C formal sin obra**, reabrir [Q-030](../00-product/OPEN_QUESTIONS.md) con opción **(1)** o **(3)** y migración/ADR.

## 18. Eventos disparados / consumidos
- `sales_invoice.*`, `collection.confirmed`, `receivable.*`.

## 19. Fase de implementación
**Fase 1**.

## 20. Preguntas abiertas
- Facturación electrónica AFIP (Fase 3).
