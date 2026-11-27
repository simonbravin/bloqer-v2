import { FinanceReviewAlerts } from "@/features/finance/components/finance-review-alerts";
import type { TransaccionesOverview } from "@bloqer/services";
import { KpiStatGrid } from "@/components/ui/kpi-stat-grid";
import { DashboardKpiCard } from "@/features/dashboard/dashboard-kpi-card";
import { FinanceProjectionPanel } from "@/features/finance/components/finance-projection-panel";

export function TransaccionesOverviewPanel({ overview }: { overview: TransaccionesOverview }) {
  if (!overview.visible) return null;

  return (
    <div className="space-y-6">
      <FinanceReviewAlerts alerts={overview.alerts} />

      {overview.kpis.length > 0 ? (
        <KpiStatGrid title="Indicadores" columns={4}>
          {overview.kpis.map((k) => (
            <DashboardKpiCard key={k.key} kpi={k} />
          ))}
        </KpiStatGrid>
      ) : null}

      {overview.projection ? <FinanceProjectionPanel projection={overview.projection} /> : null}
    </div>
  );
}
