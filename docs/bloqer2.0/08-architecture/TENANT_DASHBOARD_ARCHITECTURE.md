# Tenant dashboard ejecutivo (Phase 14B + 15C)

## Objetivo

La ruta **`/dashboard`** es el tablero **por tenant** al entrar a Bloqer: KPIs reales, bloques modulares (proyectos, finanzas, inventario, contabilidad), onboarding cuando no hay datos operativos, y accesos rápidos. Toda la agregación vive en **`packages/services`** (`getTenantDashboard`); la página en **`apps/web`** es Server Component, **sin Prisma**, y solo compone componentes bajo `apps/web/features/dashboard/`.

## Servicio

- **Archivo:** `packages/services/src/dashboard/tenant-dashboard.service.ts`
- **Entrada:** `ServiceContext` (misma que el resto de servicios).
- **Una sola carga de módulos:** `getTenantModuleGate(ctx)` al inicio.
- **RBAC:** `can()` de `@bloqer/domain` por sección.
- **Errores:** `ServiceError` con código `FORBIDDEN` en llamadas envueltas (`safeRun`) se traduce en omisión de datos (sin filtrar stack ni exponer detalles extra).

### Phase 15C — extensiones de datos (sin schema nuevo)

| Campo / bloque | Descripción |
|----------------|-------------|
| `subscription` | `saasPlan`, `subscriptionStatus`, `trialEndsAt`, `trialDaysRemaining`, `trialWarning` (avisos de fin de prueba). |
| `projectStatusSlices` | Distribución de cantidad de proyectos por `status` (`groupBy`), solo si `PROJECTS` + `VIEW PROJECTS`. |
| `financeSummary` | Totales C×C/C×P por moneda vía aging (`receivablesOpenByCurrency` / `payablesOpenByCurrency`); conteos vencidas y próximas 14 días; caja por moneda (`getTreasurySummaryByCompany`). **No** se inventan totales multimoneda fusionados. |
| `accountingSummary` | Conteos baratos de `JournalEntry` en `DRAFT` / `POSTED` si `companyId` + módulo `ACCOUNTING` + `VIEW ACCOUNTING`. |
| `inventorySummary` | Incluye `activeWarehousesCount` además de productos activos y stock negativo. |
| `warnings` | Incluye avisos de trial además de otros módulos si aplica. |
| `onboardingSteps` | Pasos guiados según permisos (p. ej. configurar tesorería solo con `EDIT TREASURY`). |

## UI (`apps/web/features/dashboard/`)

| Componente | Rol |
|------------|-----|
| `dashboard-header.tsx` | Nombre tenant, plan / estado / trial, callout de trial, **nav** de accesos rápidos (`dashboardHeaderQuickNav(quickActions)` — solo `href` que ya vinieron autorizados en `quickActions`), botones notificaciones / alertas operativas. |
| `dashboard-alerts-card.tsx` | Lista de `warnings` (p. ej. trial). |
| `dashboard-kpi-grid.tsx` / `dashboard-kpi-card.tsx` | Grilla responsive de KPIs del servicio. |
| `dashboard-status-distribution.tsx` | Barras proporcionales por estado de proyecto (`projectStatusSlices`). |
| `dashboard-finance-overview.tsx` | C×C / C×P / caja por moneda con barras ligeras (`dashboard-money-bars.tsx`), vencidas/próximas, enlaces a aging. |
| `project-progress-card.tsx` (exportado como `DashboardProjectsOverview`) | Proyectos recientes, totales de venta por moneda, enlace a listado. |
| `inventory-summary-card.tsx` | Resumen inventario + depósitos. |
| `dashboard-accounting-card.tsx` | Borradores vs contabilizados. |
| `dashboard-onboarding-checklist.tsx` | Checklist de onboarding cuando `operationalOnboarding` y hay pasos. |
| `quick-actions-card.tsx` (exportado como `DashboardQuickActions`) | Botones de acciones rápidas del servicio. |

**Visuales:** barras con tokens Tailwind (`bg-primary`, `bg-muted`, etc.), sin paleta hardcodeada fuera de tokens; no se usa Recharts en esta pantalla.

## KPIs y secciones (qué alimenta cada cosa)

| Área | Módulo tenant | Permiso típico | Origen de datos |
|------|---------------|----------------|-----------------|
| Proyectos activos/borrador/pausa, lista (5), venta presupuestada por moneda | `PROJECTS`; presupuesto requiere `BUDGETS` | `VIEW PROJECTS`; totales/lista: `VIEW BUDGETS` | `prisma.project` + `prisma.budget` |
| Distribución estados proyecto | `PROJECTS` | `VIEW PROJECTS` | `prisma.project.groupBy` |
| Avance promedio de obra | — | — | **No calculado** (`averageProgressPct: null`); UI: “Sin avance cargado”. |
| Pista control de costos | `PROJECTS` + `BUDGETS` | `VIEW` ambos | Sin agregado global; enlace a proyectos. |
| CxC / CxP abierto por moneda, vencidas, próximas 14 días | `AR` / `AP` | `VIEW AR` / `VIEW AP` | `getReceivableAgingReport` / `getPayableAgingReport` |
| Caja / bancos por moneda | `TREASURY` | `VIEW TREASURY` | `getTreasurySummaryByCompany` |
| Productos, depósitos, stock negativo | `INVENTORY` | `VIEW INVENTORY` | `listProducts`, `listNegativeStockBalancesForTenant`, `warehouse.count` |
| Asientos borrador / contabilizados | `ACCOUNTING` | `VIEW ACCOUNTING` | `prisma.journalEntry.count` (con `companyId`) |
| Notificaciones sin leer | — | — | `getUnreadNotificationCount` |
| Enlace alertas operativas | — | Solo quien puede correr alertas manuales | `canRunOperationalAlerts` |

## Módulo deshabilitado

Si el tenant tiene el módulo apagado en `TenantModuleSetting`, **`getTenantModuleGate`** lo refleja: la sección correspondiente **no se incluye** (ni KPIs ni bloques de detalle ni accesos rápidos que dependan solo de ese módulo). La UI no debe mostrar tarjetas de datos de módulos omitidos.

## Superadmin sin tenant

Si el usuario es superadmin de plataforma **sin** `tenantCtx`, la página **no** llama a `getTenantDashboard`; muestra un mensaje corto y enlace a **`/platform`**. No interfiere con onboarding ni con usuarios con membresía ACTIVE.

## Pendiente (producto / fases futuras)

- Avance de obra real cuando exista una fuente única documentada (certificaciones, WBS, libro de obra) sin duplicar reglas de negocio.
- Agregado global presupuestado vs real en dashboard (hoy solo pista + cost control por proyecto).
- Moneda tenant / FX si el producto define conversión para totales multimoneda.
