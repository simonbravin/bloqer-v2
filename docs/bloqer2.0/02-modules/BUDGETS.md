# Presupuestos

## 1. Objetivo
Definir el **plan económico** de la obra: versiones, totales de costo y venta, parámetros de overhead/utilidad/impuestos, y la **única versión activa** más **fases/adendas** que complementan el presupuesto inicial sin reemplazarlo ([D-002], [D-005]).

## 2. Usuarios y roles que lo usan
- **PM**, **ADMIN**, **OWNER**, **FINANCE** (lectura), **PROCUREMENT** (lectura selectiva).

## 3. Problema que resuelve
Costos desordenados y sin base para certificar, comprar o medir rentabilidad.

## 4. Datos que consume (inputs)
- **Project**, **Contract** (opcional).
- Catálogos unidades, monedas, categorías WBS.
- Política de empresa (margen típico, GG).

## 5. Datos que produce (outputs)
- **Budget** por versión con totales `total_cost`, `total_sale_price`.
- Relación `parent_budget_id` para adendas/fases complementarias.
- Estados de ciclo de vida (`DRAFT` … `CLOSED`).

## 6. Entidades principales
- **Budget**, **BudgetSettings**, vínculo a **WBS** (nodos e ítems en [`WBS_AND_COST_ITEMS.md`](./WBS_AND_COST_ITEMS.md)).

## 7. Estados y transiciones
Ver [`STATE_MACHINES.md`](../01-domain/STATE_MACHINES.md) § Budget (diagrama + **tabla estado vs ediciones**).

### Tabla — `Budget.status` vs ediciones permitidas

| Estado | ¿Aprobado? | Estructura económica (montos, WBS, PU, margen, impuestos, fórmulas) | Metadata / revisión |
|---|---|---|---|
| `DRAFT` | No | Editable completa | Sí |
| `IN_REVIEW` | No | **Bloqueada** — solo comentarios/adjuntos de **revisión** y metadata no económica acotada ([BR-BUD-007]) | Notas de revisión |
| `RETURNED_FOR_CHANGES` | No | **Editable** de nuevo; luego **`IN_REVIEW`** obligatorio antes de aprobar | Sí |
| `APPROVED` | Sí (interno) | **Bloqueada** | **Sí** ([BR-BUD-006]) |
| `CLOSED` | Sí (base contractual) | **Sin edición**; cambios vendidos vía **Adenda** + budget hijo | **Solo** whitelist [BR-BUD-008]: `internal_notes`, `attachments`, `tags`, `display_order`, `non_contractual_reference_code`, `assigned_internal_responsible` |

Detalle normativo: [BR-BUD-006], [BR-BUD-007], [BR-BUD-008], [BR-BUD-002], [D-005], [D-030].

### Tabla — Change Order vs Addendum / Adenda

| | Change Order | Addendum / Adenda |
|---|---|---|
| Rol | Control **operativo** del cambio | Instrumento **contractual/económico** |
| ¿Modifica `CLOSED` o precio vendido solo? | **No** | **Sí** (con budget complementario) |
| Origen | Obra, cliente, RFI, interno | Contractual; puede partir de un CO aprobado |

Regla fuerte: precio vendido / alcance contractual / WBS contractual cerrada ⇒ **Adenda** ([BR-CO-003]).

## 8. Acciones disponibles
- Crear presupuesto borrador.
- Enviar a revisión (`IN_REVIEW`), **devolver para cambios** (`RETURNED_FOR_CHANGES`, evento `budget.returned_for_changes`), reenviar a revisión, aprobar (`APPROVED`), cerrar (`CLOSED`).
- Editar metadata en `APPROVED` / `CLOSED` según [BR-BUD-006] y whitelist [BR-BUD-008].
- Crear **adenda** como nuevo Budget hijo que complementa ([D-005]); un **Change Order** puede precederla pero no la reemplaza ([BR-CO-002]).
- Copiar desde presupuesto anterior / plantilla ([Q-026]).

## 9. Pantallas y vistas necesarias
- Lista versiones por proyecto con indicador “activo”.
- Editor de presupuesto (árbol WBS + panel de totales) con modo restringido según `status`.
- Comparativa entre versiones (Fase 2).

## 10. Reglas de negocio
- **BR-BUD-001**: una sola versión **activa** por proyecto; adendas suman ([D-002], [BR-BUD-003]).
- **BR-BUD-002**: `CLOSED` no editable en lo vendido; vía adenda ([D-005]).
- **BR-BUD-006**: `APPROVED` bloquea economía; permite metadata ([D-005]).
- **BR-BUD-007**: `IN_REVIEW` no es aprobado; sin cambios estructurales.
- **BR-BUD-008**: `CLOSED` — solo metadata whitelist ([D-030]).
- **BR-BUD-005**: no aprobar sin análisis de costo por ítem ([BR-BUD-005]).
- **BR-CO-003**: CO solo no alcanza para cambiar base contractual.

## 11. Validaciones
- Moneda del budget coherente con proyecto o explicitada.
- Totales = suma de ítems (tolerancia redondeo documentada).

## 12. Fórmulas relacionadas
- [`../04-formulas/BUDGET_FORMULAS.md`](../04-formulas/BUDGET_FORMULAS.md), [`SALE_PRICE_FORMULAS.md`](../04-formulas/SALE_PRICE_FORMULAS.md), [`COST_FORMULAS.md`](../04-formulas/COST_FORMULAS.md).

## 13. Casos borde
- Re-presupuesto total: nueva versión que **supersedes** la anterior con trazabilidad.
- Obra en USD presupuestada en USD: FX en movimientos reales separado ([D-008]).

## 14. Reportes relacionados
- Presupuesto vs real, rentabilidad, exportación presupuesto ([`../06-reports/`](../06-reports/)).

## 15. Relación con otros módulos
- **Contratos/Adendas**, **Certificaciones**, **Compras**, **Change orders**.

## 16. Permisos
PM edita borrador y envía a revisión; solo ADMIN/OWNER aprueban/cierren (configurable). Metadata en `APPROVED` según permisos.

## 17. Eventos disparados / consumidos
- `budget.submitted_for_review`, `budget.returned_for_changes`, `budget.approved`, `budget.closed`, `budget.addendum_added`.

## 18. Fase de implementación
**Fase 1**.

## 19. Preguntas abiertas
- Plantillas reutilizables ([Q-026]); costo financiero tasa ([Q-011]).
