# Kibo UI (cronograma)

Los adapters viven en [`features/schedule/adapters/schedule-view-types.ts`](../../features/schedule/adapters/schedule-view-types.ts).

Las vistas actuales en `features/schedule/components/` implementan Gantt, calendario y kanban con ese contrato. Para instalar los componentes upstream:

```bash
cd apps/web
npx kibo-ui@latest add gantt calendar kanban
```

Reemplazá el cuerpo de `schedule-gantt-view.tsx` (etc.) por los componentes generados y mantené los mappers del adapter.
