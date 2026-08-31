"use client";

import type { ScheduleTreeItemDto, ScheduleWorkspaceItemDto } from "@bloqer/services";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatDateAr } from "@/lib/gantt-date-format";
import { formatMoneyAmount, isPositiveMoneyAmount } from "@/lib/format-money";
import { cn } from "@/lib/utils";
import {
  STATUS_LABELS,
  primaryWbsLink,
  MILESTONE_COLOR,
} from "../adapters/schedule-view-types";
import { formatProgressPctDisplay } from "../adapters/schedule-field-labels";
import {
  PROGRESS_DIMENSION_HINTS,
  scheduleProgressValues,
} from "./schedule-progress-dimensions";
import { ScheduleViewEmptyMessage } from "./schedule-empty-state";
import { ScheduleMissingEdtBadge } from "./schedule-missing-edt-badge";
import { ScheduleReorderControls } from "./schedule-reorder-controls";

function HeaderHint({ label, hint }: { label: string; hint: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="cursor-help border-b border-dotted border-muted-foreground/50"
        >
          {label}
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs leading-relaxed">{hint}</TooltipContent>
    </Tooltip>
  );
}

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
    <TooltipProvider delayDuration={200}>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b bg-muted/50 text-left">
              {canEdit && projectId ? (
                <th className="w-8 px-1 py-1.5 font-medium">
                  <span className="sr-only">Orden</span>
                </th>
              ) : null}
              <th className="px-2 py-1.5 font-medium">Tarea</th>
              <th className="px-2 py-1.5 font-medium whitespace-nowrap">Estado</th>
              <th className="px-2 py-1.5 font-medium">Inicio</th>
              <th className="px-2 py-1.5 font-medium">Fin</th>
              <th className="px-2 py-1.5 font-medium text-right whitespace-nowrap">
                <HeaderHint
                  label={PROGRESS_DIMENSION_HINTS.real.label}
                  hint={PROGRESS_DIMENSION_HINTS.real.hint}
                />
              </th>
              <th className="px-2 py-1.5 font-medium text-right whitespace-nowrap">
                <HeaderHint
                  label={PROGRESS_DIMENSION_HINTS.time.label}
                  hint={PROGRESS_DIMENSION_HINTS.time.hint}
                />
              </th>
              <th className="px-2 py-1.5 font-medium text-right whitespace-nowrap">
                <HeaderHint
                  label={PROGRESS_DIMENSION_HINTS.quantity.label}
                  hint={PROGRESS_DIMENSION_HINTS.quantity.hint}
                />
              </th>
              <th className="px-2 py-1.5 font-medium text-right whitespace-nowrap">
                <HeaderHint
                  label={PROGRESS_DIMENSION_HINTS.cert.label}
                  hint={PROGRESS_DIMENSION_HINTS.cert.hint}
                />
              </th>
              <th className="px-2 py-1.5 font-medium text-right">Presup.</th>
              <th className="px-2 py-1.5 font-medium text-right">Comprom.</th>
              <th className="px-2 py-1.5 font-medium">Alertas</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const primary = primaryWbsLink(item);
              const depth = item.treeDepth;
              const isLeaf = item.isLeaf;
              const progress = scheduleProgressValues(item);
              const nameAlreadyHasCode =
                primary != null &&
                (item.name === primary.wbsCode ||
                  item.name.startsWith(`${primary.wbsCode} —`) ||
                  item.name.startsWith(`${primary.wbsCode}—`));
              const alerts: { key: string; label: string; hint: string; className: string }[] =
                [];
              if (isLeaf && item.daysLate != null) {
                alerts.push({
                  key: "late",
                  label: `${item.daysLate}d`,
                  hint: `Atrasado ${item.daysLate} días`,
                  className: "bg-destructive/15 text-destructive",
                });
              }
              if (item.metrics?.overBudget) {
                alerts.push({
                  key: "budget",
                  label: "PPTO",
                  hint: "Sobre presupuesto",
                  className: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
                });
              }
              if (item.metrics && isPositiveMoneyAmount(item.metrics.committedCost)) {
                alerts.push({
                  key: "buy",
                  label: "OC",
                  hint: "Hay compras comprometidas",
                  className: "bg-sky-500/15 text-sky-800 dark:text-sky-300",
                });
              }
              const proc = item.procurement;
              if (proc?.expectedDeliveryDate || proc?.latestReceiptDate) {
                alerts.push({
                  key: "proc",
                  label: "Entrega",
                  hint: [
                    proc.expectedDeliveryDate
                      ? `Entrega OC ${formatDateAr(proc.expectedDeliveryDate)}`
                      : null,
                    proc.latestReceiptDate
                      ? `Recibido ${formatDateAr(proc.latestReceiptDate)}`
                      : null,
                    proc.deliveryAfterSiblingStart
                      ? "La entrega prometida es posterior al inicio de una tarea hermana"
                      : null,
                  ]
                    .filter(Boolean)
                    .join(". "),
                  className: "bg-muted text-muted-foreground",
                });
              }

              return (
                <tr
                  key={item.id}
                  className="border-b cursor-pointer hover:bg-muted/40"
                  onClick={() => onSelect(item)}
                >
                  {canEdit && projectId ? (
                    <td className="px-0.5 py-1 align-middle">
                      <ScheduleReorderControls
                        projectId={projectId}
                        itemId={item.id}
                        items={items}
                        treeItems={treeItems}
                        size="xs"
                        layout="menu"
                      />
                    </td>
                  ) : null}
                  <td className="max-w-[22rem] px-2 py-1 align-middle">
                    <div
                      className="flex min-w-0 items-center gap-1"
                      style={depth > 0 ? { paddingLeft: depth * 10 } : undefined}
                    >
                      {item.type === "MILESTONE" ? (
                        <span
                          className="inline-block h-1.5 w-1.5 shrink-0 rotate-45 rounded-[1px]"
                          style={{ backgroundColor: MILESTONE_COLOR }}
                          title="Hito"
                          aria-label="Hito"
                        />
                      ) : null}
                      <span className="min-w-0 flex-1 truncate" title={item.name}>
                        {item.name}
                      </span>
                      {!nameAlreadyHasCode && primary ? (
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          {primary.wbsCode}
                        </span>
                      ) : null}
                      <ScheduleMissingEdtBadge
                        item={item}
                        className="shrink-0 px-1 py-0"
                      />
                    </div>
                  </td>
                  <td className="px-2 py-1 align-middle whitespace-nowrap">
                    {STATUS_LABELS[item.status] ?? item.status}
                  </td>
                  <td className="px-2 py-1 align-middle tabular-nums whitespace-nowrap">
                    {formatDateAr(item.startDate)}
                  </td>
                  <td className="px-2 py-1 align-middle tabular-nums whitespace-nowrap">
                    {formatDateAr(item.endDate)}
                  </td>
                  {(
                    [
                      ["real", progress.real],
                      ["time", progress.timePlan],
                      ["quantity", progress.quantity],
                      ["cert", progress.certified],
                    ] as const
                  ).map(([key, raw]) => (
                    <td
                      key={key}
                      className="px-2 py-1 align-middle text-right tabular-nums whitespace-nowrap"
                      title={PROGRESS_DIMENSION_HINTS[key].hint}
                    >
                      {formatProgressPctDisplay(raw)}
                    </td>
                  ))}
                  <td className="px-2 py-1 align-middle text-right tabular-nums whitespace-nowrap">
                    {money(item.metrics?.budgetTotalCost)}
                  </td>
                  <td className="px-2 py-1 align-middle text-right tabular-nums whitespace-nowrap">
                    {money(item.metrics?.committedCost)}
                  </td>
                  <td className="px-2 py-1 align-middle">
                    <div className="flex flex-nowrap items-center gap-0.5">
                      {alerts.map((a) => (
                        <Tooltip key={a.key}>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className={cn(
                                "rounded px-1 py-0 text-[10px] font-medium whitespace-nowrap",
                                a.className,
                              )}
                            >
                              {a.label}
                            </button>
                          </TooltipTrigger>
                          <TooltipContent className="text-xs">{a.hint}</TooltipContent>
                        </Tooltip>
                      ))}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </TooltipProvider>
  );
}
