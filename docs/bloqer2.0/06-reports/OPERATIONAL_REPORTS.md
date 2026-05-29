# Reportes operativos

## Objetivo
Soportar decisiones de **obra y compras**: productividad, consumo, proveedores, certificaciones.

## Reportes clave
- Presupuesto vs real ([`R-001`](./REPORT_CATALOG.md)) — hub `/proyectos/[id]/reportes/presupuesto-vs-real`.
- Avance triple dimensión ([`R-002`](./REPORT_CATALOG.md)) — integrado en certificaciones del hub.
- Compras por proveedor / multi-proyecto ([`R-009`](./REPORT_CATALOG.md), [`R-010`](./REPORT_CATALOG.md)); desvíos por partida ([`R-AP-01`](./REPORT_CATALOG.md)…) en *Compras y proveedores*.
- Subcontratos: varianza SUB y evolución certificado/pagado ([`R-SCC-*`](./REPORT_CATALOG.md), [`R-SUB-*`](./REPORT_CATALOG.md)).
- Materiales más caros / por proyecto ([`R-011`](./REPORT_CATALOG.md), [`R-013`](./REPORT_CATALOG.md)).
- Evolución certificaciones ([`R-012`](./REPORT_CATALOG.md)) + estado cartera ([`R-CERT-*`](./REPORT_CATALOG.md)).

**Baseline vs ejecución:** ver [`../08-architecture/REPORTING_ERD_GUARDRAILS.md`](../08-architecture/REPORTING_ERD_GUARDRAILS.md).

## Reglas
- Toggle **comprometido/pagado** en columnas de costo real ([D-021]).
- Siempre permitir filtro por obra.

## Exportación
XLSX preferido para análisis; PDF para reunión de obra.

## Referencias
- [`../04-formulas/COST_FORMULAS.md`](../04-formulas/COST_FORMULAS.md)
