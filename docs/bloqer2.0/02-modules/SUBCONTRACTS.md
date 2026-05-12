# Subcontratos

## 1. Objetivo
Gestionar contratos de **ejecución parcial de obra** con subcontratistas: alcance, montos, certificaciones de avance del subcontrato, retenciones y generación de **cuentas por pagar** ([D-015]).

## 2. Usuarios y roles que lo usan
- **PM**, **PROCUREMENT**, **FINANCE**, **ADMIN**, **OWNER**.

## 3. Problema que resuelve
Confundir subcontrato con OC de materiales o con empleado informal.

## 4. Datos que consume (inputs)
- **Contact** rol SUBCONTRACTOR.
- **Project**, **Contract** opcional.
- Ítems WBS o paquetes de trabajo propios del subcontrato.

## 5. Datos que produce (outputs)
- **Subcontract** en **`ACTIVE`**: compromiso firme para **`committed_amount`** (capa reporting; ver [`COST_FORMULAS.md`](../04-formulas/COST_FORMULAS.md) §1.1).
- **SubcontractCertification** + **Payable**: capa **`accrued_amount`** al reconocer obligación ([BR-SUB-003]).
- Pagos parciales → **`paid_amount`** (caja) vía módulo pagos.

## 6. Entidades principales
- **Subcontract**, **SubcontractCertification**, líneas.

## 7. Estados y transiciones
Ver [`STATE_MACHINES.md`](../01-domain/STATE_MACHINES.md) § Subcontract y SubcontractCertification.

## 8. Acciones disponibles
- Crear borrador de subcontrato → activar.
- Certificar avance: `SubcontractCertification` `DRAFT` → `SUBMITTED` → `APPROVED` / `REJECTED` (ver [`STATE_MACHINES.md`](../01-domain/STATE_MACHINES.md) §19).
- Obligación interna típica al **`APPROVED`** vía `Payable` ([BR-SUB-003]).
- Registrar retenciones manuales en pago.

## 9. Pantallas y vistas necesarias
- Lista subcontratos por proyecto.
- Certificación subcontrato similar UI a certificación cliente (simplificada).
- Estado de avance vs contrato.

## 10. Reglas de negocio
- **BR-SUB-003**: AP **solo** al certificar **`APPROVED`**; sin política configurable ISSUED/APPROVED ([BR-SUB-003], [D-028]).
- **BR-SUB-004**: liquidación hacia subcontrato = **`settlement_status`** derivado (AP/pagos), no `payment_status` de cliente ([BR-SUB-004], [D-027]).
- **BR-SUB-005**: **`REJECTED`** terminal; corrección = **nuevo** certificado con `replaces_certification_id` al rechazado ([BR-SUB-005], [D-033]).
- Imputación siempre a proyecto ([BR-SUB-001]).

## 11. Validaciones
- Montos certificados acumulados ≤ monto contrato ± CO/adenda.

## 12. Fórmulas relacionadas
- [`CERTIFICATION_FORMULAS.md`](../04-formulas/CERTIFICATION_FORMULAS.md) (adaptación), [`TAX_FORMULAS.md`](../04-formulas/TAX_FORMULAS.md) retenciones.

## 13. Casos borde
- Subcontrato en moneda USD con obra en ARS: FX por certificación/pago.

## 14. Reportes relacionados
- Pagos a subcontratistas, retenciones, comparativo contratado vs ejecutado.

## 15. Relación con otros módulos
- **Directorio**, **Proyectos**, **Pagos**, **Impuestos**.

## 16. Permisos
PM opera; FINANCE pagos; ADMIN override.

## 17. Eventos disparados / consumidos
- `subcontract_certification.*`; pagos vía `payment.*` / `payable.*`.

## 18. Fase de implementación
**Fase 1**.

## 19. Preguntas abiertas
- Modelo certificación por ítem vs hitos ([Q-012]).
