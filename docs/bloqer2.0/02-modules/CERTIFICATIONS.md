# Certificaciones de avance

## 1. Objetivo
Emitir al cliente el documento que reconoce **avance físico** y **avance económico** por ítem del presupuesto, habilitando facturación y generando deuda (`Receivable`) cuando corresponda ([D-003], [D-004]).

## 2. Usuarios y roles que lo usan
- **PM**, **FINANCE**, **ADMIN**, **OWNER**, **SALES** (emisión factura posterior).

## 3. Problema que resuelve
Es el vínculo formal entre obra ejecutada y cobro; sin certificación ordenada no hay control de sobrecertificación ni histórico.

## 4. Datos que consume (inputs)
- **Project** tipo público/privado.
- **Budget** aprobado/cerrado y **CostItem** por línea.
- Periodo certificado (fechas inicio/fin).

## 5. Datos que produce (outputs)
- **Certification** + **CertificationLine** con `% físico` del periodo y `$ económico`.
- `status` documental y **`payment_status` financiero derivado** (AR / cobranzas; [BR-CERT-PAYMENT-001]).
- Eventos hacia facturación y AR (sin estado de ciclo `PAID` en la certificación).
- Acumulados por ítem para validar techos.

## 6. Entidades principales
- **Certification**, **CertificationLine**.

## 7. Estados y transiciones
Ver [`STATE_MACHINES.md`](../01-domain/STATE_MACHINES.md) § Certification.

## 8. Acciones disponibles
- Crear borrador con líneas por ítem.
- Emitir (inmutable respecto de `ISSUED`+).
- Marcar aprobación o rechazo del cliente (`APPROVED` / `REJECTED`).
- **Facturar:** emite **`SalesInvoice`** vinculada; **`Certification.status` no incluye `INVOICED`** ([BR-CERT-007]) — “¿facturada?” = existe factura/AR vinculada; impacto financiero AR + recálculo de `payment_status` (eventos `receivable.payment_status_recalculated` / flujo en [`EVENTS_AND_AUTOMATIONS.md`](../01-domain/EVENTS_AND_AUTOMATIONS.md)).
- Anular con motivo (`CANCELLED`).

## 9. Pantallas y vistas necesarias
- Editor de certificación con columnas: ítem, % periodo, % acumulado, $ periodo, $ acumulado, techo presupuesto; indicador de **`status`** y de **`payment_status`** (derivado, solo lectura en flujo normal).
- Alertas visuales sobrecertificación (privada).
- Histórico por proyecto.

## 10. Reglas de negocio
- **BR-CERT-007**: sin estado `INVOICED` en `Certification.status`; facturación = vínculo a `SalesInvoice`/`Receivable` ([`BUSINESS_RULES.md`](../01-domain/BUSINESS_RULES.md)).
- **BR-CERT-PAYMENT-001**: `payment_status` derivado de receivables y cobranzas; no es parte del `status` de ciclo; recálculo vía `receivable.payment_status_recalculated` / `receivable.overdue_detected` según [`EVENTS_AND_AUTOMATIONS.md`](../01-domain/EVENTS_AND_AUTOMATIONS.md).
- **BR-CERT-002**: obra **PUBLIC** bloquea emitir si supera 100% acumulado por ítem sin adenda ([D-004]).
- **BR-CERT-002b**: obra **PRIVATE** permite superar con **nota obligatoria** + alerta ([D-004]).
- **BR-CERT-003**: físico y económico independientes por línea ([D-003]).

## 11. Validaciones
- Certificación solo si existe budget `APPROVED`/`CLOSED` ([BR-CERT-001]).
- Número correlativo según política ([Q-002]).

## 12. Fórmulas relacionadas
- [`../04-formulas/CERTIFICATION_FORMULAS.md`](../04-formulas/CERTIFICATION_FORMULAS.md), [`PROGRESS_FORMULAS.md`](../04-formulas/PROGRESS_FORMULAS.md).

## 13. Casos borde
- Certificación negativa (descuentos): permitir líneas negativas con autorización.
- Anticipos financieros vs certificación física: documentar en notas.

## 14. Reportes relacionados
- Hub proyecto → **Certificaciones**: R-012 (serie mensual certificado / facturado / cobrado), R-002 (curvas de avance), R-CERT-01/02/03; `payment_status` **derivado** de AR/cobranzas ([BR-CERT-007]); export CSV `certificaciones.csv`.
- Aging AR (R-007) en finanzas / cuentas por cobrar del proyecto.

### Baseline venta vs certificado

La **venta presupuestada** por ítem (`CostItem`) es baseline; el **certificado acumulado** viene de `CertificationLine`. R-CERT-02 compara ambos por partida WBS sin duplicar montos en otra tabla.

## 15. Relación con otros módulos
- **Presupuestos**, **Ventas/Facturación**, **Tesorería/Cobranzas**, **Contratos**.

## 16. Permisos
PM emite; FINANCE factura; ADMIN anula.

## 17. Eventos disparados / consumidos
- `certification.*` ([`EVENTS_AND_AUTOMATIONS.md`](../01-domain/EVENTS_AND_AUTOMATIONS.md)).

## 18. Fase de implementación
**Fase 1**.

## 19. Preguntas abiertas
- Retenciones acumuladas fondo de reparo ([Q-023]).
