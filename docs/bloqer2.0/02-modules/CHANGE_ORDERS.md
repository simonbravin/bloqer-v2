# Órdenes de cambio (Change Orders)

## 1. Objetivo
Registrar **solicitudes y controles operativos** de cambio (alcance, plazo, cantidades, costo estimado) con trazabilidad y aprobación. El CO **no** es el instrumento que modifica por sí solo el **presupuesto `CLOSED`** ni el **contrato/precio vendido**; para eso existe la **Adenda** ([BR-CO-002], [BR-CO-003], [D-005]).

## 2. Usuarios y roles que lo usan
- **PM**, **ADMIN**, **OWNER**, **FINANCE** (impacto económico).

## 3. Problema que resuelve
Cambios de obra frecuentes (replanteos, extras) sin documentarlos generan presupuesto vs real inexplicable.

## 4. Datos que consume (inputs)
- **Project**, **Contract** opcional.
- **CostItem** / WBS afectados.
- Motivo, solicitante, fecha.

## 5. Datos que produce (outputs)
- **ChangeOrder** con líneas de impacto (`amount_delta`, ítems afectados).
- **Vínculo de trazabilidad** hacia **Adenda + Budget complementario** cuando el cambio afecta lo **vendido** contractualmente; **sin** mutación directa del `CLOSED` ni economía de `APPROVED` por el solo hecho del CO.

## 6. Entidades principales
- **ChangeOrder**, líneas de impacto.

## 7. Estados y transiciones
Ver [`STATE_MACHINES.md`](../01-domain/STATE_MACHINES.md) § ChangeOrder.

## 8. Acciones disponibles
- Crear CO en borrador.
- Enviar a aprobación interna / cliente (según política).
- Aprobar / rechazar.
- Marcar **`APPLIED`** (cierre operativo): dispara o documenta el siguiente paso; **impacto en presupuesto contractual** solo vía **Adenda** cuando corresponde ([`ADD_PHASE_OR_ADDENDUM.md`](../05-workflows/ADD_PHASE_OR_ADDENDUM.md)).

## 9. Pantallas y vistas necesarias
- Lista CO por proyecto con estado y monto.
- Detalle CO con comparativa antes/después por ítem.
- Bandeja de aprobación para ADMIN.

## 10. Reglas de negocio
- **BR-CO-002**, **BR-CO-003**: CO **no** sustituye **Adenda** si cambia precio vendido, alcance contractual o WBS contractual cerrada.
- Presupuesto **`CLOSED`** y economía de **`APPROVED`**: ver matriz en [`BUDGETS.md`](./BUDGETS.md) y [`STATE_MACHINES.md`](../01-domain/STATE_MACHINES.md); el CO es input al proceso, no el instrumento contractual.
- Tabla comparativa: [`BUSINESS_RULES.md`](../01-domain/BUSINESS_RULES.md) §17.

## 11. Validaciones
- Montos y cantidades con signo permitido (positivo/negativo).
- Referencia a ítems existentes del presupuesto activo.

## 12. Fórmulas relacionadas
- Recálculo de totales presupuesto: [`../04-formulas/BUDGET_FORMULAS.md`](../04-formulas/BUDGET_FORMULAS.md).

## 13. Casos borde
- CO que reduce alcance (crédito al cliente): documentar y reflejar en certificación siguiente.

## 14. Reportes relacionados
- Cambios de alcance por proyecto, impacto acumulado en margen.

## 15. Relación con otros módulos
- **Presupuestos**, **Contratos**, **Certificaciones**, **RFIs** (origen del cambio).

## 16. Permisos
PM crea; ADMIN/OWNER aprueban según umbral.

## 17. Eventos disparados / consumidos
- `change_order.*` ([`EVENTS_AND_AUTOMATIONS.md`](../01-domain/EVENTS_AND_AUTOMATIONS.md)).

## 18. Fase de implementación
**Fase 1**.

## 19. Preguntas abiertas
- Umbral automático que fuerza adenda vs CO interno.
