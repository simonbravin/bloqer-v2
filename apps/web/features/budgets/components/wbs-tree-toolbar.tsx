"use client";

import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { WbsViewMode } from "../lib/wbs-view-mode";

export type { WbsViewMode } from "../lib/wbs-view-mode";

interface WbsTreeToolbarProps {
  viewMode: WbsViewMode;
  onViewModeChange: (mode: WbsViewMode) => void;
  search: string;
  onSearchChange: (value: string) => void;
}

export function WbsTreeToolbar({
  viewMode,
  onViewModeChange,
  search,
  onSearchChange,
}: WbsTreeToolbarProps) {
  return (
    <div className="flex flex-col gap-3 border-b border-border/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="inline-flex rounded-lg border bg-muted/40 p-0.5">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className={cn(
            "h-8 rounded-md px-3 text-xs font-medium",
            viewMode === "breakdown" && "bg-primary text-primary-foreground shadow-sm hover:bg-primary hover:text-primary-foreground",
          )}
          onClick={() => onViewModeChange("breakdown")}
        >
          Desglose
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className={cn(
            "h-8 rounded-md px-3 text-xs font-medium",
            viewMode === "totals" && "bg-primary text-primary-foreground shadow-sm hover:bg-primary hover:text-primary-foreground",
          )}
          onClick={() => onViewModeChange("totals")}
        >
          Totales
        </Button>
      </div>

      <div className="relative w-full sm:max-w-md">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Buscar por código o descripción..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>
    </div>
  );
}
