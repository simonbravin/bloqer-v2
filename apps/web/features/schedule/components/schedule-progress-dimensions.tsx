"use client";

import type { ScheduleWorkspaceItemDto } from "@bloqer/services";
import { cn } from "@/lib/utils";

export function scheduleProgressValues(item: ScheduleWorkspaceItemDto) {
  const plan = item.progressPct;
  const physical = item.metrics?.operationalProgressPct ?? null;
  const certified = item.metrics?.certifiedProgressPct ?? null;
  return { plan, physical, certified };
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
  const { plan, physical, certified } = scheduleProgressValues(item);

  const chips = [
    { key: "plan", label: "Plan", value: plan, title: "Avance planificado (cronograma)" },
    {
      key: "physical",
      label: "Físico",
      value: physical != null ? `${physical}%` : "—",
      title: "Avance físico (libro de obra aprobado)",
    },
    {
      key: "cert",
      label: "Cert.",
      value: certified != null ? `${certified}%` : "—",
      title: "Avance económico (certificaciones aprobadas / presupuesto venta)",
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
      aria-label="Avance plan, físico y certificado"
    >
      {chips.map((c) => (
        <span
          key={c.key}
          title={c.title}
          className={cn(
            "rounded border px-1.5 py-0.5 tabular-nums",
            c.key === "plan" && "border-primary/30 bg-primary/5",
            c.key === "physical" && "border-emerald-500/30 bg-emerald-500/5",
            c.key === "cert" && "border-amber-500/30 bg-amber-500/5",
          )}
        >
          <span className="text-muted-foreground">{c.label}</span>{" "}
          <span className="font-medium">{c.key === "plan" ? `${plan}%` : c.value}</span>
        </span>
      ))}
    </div>
  );
}

export function ScheduleProgressLegend({ className }: { className?: string }) {
  return (
    <p className={cn("text-xs text-muted-foreground", className)}>
      <strong className="font-medium text-foreground">Plan</strong> = cronograma ·{" "}
      <strong className="font-medium text-foreground">Físico</strong> = libro de obra ·{" "}
      <strong className="font-medium text-foreground">Cert.</strong> = certificaciones (no se
      mezclan automáticamente).
    </p>
  );
}
