"use client";

import type { ScheduleWorkspaceItemDto } from "@bloqer/services";
import { Badge } from "@/components/ui/badge";
import { STATUS_LABELS, primaryWbsLink } from "../adapters/schedule-view-types";
import { ScheduleProgressDimensions } from "./schedule-progress-dimensions";
import { ScheduleViewEmptyMessage } from "./schedule-empty-state";

export function ScheduleTableView({
  items,
  onSelect,
  filtersExcludeAll = false,
  unfilteredActiveCount = 0,
}: {
  items: ScheduleWorkspaceItemDto[];
  onSelect: (item: ScheduleWorkspaceItemDto) => void;
  filtersExcludeAll?: boolean;
  unfilteredActiveCount?: number;
}) {
  if (items.length === 0) {
    return (
      <ScheduleViewEmptyMessage
        filtersExcludeAll={filtersExcludeAll}
        unfilteredActiveCount={unfilteredActiveCount}
      />
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
            <th className="p-3 font-medium">Avance (real / plan t. / cant. / cert.)</th>
            <th className="p-3 font-medium text-right">Presup.</th>
            <th className="p-3 font-medium text-right">Comprom.</th>
            <th className="p-3 font-medium">Alertas</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const primary = primaryWbsLink(item);
            return (
              <tr
                key={item.id}
                className="border-b cursor-pointer hover:bg-muted/40"
                onClick={() => onSelect(item)}
              >
                <td className="p-3 max-w-[240px]">
                  <span className="line-clamp-2">{item.name}</span>
                  <div className="flex flex-wrap items-center gap-1 mt-0.5">
                    {item.type === "MILESTONE" && (
                      <Badge variant="outline" className="text-[10px] px-1 py-0">
                        Hito
                      </Badge>
                    )}
                    {primary && (
                      <span className="text-xs text-muted-foreground">{primary.wbsCode}</span>
                    )}
                  </div>
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
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
