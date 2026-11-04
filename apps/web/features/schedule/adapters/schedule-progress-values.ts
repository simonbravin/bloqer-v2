import type { ScheduleWorkspaceItemDto } from "@bloqer/services";

export function scheduleProgressValues(item: ScheduleWorkspaceItemDto) {
  const real = item.progressPct;
  const timePlan = item.timePlanPct;
  const quantity = item.metrics?.operationalProgressPct ?? null;
  const certified = item.metrics?.certifiedProgressPct ?? null;
  return { real, timePlan, quantity, certified };
}

export const PROGRESS_DIMENSION_HINTS = {
  real: {
    label: "Real",
    hint: "Avance real del cronograma. En tareas se sincroniza al aprobar el libro; al llegar a 100% la tarea queda Completada. En hitos se completa a mano o al confirmar una recepción de la misma EDT.",
  },
  time: {
    label: "Plan (t)",
    hint: "Avance esperado según las fechas planificadas frente a hoy. Solo lectura.",
  },
  quantity: {
    label: "Cant.",
    hint: "Avance por cantidades ejecutadas (libro aprobado vs presupuesto). Solo lectura.",
  },
  cert: {
    label: "Cert.",
    hint: "Avance económico certificado. Solo lectura; no actualiza el Real del cronograma.",
  },
} as const;

