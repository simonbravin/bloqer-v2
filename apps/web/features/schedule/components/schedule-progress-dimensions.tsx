"use client";

import type { ReactNode } from "react";
import { Info } from "lucide-react";
import type { ScheduleWorkspaceItemDto } from "@bloqer/services";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { MILESTONE_COLOR } from "../adapters/schedule-view-types";
import { formatProgressPctDisplay } from "../adapters/schedule-field-labels";

export function scheduleProgressValues(item: ScheduleWorkspaceItemDto) {
  const real = item.progressPct;
  const timePlan = item.timePlanPct;
  const quantity = item.metrics?.operationalProgressPct ?? null;
  const certified = item.metrics?.certifiedProgressPct ?? null;
  return { real, timePlan, quantity, certified };
}

export const PROGRESS_DIMENSION_HINTS = {
  real: {
    label: "Real",
    hint: "Avance real del cronograma. En tareas se sincroniza al aprobar el libro de obra. En hitos se completa a mano o al confirmar una recepción de la misma EDT.",
  },
  time: {
    label: "Plan (t)",
    hint: "Avance esperado según las fechas planificadas frente a hoy. Solo lectura.",
  },
  quantity: {
    label: "Cant.",
    hint: "Avance por cantidades ejecutadas (libro aprobado vs presupuesto). Solo lectura.",
  },
  cert: {
    label: "Cert.",
    hint: "Avance económico certificado. Solo lectura; no actualiza el Real del cronograma.",
  },
} as const;

const CHIP_CLASS: Record<keyof typeof PROGRESS_DIMENSION_HINTS, string> = {
  real: "border-primary/30 bg-primary/5",
  time: "border-sky-500/30 bg-sky-500/5",
  quantity: "border-emerald-500/30 bg-emerald-500/5",
  cert: "border-amber-500/30 bg-amber-500/5",
};

export function ScheduleHint({
  hint,
  label,
  className,
}: {
  hint: string;
  label?: ReactNode;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1 text-muted-foreground hover:text-foreground",
            className,
          )}
          aria-label="Más información"
        >
          {label}
          <Info className="h-3.5 w-3.5 shrink-0" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs leading-relaxed">{hint}</TooltipContent>
    </Tooltip>
  );
}

export function ScheduleProgressDimensions({
  item,
  compact = false,
  className,
}: {
  item: ScheduleWorkspaceItemDto;
  compact?: boolean;
  className?: string;
}) {
  const values = scheduleProgressValues(item);
  const chips = [
    { key: "real" as const, value: formatProgressPctDisplay(values.real) },
    { key: "time" as const, value: formatProgressPctDisplay(values.timePlan) },
    { key: "quantity" as const, value: formatProgressPctDisplay(values.quantity) },
    { key: "cert" as const, value: formatProgressPctDisplay(values.certified) },
  ];

  return (
    <TooltipProvider delayDuration={200}>
      <div
        className={cn(
          "flex flex-wrap gap-1",
          compact ? "text-[10px]" : "text-xs",
          className,
        )}
        role="group"
        aria-label="Avance real, plan temporal, cantidad y certificado"
      >
        {chips.map((c) => {
          const meta = PROGRESS_DIMENSION_HINTS[c.key];
          return (
            <Tooltip key={c.key}>
              <TooltipTrigger asChild>
                <span
                  tabIndex={0}
                  className={cn(
                    "inline-flex shrink-0 cursor-help items-center gap-0.5 rounded border px-1 py-0 tabular-nums",
                    CHIP_CLASS[c.key],
                  )}
                >
                  <span className="text-muted-foreground">{meta.label}</span>{" "}
                  <span className="font-medium">{c.value}</span>
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs text-xs leading-relaxed">
                <p className="font-medium">{meta.label}</p>
                <p>{meta.hint}</p>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}

export function ScheduleProgressLegend({ className }: { className?: string }) {
  return (
    <div className={cn("space-y-1 text-xs text-muted-foreground", className)}>
      <p>
        <strong className="font-medium text-foreground">Real</strong> = cronograma
        (sincronizado desde libro en <em>tareas</em>; hitos a mano o por recepción) ·{" "}
        <strong className="font-medium text-foreground">Plan (t)</strong> = tiempo
        transcurrido ·{" "}
        <strong className="font-medium text-foreground">Cant.</strong> = cantidades en
        obra · <strong className="font-medium text-foreground">Cert.</strong> = facturación
        certificada (solo lectura).
      </p>
      <p>
        En el Gantt: relleno oscuro = Real; franja/borde ámbar = Cert.{" "}
        <strong className="font-medium text-foreground">Barra roja</strong> = atrasado vs
        plan (tarea o hito).{" "}
        <span className="inline-flex items-center gap-1">
          Hito = diamante{" "}
          <span
            className="inline-block h-2 w-2 rotate-45 rounded-[1px]"
            style={{ backgroundColor: MILESTONE_COLOR }}
            aria-hidden
          />{" "}
          (violeta; rojo si atrasado; verde si hecho).
        </span>{" "}
        Comprometido (compras) se muestra en sidebar, tabla y detalle cuando hay EDT vinculado.
      </p>
    </div>
  );
}
