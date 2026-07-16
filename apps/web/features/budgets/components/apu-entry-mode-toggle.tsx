"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ApuEntryMode } from "@bloqer/domain";

export function ApuEntryModeToggle({
  value,
  onChange,
  totalDisabled,
  className,
}: {
  value: ApuEntryMode;
  onChange: (mode: ApuEntryMode) => void;
  totalDisabled?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("inline-flex rounded-md border p-0.5", className)}>
      <Button
        type="button"
        size="sm"
        variant={value === "unit" ? "default" : "ghost"}
        className="h-7 px-2.5 text-xs"
        onClick={() => onChange("unit")}
      >
        Por unidad
      </Button>
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
    </div>
  );
}
