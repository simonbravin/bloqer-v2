# Tenant dashboard ejecutivo (Phase 14B)

## Objetivo

La ruta **`/dashboard`** muestra un tablero resumido por tenant: KPIs, proyectos, finanzas (CxC / CxP / tesorería), inventario, accesos rápidos y onboarding operativo cuando no hay datos. Toda la agregación vive en **`packages/services`** (`getTenantDashboard`); la página en **`apps/web`** es Server Component y solo compone la vista.

## Servicio

- **Archivo:** `packages/services/src/dashboard/tenant-dashboard.service.ts`
- **Entrada:** `ServiceContext` (misma que el resto de servicios).
- **Una sola carga de módulos:** `getTenantModuleGate(ctx)` al inicio.
- **RBAC:** `can()` de `@bloqer/domain` por sección.
- **Errores:** `ServiceError` con código `FORBIDDEN` en llamadas envueltas (`safeRun`) se traduce en omisión de datos (sin filtrar stack ni exponer detalles extra).

## KPIs y secciones (qué alimenta cada cosa)

| Área | Módulo tenant | Permiso típico | Origen de datos |
|------|---------------|----------------|-----------------|
| Proyectos activos, lista (5), total presupuestado (venta) | `PROJECTS`; presupuesto requiere `BUDGETS` | `VIEW PROJECTS`; totales/lista presupuesto: `VIEW BUDGETS` | `prisma.project` + `prisma.budget` (última versión `APPROVED`/`CLOSED` por proyecto) |
| Avance promedio de obra | — | — | **No calculado** en 14B (`averageProgressPct: null`); la UI muestra “Sin avance cargado”. |
| Pista control de costos | `PROJECTS` + `BUDGETS` | `VIEW` ambos | Sin agregado global; enlace a proyectos + texto acordado (no duplica lógica pesada de `cost-control.service`). |
| CxC abierto, multimoneda, vencidas (conteo líneas) | `AR` | `VIEW AR` | `getReceivableAgingReport` |
| CxP abierto, multimoneda, vencidas (conteo líneas) | `AP` | `VIEW AP` | `getPayableAgingReport` |
| Caja / bancos por moneda | `TREASURY` | `VIEW TREASURY` | `getTreasurySummaryByCompany` (no mezcla monedas en un solo total; multimoneda → KPI “Multimoneda”) |
| Productos activos, stock negativo | `INVENTORY` | `VIEW INVENTORY` | `listProducts`; `listNegativeStockBalancesForTenant` (best-effort, no tumba el dashboard) |
| Notificaciones sin leer | — | — | `getUnreadNotificationCount` |
| Enlace alertas operativas | — | Solo quien puede correr alertas manuales | `canRunOperationalAlerts` (misma regla que `/notificaciones/alertas`) |

## Módulo deshabilitado

Si el tenant tiene el módulo apagado en `TenantModuleSetting`, **`getTenantModuleGate`** lo refleja: la sección correspondiente **no se incluye** (ni KPIs ni bloques de detalle ni accesos rápidos que dependan solo de ese módulo).

## Superadmin sin tenant

Si el usuario es superadmin de plataforma **sin** `tenantCtx`, la página no llama a `getTenantDashboard`; muestra un mensaje corto y enlace a **`/platform`**. No interfiere con onboarding ni con usuarios con membresía ACTIVE.

## Pendiente (Phase 14C sugerida)

- Avance de obra real cuando exista una fuente única documentada (certificaciones, WBS, libro de obra) sin duplicar reglas de negocio.
- Agregado global presupuestado vs real en dashboard (hoy solo pista + cost control por proyecto).
- Moneda tenant / FX si el producto define conversión para totales multimoneda.
