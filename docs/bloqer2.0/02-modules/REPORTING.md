# Reportes — marco general

## 1. Objetivo
Definir el **marco transversal** de reporting en Bloqer: filtros estándar (fecha, proyecto, moneda), exportaciones XLSX/PDF, paquetes por audiencia (operativo vs financiero), y **query builder** ([`PRODUCT_SCOPE.md`](../00-product/PRODUCT_SCOPE.md)).

## 2. Usuarios y roles que lo usan
Todos según permiso; rentabilidad neta restringida ([D-013]).

## 3. Problema que resuelve
Fragmentación de Excel externos y métricas inconsistentes entre módulos.

## 4. Datos que consume (inputs)
- Todas las entidades operativas y financieras consolidadas en ARS para tableros globales.

## 5. Datos que produce (outputs)
- Reportes predefinidos ([`../06-reports/REPORT_CATALOG.md`](../06-reports/REPORT_CATALOG.md)).
- Exportaciones y dashboards ([`EXECUTIVE_DASHBOARD.md`](../06-reports/EXECUTIVE_DASHBOARD.md)).

## 6. Entidades principales
_No persistidas específicas_; pueden existir `SavedReport` en Fase 2.

## 7. Estados y transiciones
_No aplica._

## 8. Acciones disponibles
- Ejecutar reporte con parámetros.
- Exportar.
- Guardar favoritos / programar envío email (Fase 2).

## 9. Pantallas y vistas necesarias
- Biblioteca de reportes por categoría.
- **Avances del proyecto** (`/proyectos/[id]/reportes/avances`, R-002 / D-120): indicadores, plan y ejecución registrada, certificado, consumo del presupuesto de costo, cobranza, cobertura y pendientes con evidencia. Exportar CSV/Excel/PDF, enviar por email y programar mediante el registro existente.
- **Proveedores de la obra** (`/proyectos/[id]/reportes/proveedores`, R-AP-03): líderes y tabla.
- Query builder ([`QUERY_BUILDER.md`](../06-reports/QUERY_BUILDER.md)).

## 10. Reglas de negocio
- Toggle **Comprometido / Pagado** en presupuesto vs real ([D-021]).
- Datos sensibles filtrados por rol ([D-013]).
- R-003: margen por presupuesto. La base Facturado utiliza el subtotal neto de facturas emitidas de sus certificaciones, con notas emitidas vinculadas a su factura origen (D-141). Las ventas directas se consultan desde la facturación de obra.
- R-012: la serie mensual usa fin del período del certificado, emisión de factura y fecha de cobranza. Los importes de facturación y cobranza requieren acceso al módulo AR. Una NC aplicada se refleja en el saldo sin crear una cobranza.
- EDT y costos y varianza de recursos: base en moneda original del presupuesto y error funcional ante fuente contribuyente incompatible (D-122), sin convertir ni omitir silenciosamente. Costo/varianza basados en consumo desconocido y sus totales afectados quedan no calculables (D-124), con la misma advertencia en UI/CSV/PDF; exposición documental y cantidades se conservan.
- R-002: físico por libro ponderado por costo directo presupuestado de partidas hoja del alcance vigente (principal y adendas APPROVED/CLOSED); avance observado y cobertura explícitos. Fuentes ambiguas o faltantes no equivalen a cero validado; plan comparable con igual alcance/pesos. Corte de ejecución y estado actual identificados. Ver D-120 y `PROGRESS_FORMULAS.md`.

## 11. Validaciones
- Rango fechas obligatorio salvo reportes “snapshot actual”.
- Respetar periodo cerrado en drill-down a movimientos.

## 12. Fórmulas relacionadas
- Ver carpeta [`../04-formulas/`](../04-formulas/).

## 13. Casos borde
- Reportes multi-moneda: identificar la moneda original y conservar subtotales separados. Una base consolidada en ARS requiere los datos y reglas de conversión de su reporte (D-008). Una moneda incompatible o una fuente ausente se señala antes de mostrar un total comparable.

## 14. Reportes relacionados
Ver [`../06-reports/REPORT_CATALOG.md`](../06-reports/REPORT_CATALOG.md).

## 15. Relación con otros módulos
- Consume **todos** los módulos.

## 16. Permisos
Matriz por tipo reporte ([`PERMISSIONS_MATRIX.md`](../00-product/PERMISSIONS_MATRIX.md)).

D-140: la entrega programada reutiliza el alcance de la configuración, la sesión cuando corresponde y el acceso vigente del destinatario. El envío manual desde el reporte requiere permiso de exportación y admite una dirección elegida.

## 17. Eventos disparados / consumidos
- `report.generated` (analytics interno).

## 18. Fase de implementación
**Fase 1** núcleo reportes; query builder **Fase 1** mínimo filtros ([Q-010]).

## 19. Preguntas abiertas
- UI query builder ([Q-010]).
