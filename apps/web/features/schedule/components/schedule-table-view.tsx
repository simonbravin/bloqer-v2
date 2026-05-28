"use client";

import type { ScheduleWorkspaceDto, ScheduleWorkspaceItemDto } from "@bloqer/services";
import { STATUS_LABELS } from "../adapters/schedule-view-types";
import { ScheduleProgressDimensions } from "./schedule-progress-dimensions";

export function ScheduleTableView({
  items,
  onSelect,
}: {
  items: ScheduleWorkspaceItemDto[];
  onSelect: (item: ScheduleWorkspaceItemDto) => void;
}) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        No hay ítems en el cronograma. Importá desde el presupuesto o creá una tarea.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50 text-left">
            <th className="p-3 font-medium">Tarea</th>
            <th className="p-3 font-medium">Estado</th>
            <th className="p-3 font-medium">Inicio</th>
            <th className="p-3 font-medium">Fin</th>
            <th className="p-3 font-medium">Avance (plan / físico / cert.)</th>
            <th className="p-3 font-medium text-right">Presup.</th>
            <th className="p-3 font-medium text-right">Comprom.</th>
            <th className="p-3 font-medium">Alertas</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr
              key={item.id}
              className="border-b cursor-pointer hover:bg-muted/40"
              onClick={() => onSelect(item)}
            >
              <td className="p-3 max-w-[240px]">
                <span className="line-clamp-2">{item.name}</span>
                {item.wbsLinks[0] && (
                  <span className="text-xs text-muted-foreground block">
                    {item.wbsLinks[0].wbsCode}
                  </span>
                )}
              </td>
              <td className="p-3">{STATUS_LABELS[item.status] ?? item.status}</td>
              <td className="p-3 tabular-nums whitespace-nowrap">{item.startDate ?? "—"}</td>
              <td className="p-3 tabular-nums whitespace-nowrap">{item.endDate ?? "—"}</td>
              <td className="p-3">
                <ScheduleProgressDimensions item={item} compact />
              </td>
              <td className="p-3 text-right tabular-nums">
                {item.metrics?.budgetTotalCost ?? "—"}
              </td>
              <td className="p-3 text-right tabular-nums">
                {item.metrics?.committedCost ?? "—"}
              </td>
              <td className="p-3">
                <div className="flex flex-wrap gap-1">
                  {item.daysLate != null && (
                    <span className="rounded bg-destructive/15 px-1.5 py-0.5 text-xs text-destructive">
                      Atrasado {item.daysLate}d
                    </span>
                  )}
                  {item.metrics?.overBudget && (
                    <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-xs text-amber-700 dark:text-amber-400">
                      Sobre PPTO
                    </span>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
