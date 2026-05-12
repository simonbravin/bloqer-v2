# Contratos y Adendas

## 1. Objetivo
Registrar el **marco legal y económico** del acuerdo con cliente o proveedor/subcontratista: montos, plazos, alcance; y gestionar **adendas** que modifican el contrato sin perder trazabilidad ([D-019]).

## 2. Usuarios y roles que lo usan
- **ADMIN**, **OWNER**, **PM**, **FINANCE**, **PROCUREMENT** (contratos proveedor).

## 3. Problema que resuelve
Las certificaciones y pagos grandes necesitan respaldo contractual explícito; las adendas deben quedar auditadas.

## 4. Datos que consume (inputs)
- **Contact** con rol apropiado.
- **Project** (contrato cliente).
- Documentos PDF firmados ([`DOCUMENTS.md`](./DOCUMENTS.md)).

## 5. Datos que produce (outputs)
- **Contract** con tipo `CLIENT` | `SUPPLIER` | `SUBCONTRACTOR`.
- **Addendum** asociado a contrato con delta de monto y alcance.
- Disparo de nuevos **Budget** o incrementos presupuestarios según workflow.

## 6. Entidades principales
- **Contract**, **Addendum**.

## 7. Estados y transiciones
**Contract:** [`STATE_MACHINES.md`](../01-domain/STATE_MACHINES.md) §4. **Addendum:** §4.2 ([BR-ADD-001]: solo `SIGNED` impacta base contractual).

## 8. Acciones disponibles
- Crear contrato borrador → activar.
- Registrar adenda (nuevo documento + efectos presupuesto).
- Vincular contrato a proyecto y/o subcontrato.

## 9. Pantallas y vistas necesarias
- Lista contratos por contra parte y por proyecto.
- Ficha contrato: datos, adendas en timeline, documentos.
- Wizard “nueva adenda” que propone crear Budget complementario.

## 10. Reglas de negocio
- **Adenda** es el instrumento **contractual/económico** que modifica monto, alcance vendido, condiciones o **WBS contractual**; puede originarse a partir de un **Change Order** aprobado, pero el CO **solo** no alcanza para ese efecto ([BR-CO-002], [BR-CO-003], [D-005]).
- Adenda es el vehículo formal para ampliar alcance cuando obra pública no permite sobrecertificar sin base ([D-004]).
- Contrato cliente suele condicionar forma de certificación y plazos de pago.

### Change Order vs Adenda (resumen)

| | Change Order | Adenda |
|---|---|---|
| Naturaleza | Operativo / solicitud | Contractual / económico |
| Altera `CLOSED` o precio vendido | No por sí solo | Sí (vía budget hijo) |
| Origen | Obra, RFI, cliente, interno | Negociación; puede venir de un CO |

Tabla extendida: [`BUSINESS_RULES.md`](../01-domain/BUSINESS_RULES.md) §17.

## 11. Validaciones
- Fechas `start_date` / `end_date` coherentes.
- Monto contrato ≥ suma presupuestos vinculados o explícita variación.

## 12. Fórmulas relacionadas
_No propias_; impactan totales en [`BUDGET_FORMULAS.md`](../04-formulas/BUDGET_FORMULAS.md).

## 13. Casos borde
- Contrato marco + varias obras: varios `project_id` o contrato padre (definir en [Q-001] grupos).

## 14. Reportes relacionados
- Contratos por vencer, adendas por año.

## 15. Relación con otros módulos
- **Proyectos**, **Presupuestos**, **Certificaciones**, **Subcontratos**.

## 16. Permisos
Solo ADMIN/OWNER activan contratos sensibles; PM puede proponer borradores.

## 17. Eventos disparados / consumidos
- `contract.*`; `addendum.submitted_for_review`, `addendum.approved`, `addendum.signed`, `addendum.cancelled`, etc. ([`EVENTS_AND_AUTOMATIONS.md`](../01-domain/EVENTS_AND_AUTOMATIONS.md) §2.3b; [BR-ADD-001]).

## 18. Fase de implementación
**Fase 1**.

## 19. Preguntas abiertas
- Multi-empresa legal por tenant ([Q-001]).
