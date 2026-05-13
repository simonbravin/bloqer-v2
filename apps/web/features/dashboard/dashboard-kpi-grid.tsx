import type { DashboardKpi } from "@bloqer/services";
import { DashboardKpiCard } from "./dashboard-kpi-card";

export function DashboardKpiGrid({ kpis }: { kpis: DashboardKpi[] }) {
  if (kpis.length === 0) return null;
  return (
    <section className="space-y-4">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Indicadores</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
        {kpis.map((k) => (
          <DashboardKpiCard key={k.key} kpi={k} />
        ))}
      </div>
    </section>
  );
}
