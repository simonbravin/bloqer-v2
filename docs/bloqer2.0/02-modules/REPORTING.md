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
- Query builder ([`QUERY_BUILDER.md`](../06-reports/QUERY_BUILDER.md)).

## 10. Reglas de negocio
- Toggle **Comprometido / Pagado** en presupuesto vs real ([D-021]).
- Datos sensibles filtrados por rol ([D-013]).

## 11. Validaciones
- Rango fechas obligatorio salvo reportes “snapshot actual”.
- Respetar periodo cerrado en drill-down a movimientos.

## 12. Fórmulas relacionadas
- Ver carpeta [`../04-formulas/`](../04-formulas/).

## 13. Casos borde
- Reportes multi-moneda: siempre columna ARS + opcional original.

## 14. Reportes relacionados
Ver [`../06-reports/REPORT_CATALOG.md`](../06-reports/REPORT_CATALOG.md).

## 15. Relación con otros módulos
- Consume **todos** los módulos.

## 16. Permisos
Matriz por tipo reporte ([`PERMISSIONS_MATRIX.md`](../00-product/PERMISSIONS_MATRIX.md)).

## 17. Eventos disparados / consumidos
- `report.generated` (analytics interno).

## 18. Fase de implementación
**Fase 1** núcleo reportes; query builder **Fase 1** mínimo filtros ([Q-010]).

## 19. Preguntas abiertas
- UI query builder ([Q-010]).
