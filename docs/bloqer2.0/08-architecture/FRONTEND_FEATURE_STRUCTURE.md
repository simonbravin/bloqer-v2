# Frontend feature structure — Bloqer 2.0

## Decisión

Organizar UI por **`features/<module>/`** dentro de `apps/web`, alineado a módulos de negocio. Separar **página** (composición, data loading server-first) de **componentes** reutilizables.

## Estructura sugerida

```
apps/web/features/<module>/
  components/           # UI pura; recibe datos ya resueltos o server props
  forms/                # formularios; Zod client opcional = mismo schema que server
  tables/               # TanStack Table wrappers
  hooks/                # hooks de UI (no negocio financiero autoritativo)
  index.ts              # exports públicos del feature
```

## Páginas vs componentes

- **`app/.../page.tsx`**: compone features; carga datos vía server (RSC) o llama actions/handlers **delgados**.  
- **Componentes:** presentación; **no** deciden transiciones de estado críticas solos.

## Formularios

- Schema Zod compartido con backend (`packages/validators`).  
- Errores: mostrar mensaje es-AR desde código de error + i18n ([`I18N_STRATEGY.md`](./I18N_STRATEGY.md)).

## Tablas y filtros

- **TanStack Table** como default para grillas densas (OC, movimientos, líneas de presupuesto).  
- Filtros: estado en URL (searchParams) cuando mejore shareability; validar en servidor al refetch.

## Estados de carga

- `loading.tsx`, `Suspense`, skeletons — sin “datos inventados” durante carga.

## Permisos en UI

- Ocultar acciones según rol **solo** para UX; **siempre** revalidar en servidor ([`../00-product/PERMISSIONS_MATRIX.md`](../00-product/PERMISSIONS_MATRIX.md)).

## i18n

- Claves en inglés; copy es-AR ([`I18N_STRATEGY.md`](./I18N_STRATEGY.md)).

## Gantt / cronograma

- **Solo** detrás de **adapter** propio ([`TECH_STACK.md`](./TECH_STACK.md)); el feature importa `ScheduleGanttAdapter`, no la librería cruda.

## Visualizaciones

- **Recharts** con series **ya agregadas en servidor** para KPIs financieros ([`REPORTING_ARCHITECTURE.md`](./REPORTING_ARCHITECTURE.md)).

## Regla de oro

> **La UI nunca es fuente de verdad** para cálculos financieros ni transiciones críticas de lifecycle. Puede **previsualizar**; el servidor **confirma**.

## Referencias

- [`FRONTEND_ARCHITECTURE.md`](./FRONTEND_ARCHITECTURE.md)  
- [`API_STRUCTURE.md`](./API_STRUCTURE.md)
