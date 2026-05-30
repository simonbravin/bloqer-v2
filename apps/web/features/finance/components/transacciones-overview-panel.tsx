import type { TransaccionesOverview } from "@bloqer/services";
import { KpiStatGrid } from "@/components/ui/kpi-stat-grid";
import { DashboardKpiCard } from "@/features/dashboard/dashboard-kpi-card";
import { FinanceProjectionPanel } from "@/features/finance/components/finance-projection-panel";

export function TransaccionesOverviewPanel({ overview }: { overview: TransaccionesOverview }) {
  if (!overview.visible) return null;

  return (
    <div className="space-y-6">
      {overview.alerts.length > 0 ? (
        <div className="space-y-2">
          {overview.alerts.map((a) => (
            <div
              key={a.message}
              role="note"
              className={
                a.variant === "warning"
                  ? "rounded-xl border border-destructive/35 bg-destructive/5 px-4 py-3 text-sm"
                  : "rounded-xl border border-border/80 bg-muted/30 px-4 py-3 text-sm text-muted-foreground"
              }
            >
              {a.message}
            </div>
          ))}
        </div>
      ) : null}

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
