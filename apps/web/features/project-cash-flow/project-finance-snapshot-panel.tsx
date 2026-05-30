import type { ProjectFinanceSnapshot, ProjectAttributedCashInceptionSource } from "@bloqer/services";
import { KpiStatGrid } from "@/components/ui/kpi-stat-grid";
import { DashboardKpiCard } from "@/features/dashboard/dashboard-kpi-card";
import {
  FinanceLayerBadge,
  ProjectFinanceLayersGuide,
} from "@/features/finance/components/project-finance-layers-guide";

function inceptionSourceLabel(source: ProjectAttributedCashInceptionSource): string {
  switch (source) {
    case "startDate":
      return " (fecha de inicio de obra)";
    case "firstMovement":
      return " (primer cobro o pago confirmado)";
    case "createdAt":
      return " (alta del proyecto)";
  }
}

export function ProjectFinanceSnapshotPanel({ snapshot }: { snapshot: ProjectFinanceSnapshot }) {
  const hasKpis = snapshot.obligationKpis.length > 0 || snapshot.attributedCashKpis.length > 0;
  if (!snapshot.visible || (!hasKpis && snapshot.alerts.length === 0)) return null;

  return (
    <div className="space-y-4">
      {hasKpis ? <ProjectFinanceLayersGuide /> : null}

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

      {snapshot.attributedCashKpis.length > 0 ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <FinanceLayerBadge layer="cash" />
            {snapshot.attributedCashMeta ? (
              <p className="text-xs text-muted-foreground">
                Acumulado desde {snapshot.attributedCashMeta.inceptionDate}
                {inceptionSourceLabel(snapshot.attributedCashMeta.inceptionSource)}
              </p>
            ) : null}
          </div>
          <KpiStatGrid title="Caja ejecutada imputada" columns={4}>
            {snapshot.attributedCashKpis.map((k) => (
              <DashboardKpiCard key={k.key} kpi={k} />
            ))}
          </KpiStatGrid>
        </div>
      ) : null}

      {snapshot.obligationKpis.length > 0 ? (
        <div className="space-y-2">
          <FinanceLayerBadge layer="obligations" />
          <KpiStatGrid title="Deuda comercial" columns={4}>
            {snapshot.obligationKpis.map((k) => (
              <DashboardKpiCard key={k.key} kpi={k} />
            ))}
          </KpiStatGrid>
        </div>
      ) : null}
    </div>
  );
}
