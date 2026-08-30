"use client";

import type { ScheduleFieldItemDto } from "@bloqer/services";
import { Badge } from "@/components/ui/badge";
import { formatDateRangeShortAr, formatDateShortAr } from "@/lib/gantt-date-format";
import { cn } from "@/lib/utils";
import { primaryWbsLink, MILESTONE_COLOR, MILESTONE_DONE_COLOR, MILESTONE_LATE_COLOR } from "../adapters/schedule-view-types";
import { FIELD_STATUS_LABELS, formatProgressPctLabel } from "../adapters/schedule-field-labels";

function statusBadgeVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "BLOCKED") return "destructive";
  if (status === "IN_PROGRESS") return "default";
  if (status === "COMPLETED") return "secondary";
  return "outline";
}

function milestoneBadgeStyle(item: ScheduleFieldItemDto): { borderColor: string; color: string } {
  if (item.status === "COMPLETED") {
    return { borderColor: `${MILESTONE_DONE_COLOR}88`, color: MILESTONE_DONE_COLOR };
  }
  if (item.daysLate != null) {
    return { borderColor: `${MILESTONE_LATE_COLOR}88`, color: MILESTONE_LATE_COLOR };
  }
  return { borderColor: `${MILESTONE_COLOR}88`, color: MILESTONE_COLOR };
}

export function ScheduleFieldTaskCard({
  item,
  onSelect,
}: {
  item: ScheduleFieldItemDto;
  onSelect: (item: ScheduleFieldItemDto) => void;
}) {
  const primary = primaryWbsLink(item);
  const real = formatProgressPctLabel(item.progressPct);
  const plan = formatProgressPctLabel(item.timePlanPct);
  const isMilestone = item.type === "MILESTONE";
  const delayed = item.daysLate != null;
  const blocked = item.status === "BLOCKED";
  const dates = isMilestone
    ? formatDateShortAr(item.endDate ?? item.startDate)
    : formatDateRangeShortAr(item.startDate, item.endDate);
  const milestoneStyle = isMilestone ? milestoneBadgeStyle(item) : null;

  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      data-testid="schedule-field-card"
      data-item-id={item.id}
      data-item-type={item.type}
      data-item-status={item.status}
      className={cn(
        "w-full rounded-lg border bg-card p-4 text-left min-h-11",
        (delayed || blocked) && "border-destructive/40",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-base font-semibold leading-snug">{item.name}</h3>
        <Badge
          variant={statusBadgeVariant(item.status)}
          className={isMilestone ? "border-violet-500/50" : undefined}
          style={milestoneStyle ?? undefined}
        >
          {isMilestone ? "Hito" : (FIELD_STATUS_LABELS[item.status] ?? item.status)}
        </Badge>
      </div>
      {isMilestone && item.status !== "PLANNED" ? (
        <p className="mt-1 text-xs text-muted-foreground">
          {FIELD_STATUS_LABELS[item.status] ?? item.status}
        </p>
      ) : null}
      <p className="mt-2 text-sm tabular-nums">{dates}</p>
      {delayed ? (
        <p className="mt-1 text-sm font-medium text-destructive">
          {item.daysLate} {item.daysLate === 1 ? "día" : "días"} de atraso
        </p>
      ) : null}
      {!isMilestone && (real != null || plan != null) ? (
        <p className="mt-1 text-xs text-muted-foreground">
          {real != null ? `Real ${real}%` : null}
          {real != null && plan != null ? " · " : null}
          {plan != null ? `Plan ${plan}%` : null}
        </p>
      ) : null}
      {primary ? (
        <p className="mt-2 text-xs text-muted-foreground">
          EDT {primary.wbsCode} · {primary.wbsName}
        </p>
      ) : null}
    </button>
  );
}
