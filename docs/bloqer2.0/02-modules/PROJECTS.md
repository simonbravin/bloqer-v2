# Proyectos (Obras)

## 1. Objetivo
Representar cada **obra** como unidad central de negocio: cliente, ubicación, tipo público/privado, fechas, estado operativo, vínculo con presupuesto activo y métricas de avance y rentabilidad.

## 2. Usuarios y roles que lo usan
- **PM**, **ADMIN**, **OWNER**, **FINANCE**, **PROCUREMENT**, **WAREHOUSE**, **SALES**, **VIEWER** (limitado).

## 3. Problema que resuelve
Sin proyecto formal no hay imputación clara de costos ni certificaciones coherentes.

## 4. Datos que consume (inputs)
- Cliente (`Contact` rol CLIENT).
- Ubicación (provincia/ciudad maestro).
- Configuración tenant (numeración, políticas).

## 5. Datos que produce (outputs)
- **Project** con código interno, estado, tipo `PUBLIC` | `PRIVATE`.
- Dashboard por obra: avance físico/económico/financiero, costos comprometidos/pagados.

## 6. Entidades principales
- **Project** — núcleo.

## 7. Estados y transiciones
Ver [`STATE_MACHINES.md`](../01-domain/STATE_MACHINES.md) § Project: `DRAFT` → `ACTIVE` → `ON_HOLD` / `COMPLETED` / `CANCELLED`.

## 8. Acciones disponibles
- Crear/editar proyecto (campos base).
- Activar, pausar, completar, cancelar.
- Asignar equipo / usuarios por proyecto (roles por proyecto).

## 9. Pantallas y vistas necesarias
- Lista de proyectos con filtros estado, cliente, PM.
- Ficha proyecto: resumen, pestañas presupuesto, cronograma, certificaciones, compras, inventario, documentos.
- Selector de proyecto global en cabecera de la app.

## 10. Reglas de negocio
- **BR-PROJ-001**: proyecto tiene siempre `client_id` ([`BUSINESS_RULES.md`](../01-domain/BUSINESS_RULES.md)).
- **BR-PROJ-002**: tipo público/privado inmutable tras primer presupuesto aprobado ([BR-PROJ-002]).
- **BR-PROJ-003**: proyecto `COMPLETED`/`CANCELLED` solo lectura operativa ([BR-PROJ-003]).
- Sobrecertificación depende de `project_type` ([D-004]).

## 11. Validaciones
- `start_date <= end_date` si ambos informados.
- `code` único por tenant.

## 12. Fórmulas relacionadas
- Avance triple dimensión: [`../04-formulas/PROGRESS_FORMULAS.md`](../04-formulas/PROGRESS_FORMULAS.md).
- Rentabilidad obra: [`../04-formulas/PROFITABILITY_FORMULAS.md`](../04-formulas/PROFITABILITY_FORMULAS.md).

## 13. Casos borde
- Obra sin fecha fin (activa indefinida): permitir `end_date` null.
- Cambio de cliente en obra en curso: proceso excepcional con auditoría y contrato actualizado.

## 14. Reportes relacionados
- Rentabilidad por proyecto, presupuesto vs real, avance vs costo, materiales por proyecto ([`../06-reports/OPERATIONAL_REPORTS.md`](../06-reports/OPERATIONAL_REPORTS.md)).

## 15. Relación con otros módulos
- **Presupuestos**, **Cronograma**, **Contratos**, **Certificaciones**, **Compras**, **Inventario**, **Tesorería** (imputación).

## 16. Permisos
Ver [`PERMISSIONS_MATRIX.md`](../00-product/PERMISSIONS_MATRIX.md); PM edita solo proyectos asignados.

## 17. Eventos disparados / consumidos
- `project.*` ([`EVENTS_AND_AUTOMATIONS.md`](../01-domain/EVENTS_AND_AUTOMATIONS.md)).

## 18. Fase de implementación
**Fase 1**.

## 19. Preguntas abiertas
- Multi-proyecto bajo mismo contrato marco ([`OPEN_QUESTIONS.md`](../00-product/OPEN_QUESTIONS.md)).
