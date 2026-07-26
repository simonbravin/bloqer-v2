"use client";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ApuEntryMode } from "@bloqer/domain";

export function ApuEntryModeToggle({
  value,
  onChange,
  totalDisabled,
  unitTooltip,
  totalTooltip,
  className,
}: {
  value: ApuEntryMode;
  onChange: (mode: ApuEntryMode) => void;
  totalDisabled?: boolean;
  /** Hover copy for Por unidad (include item unit/qty when known). */
  unitTooltip?: string;
  /** Hover copy for Total partida. */
  totalTooltip?: string;
  className?: string;
}) {
  const unitTip =
    unitTooltip ??
    "Consumo y precio por cada 1 unidad del ítem. El total de partida = aporte × cantidad del ítem.";
  const totalTip =
    totalTooltip ??
    "Cantidad total del recurso para esta partida (ej. 500 kg). No se vuelve a multiplicar por la cantidad del ítem.";

  return (
    <TooltipProvider delayDuration={300}>
      <div className={cn("inline-flex rounded-md border p-0.5", className)}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              size="sm"
              variant={value === "unit" ? "default" : "ghost"}
              className="h-7 px-2.5 text-xs"
              onClick={() => onChange("unit")}
            >
              Por unidad
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs text-xs">
            {unitTip}
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              size="sm"
              variant={value === "total" ? "default" : "ghost"}
              className="h-7 px-2.5 text-xs"
              disabled={totalDisabled}
              onClick={() => onChange("total")}
            >
              Total partida
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs text-xs">
            {totalDisabled
              ? "Definí la cantidad del ítem para usar Total partida."
              : totalTip}
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
