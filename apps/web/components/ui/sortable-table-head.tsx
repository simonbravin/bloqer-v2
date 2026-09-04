"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { SortDir } from "@/hooks/use-client-table-sort";

export function SortableTableHead({
  label,
  sortKey,
  activeKey,
  sortDir,
  onSort,
  className,
  align = "left",
}: {
  label: string;
  sortKey: string;
  activeKey: string | null;
  sortDir: SortDir;
  onSort: (key: string) => void;
  className?: string;
  /** Prefer this over stuffing `text-right` into className for amount columns. */
  align?: "left" | "right";
}) {
  const active = activeKey === sortKey;
  const Icon = !active ? ArrowUpDown : sortDir === "asc" ? ArrowUp : ArrowDown;
  const right =
    align === "right" || Boolean(className?.includes("text-right"));
  const ariaSort = active ? (sortDir === "asc" ? "ascending" : "descending") : "none";
  const ariaLabel = active
    ? `Ordenar por ${label}, actualmente ${sortDir === "asc" ? "ascendente" : "descendente"}`
    : `Ordenar por ${label}`;

  return (
    <TableHead
      className={cn(className, right && "text-right")}
      aria-sort={ariaSort}
    >
      <button
        type="button"
        className={cn(
          "inline-flex items-center gap-1 font-medium hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm",
          active ? "text-foreground" : "text-muted-foreground",
        )}
        onClick={() => onSort(sortKey)}
        aria-label={ariaLabel}
      >
        {label}
        <Icon className="size-3.5 shrink-0 opacity-70" aria-hidden />
      </button>
    </TableHead>
  );
}
