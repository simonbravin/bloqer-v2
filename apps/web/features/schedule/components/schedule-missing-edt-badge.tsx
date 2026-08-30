"use client";

import type { ScheduleWorkspaceItemDto } from "@bloqer/services";
import { cn } from "@/lib/utils";
import { hasPrimaryWbsLink } from "../adapters/schedule-view-types";

/** Badge when a leaf task/milestone has no primary EDT link (blocks Real sync + cost metrics). */
export function ScheduleMissingEdtBadge({
  item,
  className,
}: {
  item: ScheduleWorkspaceItemDto;
  /** @deprecated unused — leaf comes from server isLeaf (full tree). */
  allItems?: ScheduleWorkspaceItemDto[];
  className?: string;
}) {
  if (item.status === "CANCELLED") return null;
  if (!item.isLeaf) return null;
  if (hasPrimaryWbsLink(item)) return null;
  return (
    <span
      title="Sin partida EDT: el libro de obra no sincroniza avance Real y no hay métricas de costo/cert."
      className={cn(
        "rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:text-amber-200",
        className,
      )}
    >
      Sin EDT
    </span>
  );
}
