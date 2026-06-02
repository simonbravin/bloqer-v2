"use client";

export function ScheduleViewEmptyMessage({
  filtersExcludeAll,
  unfilteredActiveCount,
}: {
  filtersExcludeAll: boolean;
  unfilteredActiveCount: number;
}) {
  if (filtersExcludeAll) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        Ninguna tarea coincide con los filtros activos.
      </p>
    );
  }
  if (unfilteredActiveCount === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        No hay ítems en el cronograma. Importá desde el presupuesto o creá una tarea.
      </p>
    );
  }
  return null;
}
