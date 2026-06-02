# Kibo UI (cronograma)

Componentes instalados vía `npx kibo-ui add` (ADR-007):

- [`gantt/`](./gantt/index.tsx)
- [`calendar/`](./calendar/index.tsx)
- [`kanban/`](./kanban/index.tsx)

Los **adapters** de dominio viven en [`features/schedule/adapters/schedule-view-types.ts`](../../features/schedule/adapters/schedule-view-types.ts). Las vistas del feature `schedule` importan Kibo + mappers; no acceden a DTOs crudos en los componentes Kibo.

Para reinstalar o actualizar:

```bash
cd apps/web
echo N | npx kibo-ui@latest add gantt
echo N | npx kibo-ui@latest add calendar
echo N | npx kibo-ui@latest add kanban
```

Usar `echo N` evita sobrescribir `components/ui/card.tsx` y otros primitivos shadcn ya customizados.
