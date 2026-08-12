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

const tipClassName = "max-w-[240px] whitespace-normal break-words text-xs leading-snug";

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
          <TooltipContent
            side="bottom"
            align="start"
            collisionPadding={12}
            className={tipClassName}
          >
            {unitTip}
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            {/* span: disabled buttons don't fire pointer events, so tooltip wouldn't show */}
            <span className={cn(totalDisabled && "inline-flex cursor-not-allowed")}>
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
            </span>
          </TooltipTrigger>
          <TooltipContent
            side="bottom"
            align="end"
            collisionPadding={12}
            className={tipClassName}
          >
            {totalDisabled
              ? "Definí la cantidad del ítem para usar Total partida."
              : totalTip}
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
