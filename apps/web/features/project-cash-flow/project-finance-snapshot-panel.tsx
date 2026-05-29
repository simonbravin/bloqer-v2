import type { ProjectFinanceSnapshot } from "@bloqer/services";
import { KpiStatGrid } from "@/components/ui/kpi-stat-grid";
import { DashboardKpiCard } from "@/features/dashboard/dashboard-kpi-card";

export function ProjectFinanceSnapshotPanel({ snapshot }: { snapshot: ProjectFinanceSnapshot }) {
  if (!snapshot.visible) return null;

  return (
    <div className="space-y-4">
      {snapshot.alerts.length > 0 ? (
        <div className="space-y-2">
          {snapshot.alerts.map((a) => (
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

      {snapshot.kpis.length > 0 ? (
        <KpiStatGrid title="Saldos abiertos" columns={4}>
          {snapshot.kpis.map((k) => (
            <DashboardKpiCard key={k.key} kpi={k} />
          ))}
        </KpiStatGrid>
      ) : null}
    </div>
  );
}
