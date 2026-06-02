"use client";

import { MinusIcon, PanelLeftCloseIcon, PanelLeftIcon, PlusIcon } from "lucide-react";
import type { Range } from "@/components/kibo-ui/gantt";
import { useGanttLayout } from "@/components/kibo-ui/gantt";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const RANGE_OPTIONS: { id: Range; label: string }[] = [
  { id: "daily", label: "Día" },
  { id: "monthly", label: "Mes" },
  { id: "quarterly", label: "Trimestre" },
];

export function ScheduleGanttToolbar({
  range,
  onRangeChange,
  zoom,
  onZoomChange,
  sidebarOpen,
  onSidebarOpenChange,
  onRecalculateContainers,
  recalculatePending = false,
  canEdit = false,
  className,
}: {
  range: Range;
  onRangeChange: (range: Range) => void;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  sidebarOpen: boolean;
  onSidebarOpenChange: (open: boolean) => void;
  onRecalculateContainers?: () => void;
  recalculatePending?: boolean;
  canEdit?: boolean;
  className?: string;
}) {
  const gantt = useGanttLayout();

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 border-b bg-muted/30 px-2 py-1.5",
        className,
      )}
      style={{ gridColumn: "1 / -1" }}
    >
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 text-xs"
        onClick={() => gantt.scrollToDate?.(new Date())}
      >
        Ir a hoy
      </Button>

      <div className="flex items-center rounded-md border bg-background p-0.5">
        {RANGE_OPTIONS.map((opt) => (
          <Button
            key={opt.id}
            type="button"
            variant={range === opt.id ? "secondary" : "ghost"}
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => onRangeChange(opt.id)}
          >
            {opt.label}
          </Button>
        ))}
      </div>

      <div className="flex items-center gap-0.5">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-7 w-7"
          disabled={zoom <= 50}
          onClick={() => onZoomChange(Math.max(50, zoom - 10))}
          aria-label="Alejar"
        >
          <MinusIcon className="h-3.5 w-3.5" />
        </Button>
        <span className="min-w-[3rem] text-center text-xs tabular-nums text-muted-foreground">
          {zoom}%
        </span>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-7 w-7"
          disabled={zoom >= 150}
          onClick={() => onZoomChange(Math.min(150, zoom + 10))}
          aria-label="Acercar"
        >
          <PlusIcon className="h-3.5 w-3.5" />
        </Button>
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 text-xs"
        onClick={() => onSidebarOpenChange(!sidebarOpen)}
      >
        {sidebarOpen ? (
          <>
            <PanelLeftCloseIcon className="mr-1 h-3.5 w-3.5" />
            Ocultar panel
          </>
        ) : (
          <>
            <PanelLeftIcon className="mr-1 h-3.5 w-3.5" />
            Panel de tareas
          </>
        )}
      </Button>

      {canEdit && onRecalculateContainers ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          disabled={recalculatePending}
          onClick={onRecalculateContainers}
        >
          {recalculatePending ? "Recalculando…" : "Recalcular contenedores"}
        </Button>
      ) : null}

      <div className="ml-auto flex items-center gap-2 text-[10px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-4 rounded-sm bg-slate-600" />
          Contenedor
        </span>
      </div>
    </div>
  );
}
