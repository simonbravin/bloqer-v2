"use client";

import type { ScheduleWorkspaceItemDto } from "@bloqer/services";
import { cn } from "@/lib/utils";

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
    { key: "real", label: "Real", value: `${real}%`, title: "Avance real en cronograma (libro de obra al aprobar)" },
    {
      key: "time",
      label: "Plan (t)",
      value: timePlan != null ? `${timePlan}%` : "—",
      title: "Avance esperado según fechas vs hoy",
    },
    {
      key: "quantity",
      label: "Cant.",
      value: quantity != null ? `${quantity}%` : "—",
      title: "Avance por cantidad ejecutada (libro aprobado / presupuesto)",
    },
    {
      key: "cert",
      label: "Cert.",
      value: certified != null ? `${certified}%` : "—",
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
    <p className={cn("text-xs text-muted-foreground", className)}>
      <strong className="font-medium text-foreground">Real</strong> = cronograma (sincronizado desde libro) ·{" "}
      <strong className="font-medium text-foreground">Plan (t)</strong> = tiempo transcurrido ·{" "}
      <strong className="font-medium text-foreground">Cant.</strong> = cantidades en obra ·{" "}
      <strong className="font-medium text-foreground">Cert.</strong> = facturación certificada.
    </p>
  );
}
