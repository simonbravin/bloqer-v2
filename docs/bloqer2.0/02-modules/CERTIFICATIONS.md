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
- Planilla compacta con una fila por partida, padres EDT desplegables (no medibles), búsqueda por código/nombre y totales/acciones sobre la tabla. La búsqueda conserva los ancestros y abre las coincidencias. El encabezado (período y notas) se edita en diálogo.
- **Medir** propone el avance físico aprobado hasta el fin del período pendiente de certificar. Se muestran anteriores, este certificado, acumulado y saldo. La sugerencia y el importe se pueden revisar y modificar mediante la cantidad; abrir el diálogo no guarda ni incluye una partida. Una medición existente conserva sus valores y su precio de venta snapshot.
- **Compras** y **Recepciones** son alternativas explícitas: porcentaje de costo comprado/recibido sobre costo presupuestado, convertido a cantidad contractual pendiente y valorizado al PU de venta. No se copian costos como ingresos ni se modifica automáticamente el % físico al elegir estas alternativas. Fuente, fecha de corte y ausencia de datos se muestran al usuario. Físico y económico siguen independientes (D-003).
- Recorrido de solo lectura: medir, emitir, aprobar, emitir factura, cobrar. Aprobar no elige caja, banco ni cuenta contable. La factura abre Clientes / Ingresos por obras; la cobranza debita la cuenta de tesorería elegida y acredita Clientes.
- Editor de líneas ya emitidas con columnas: ítem, % periodo, % acumulado, $ periodo, $ acumulado, techo presupuesto; indicador de **`status`** y de **`payment_status`** (derivado, solo lectura en flujo normal).
- Alertas y bloqueo de exceso acumulado de cantidad o físico en cualquier tipo de obra (D-119).
- Histórico por proyecto.

### Referencias UX evaluadas (2026-10-22)

- [Procore: owner invoice](https://support.procore.com/products/online/user-guide/project-level/prime-contracts/tutorials/create-an-owner-invoice): separación de valores anteriores, período y acumulado; sugerencias revisables sobre la planilla contractual.
- [Autodesk Build: payment application variables](https://help.autodesk.com/cloudhelp/ENG/Build-Cost/files/setup-cost/manage-documents-in-cost/variables/Cost_Payment_Application_Variables.html): distinguir monto previo, actual y acumulado en mediciones periódicas.
- [Odoo: analytic accounting](https://www.odoo.com/documentation/19.0/applications/finance/accounting/reporting/analytic_accounting.html): conservar atribución analítica al proyecto aun cuando tesorería sea de la empresa.

Se adoptan esos criterios de presentación y trazabilidad con las entidades y reglas de Bloqer. No se agregan retenciones, valuación automática de acopios ni conversión entre monedas: requieren sus decisiones de producto correspondientes.

## 10. Reglas de negocio
- **BR-CERT-007**: sin estado `INVOICED` en `Certification.status`; facturación = vínculo a `SalesInvoice`/`Receivable` ([`BUSINESS_RULES.md`](../01-domain/BUSINESS_RULES.md)).
- **BR-CERT-PAYMENT-001**: `payment_status` derivado de receivables y cobranzas; no es parte del `status` de ciclo; recálculo vía `receivable.payment_status_recalculated` / `receivable.overdue_detected` según [`EVENTS_AND_AUTOMATIONS.md`](../01-domain/EVENTS_AND_AUTOMATIONS.md).
- **BR-CERT-002**: guardar y emitir bloquean cantidad acumulada superior al presupuesto vigente en **PUBLIC y PRIVATE** ([D-119]).
- **BR-CERT-002b**: guardar y emitir bloquean físico acumulado superior a 100%, sin excepción por nota ([D-119]).
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
