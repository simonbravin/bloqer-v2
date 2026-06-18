import type { DashboardKpi } from "@bloqer/services";
import { KpiStatCard, type KpiStatTone } from "@/components/ui/kpi-stat-card";

export function DashboardKpiCard({ kpi }: { kpi: DashboardKpi }) {
  return (
    <KpiStatCard
      label={kpi.label}
      value={kpi.value}
      href={kpi.href}
      helper={kpi.helper}
      iconKey={kpi.key}
      tone={(kpi.tone ?? "default") as KpiStatTone}
    />
  );
}
