"use client";

import type { ScheduleTreeItemDto, ScheduleWorkspaceItemDto } from "@bloqer/services";
import { Badge } from "@/components/ui/badge";
import { formatDateAr } from "@/lib/gantt-date-format";
import { formatMoneyAmount, isPositiveMoneyAmount } from "@/lib/format-money";
import {
  STATUS_LABELS,
  primaryWbsLink,
  MILESTONE_COLOR,
} from "../adapters/schedule-view-types";
import { ScheduleProgressDimensions } from "./schedule-progress-dimensions";
import { ScheduleViewEmptyMessage } from "./schedule-empty-state";
import { ScheduleMissingEdtBadge } from "./schedule-missing-edt-badge";
import { ScheduleProcurementChips } from "./schedule-procurement-chips";
import { ScheduleReorderControls } from "./schedule-reorder-controls";

export function ScheduleTableView({
  items,
  onSelect,
  budgetCurrency = "ARS",
  filtersExcludeAll = false,
  unfilteredActiveCount = 0,
  projectId,
  canEdit = false,
  treeItems,
}: {
  items: ScheduleWorkspaceItemDto[];
  onSelect: (item: ScheduleWorkspaceItemDto) => void;
  budgetCurrency?: string;
  filtersExcludeAll?: boolean;
  unfilteredActiveCount?: number;
  projectId?: string;
  canEdit?: boolean;
  treeItems?: ScheduleTreeItemDto[];
}) {
  if (items.length === 0) {
    return (
      <ScheduleViewEmptyMessage
        filtersExcludeAll={filtersExcludeAll}
        unfilteredActiveCount={unfilteredActiveCount}
      />
    );
  }

  const money = (raw: string | undefined | null) =>
    raw != null && raw !== "" ? formatMoneyAmount(raw, budgetCurrency) : "—";

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50 text-left">
            <th className="p-3 font-medium">Tarea</th>
            {canEdit && projectId ? <th className="p-3 font-medium w-[120px]">Orden</th> : null}
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
            const depth = item.treeDepth;
            const isLeaf = item.isLeaf;
            return (
              <tr
                key={item.id}
                className="border-b cursor-pointer hover:bg-muted/40"
                onClick={() => onSelect(item)}
              >
                <td className="p-3 max-w-[240px]">
                  <span
                    className="line-clamp-2 block"
                    style={depth > 0 ? { paddingLeft: depth * 12 } : undefined}
                  >
                    {item.name}
                  </span>
                  <div className="flex flex-wrap items-center gap-1 mt-0.5">
                    {item.type === "MILESTONE" && (
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1 py-0 border-violet-500/40 text-violet-700 dark:text-violet-300"
                        style={{ borderColor: `${MILESTONE_COLOR}66` }}
                      >
                        Hito
                      </Badge>
                    )}
                    {primary && (
                      <span className="text-xs text-muted-foreground">{primary.wbsCode}</span>
                    )}
                    <ScheduleMissingEdtBadge item={item} />
                    <ScheduleProcurementChips item={item} />
                  </div>
                </td>
                {canEdit && projectId ? (
                  <td className="p-2">
                    <ScheduleReorderControls
                      projectId={projectId}
                      itemId={item.id}
                      items={items}
                      treeItems={treeItems}
                      size="xs"
                    />
                  </td>
                ) : null}
                <td className="p-3">{STATUS_LABELS[item.status] ?? item.status}</td>
                <td className="p-3 tabular-nums whitespace-nowrap">{formatDateAr(item.startDate)}</td>
                <td className="p-3 tabular-nums whitespace-nowrap">{formatDateAr(item.endDate)}</td>
                <td className="p-3">
                  <ScheduleProgressDimensions item={item} compact />
                </td>
                <td className="p-3 text-right tabular-nums">
                  {money(item.metrics?.budgetTotalCost)}
                </td>
                <td className="p-3 text-right tabular-nums">
                  {money(item.metrics?.committedCost)}
                </td>
                <td className="p-3">
                  <div className="flex flex-wrap gap-1">
                    {isLeaf && item.daysLate != null && (
                      <span className="rounded bg-destructive/15 px-1.5 py-0.5 text-xs text-destructive">
                        Atrasado {item.daysLate}d
                      </span>
                    )}
                    {item.metrics?.overBudget && (
                      <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-xs text-amber-700 dark:text-amber-400">
                        Sobre PPTO
                      </span>
                    )}
                    {item.metrics && isPositiveMoneyAmount(item.metrics.committedCost) && (
                      <span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-xs text-sky-800 dark:text-sky-300">
                        Compras
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
