# WBS e ítems de costo (Cómputo)

## 1. Objetivo
Estructurar el presupuesto en **jerarquía WBS** y **ítems hoja** con cantidad, unidad, precio y **análisis de costo** desglosado (materiales, MO, equipos, subcontratos, otros).

## 2. Usuarios y roles que lo usan
- **PM**, **ADMIN**, **OWNER**, **PROCUREMENT** (consulta).

## 3. Problema que resuelve
Sin WBS no hay línea base para certificar ni para imputar compras por ítem.

## 4. Datos que consume (inputs)
- **Budget** cuyo `status` **permite** editar estructura económica (`DRAFT`, o `RETURNED_FOR_CHANGES`; **no** `APPROVED` ni `CLOSED` en lo económico) ([BR-BUD-006], [BR-BUD-002]).
- **Presupuesto base del cronograma** (`Schedule.baselineBudgetId`): la **estructura WBS** queda bloqueada aunque el presupuesto siga en `DRAFT` (sí se pueden editar APU/costos en ítems existentes).
- Catálogos **Unit**, **Category** (rubros), productos inventario opcional.

## 5. Datos que produce (outputs)
- **WbsNode** (árbol).
- **CostItem** por cada ítem certificable.
- **CostAnalysisLine** por cada componente de costo del ítem.

## 6. Entidades principales
- **WbsNode**, **CostItem**, **CostAnalysisLine**.

## 7. Estados y transiciones
Los ítems siguen el estado del Budget padre; no tienen máquina propia salvo líneas internas de borrador. Con `APPROVED`, el WBS económico está **congelado**; con `CLOSED`, los cambios contractuales van por **adenda** y **nuevo** budget complementario.

## 8. Acciones disponibles
- Agregar/editar/reordenar nodos y ítems solo cuando el budget padre lo permite ([`STATE_MACHINES.md`](../01-domain/STATE_MACHINES.md) § Budget).
- Copiar subárbol entre presupuestos (Fase 2).
- Vincular ítem a producto de inventario para consumos posteriores.

## 9. Pantallas y vistas necesarias
- Árbol expandible con totales por nivel.
- Ficha ítem: cómputo, análisis de costos, precio de venta del ítem.
- Vista tabla para edición masiva de cantidades/precios.

## 10. Reglas de negocio
- **BR-WBS-001**: solo **CostItem** (hoja) recibe certificación económica por línea; nodos intermedios agregan ([BR-BUD-005] implícito).
- **BR-WBS-002**: código de ítem único dentro del budget.

## 11. Validaciones
- Cantidades > 0 para ítems activos.
- Unidad obligatoria.
- Análisis de costo: suma componentes = costo total ítem (tolerancia).

## 12. Fórmulas relacionadas
- [`../04-formulas/BUDGET_FORMULAS.md`](../04-formulas/BUDGET_FORMULAS.md), [`COST_FORMULAS.md`](../04-formulas/COST_FORMULAS.md), [`SALE_PRICE_FORMULAS.md`](../04-formulas/SALE_PRICE_FORMULAS.md).

## 13. Casos borde
- Ítem “honorarios profesionales” sin cantidad física: usar unidad `unit` o `global`.
- Ítem eliminado tras certificaciones previas: no borrar; marcar discontinuado con saldo arrastrado.
- **Ítem hoja vs capítulo:** un nodo es **`ITEM`** (lleva APU / `CostItem`) si **no tiene hijos** en su rama; es **`GROUP`** si agrupa hijos. La profundidad del código puede variar: solo `1` sin hijos → APU en `1`; `1` con `1.1`…`1.3` sin nietos → APU en cada hijo; `1.1` con `1.1.1` y `1.1.2` pero `1.2` sin hijos → APU en `1.1.1`, `1.1.2` y en `1.2`.
- **Profundidad máxima de código:** 3 segmentos en perfil simple (`1.1.1`), 4 en multi-rubro (`ARQ.1.1.1`). Los contenedores intermedios solo existen cuando el archivo o el árbol tiene más niveles debajo.
- **Multi-rubro:** rubro raíz (`GROUP`, `ARQ`) → capítulos e ítems bajo `ARQ.1`, `ARQ.1.1`, etc. Se activa si el Excel trae **dos o más** prefijos (ARQ, EST, …) o la misma numeración repetida bajo distintos rubros.
- **Importación CSV/Excel (estructura):** columna A = numeración (`ARQ 1`, `ARQ 1.1`, … o fila banner `ARQ` + nombre en B); B = nombre. No se importa unidad (se carga en el APU). En Excel se lee el **texto formateado** de la celda (p. ej. `11.10`, no el valor numérico `11.1`). Si aún hay duplicados por secuencia (`11.9` → `11.1` → `11.11`), Bloqer sugiere/corrige a `11.10` con advertencia. En multi-rubro los códigos persistidos incluyen el prefijo (`ARQ.1.1.1`). Sin importes ni cantidades económicas en v1 (`quantity = 0` hasta completar cómputo en Bloqer).

## 14. Reportes relacionados
- Presupuesto exportado, materiales por proyecto, presupuesto vs real por ítem.

## 15. Relación con otros módulos
- **Certificaciones** (líneas por CostItem), **Compras** (imputación), **Cronograma** (vínculo opcional).

## 16. Permisos
PM edita estructura si `DRAFT` / `IN_REVIEW` según política; `APPROVED` = sin mutación económica del árbol; `CLOSED` = solo lectura del cómputo vendido salvo nueva versión por adenda.

## 17. Eventos disparados / consumidos
- Hereda eventos de `budget`.

## 18. Fase de implementación
**Fase 1**; cómputo paramétrico avanzado **Fase 2** ([Q-027]).

## 19. Preguntas abiertas
- Cómputo con sub-fórmulas ([Q-027]); vínculo obligatorio WBS-cronograma ([Q-004]).
