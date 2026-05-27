import type { DashboardKpi } from "@bloqer/services";
import { KpiStatGrid } from "@/components/ui/kpi-stat-grid";
import { DashboardKpiCard } from "./dashboard-kpi-card";

export function DashboardKpiGrid({ kpis }: { kpis: DashboardKpi[] }) {
  if (kpis.length === 0) return null;
  return (
    <KpiStatGrid title="Indicadores" columns={4}>
      {kpis.map((k) => (
        <DashboardKpiCard key={k.key} kpi={k} />
      ))}
    </KpiStatGrid>
  );
}
