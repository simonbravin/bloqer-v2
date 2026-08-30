"use client";

import type { ScheduleWorkspaceItemDto } from "@bloqer/services";
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

export function ScheduleProgressDimensions({
  item,
  compact = false,
  className,
}: {
  item: ScheduleWorkspaceItemDto;
  compact?: boolean;
  className?: string;
}) {
  const { real, timePlan, quantity, certified } = scheduleProgressValues(item);

  const chips = [
    { key: "real", label: "Real", value: formatProgressPctDisplay(real), title: "Avance real en cronograma (libro de obra al aprobar)" },
    {
      key: "time",
      label: "Plan (t)",
      value: formatProgressPctDisplay(timePlan),
      title: "Avance esperado según fechas vs hoy",
    },
    {
      key: "quantity",
      label: "Cant.",
      value: formatProgressPctDisplay(quantity),
      title: "Avance por cantidad ejecutada (libro aprobado / presupuesto)",
    },
    {
      key: "cert",
      label: "Cert.",
      value: formatProgressPctDisplay(certified),
      title: "Avance económico certificado",
    },
  ] as const;

  return (
    <div
      className={cn(
        "flex flex-wrap gap-1",
        compact ? "text-[10px]" : "text-xs",
        className,
      )}
      role="group"
      aria-label="Avance real, plan temporal, cantidad y certificado"
    >
      {chips.map((c) => (
        <span
          key={c.key}
          title={c.title}
          className={cn(
            "rounded border px-1.5 py-0.5 tabular-nums",
            c.key === "real" && "border-primary/30 bg-primary/5",
            c.key === "time" && "border-sky-500/30 bg-sky-500/5",
            c.key === "quantity" && "border-emerald-500/30 bg-emerald-500/5",
            c.key === "cert" && "border-amber-500/30 bg-amber-500/5",
          )}
        >
          <span className="text-muted-foreground">{c.label}</span>{" "}
          <span className="font-medium">{c.value}</span>
        </span>
      ))}
    </div>
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
