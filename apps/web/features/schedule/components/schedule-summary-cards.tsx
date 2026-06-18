import { KpiStatCard } from "@/components/ui/kpi-stat-card";
import type { ScheduleWorkspaceDto } from "@bloqer/services";

export function ScheduleSummaryCards({ workspace }: { workspace: ScheduleWorkspaceDto }) {
  const { summary } = workspace;
  const filteredView = summary.totalItems !== summary.unfilteredActiveCount;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <KpiStatCard
        iconKey="schedule_progress"
        label="Avance cronograma"
        value={summary.scheduleProgressPct != null ? `${summary.scheduleProgressPct}%` : "—"}
        helper="Ponderado por duración (BR-SCH-002: distinto de certificado)"
        tone={
          summary.scheduleProgressPct != null && Number(summary.scheduleProgressPct) >= 100
            ? "success"
            : "default"
        }
      />
      <KpiStatCard
        iconKey="schedule_items"
        label="Ítems activos"
        value={String(filteredView ? summary.totalItems : summary.unfilteredActiveCount)}
        helper={
          filteredView
            ? `de ${summary.unfilteredActiveCount} en total (filtros activos)`
            : undefined
        }
      />
      <KpiStatCard
        iconKey="schedule_completed"
        label="Completados"
        value={String(summary.completedItems)}
        tone={summary.completedItems > 0 ? "success" : "muted"}
      />
      <KpiStatCard
        iconKey="schedule_delayed"
        label="Atrasados"
        value={String(summary.delayedItems)}
        tone={summary.delayedItems > 0 ? "danger" : "muted"}
      />
    </div>
  );
}
