"use client";

import type { ProjectProfitabilityReport } from "@bloqer/services";
import { KpiStatCard } from "@/components/ui/kpi-stat-card";
import { KpiStatGrid } from "@/components/ui/kpi-stat-grid";
import { formatMoneyAmount } from "@/lib/format-money";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const LAYER_LABELS: Record<ProjectProfitabilityReport["costLayer"], string> = {
  exposure: "Exposición esperada",
  committed: "Comprometido",
  accrued: "Devengado",
  paid: "Pagado (caja)",
};

type Props = {
  report: ProjectProfitabilityReport;
};

export function ProfitabilitySummary({ report }: Props) {
  const gmTone =
    parseFloat(report.grossMargin) > 0
      ? "success"
      : parseFloat(report.grossMargin) < 0
        ? "danger"
        : "muted";

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Presupuesto: {report.budgetName} · Ingresos ({report.revenueBasis === "certified" ? "certificado" : "facturado"}) −
        costos ({LAYER_LABELS[report.costLayer]})
      </p>

      <KpiStatGrid title={null} columns={4}>
        <KpiStatCard
          label="Ingresos"
          value={formatMoneyAmount(report.revenue, report.currency)}
        />
        <KpiStatCard
          label="Costos directos"
          value={formatMoneyAmount(report.directCost, report.currency)}
        />
        <KpiStatCard
          label="Margen bruto"
          value={formatMoneyAmount(report.grossMargin, report.currency)}
          tone={gmTone}
        />
        <KpiStatCard
          label="MB %"
          value={report.grossMarginPct != null ? `${report.grossMarginPct}%` : "—"}
          tone={gmTone}
        />
      </KpiStatGrid>

      <KpiStatGrid title={null} columns={2}>
        <KpiStatCard
          label="Venta presupuestada"
          value={formatMoneyAmount(report.budgetTotalSale, report.currency)}
        />
        <KpiStatCard
          label="Margen proyectado (presup.)"
          value={formatMoneyAmount(report.projectedMargin, report.currency)}
        />
      </KpiStatGrid>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Margen neto (R-004)</CardTitle>
          <CardDescription>{report.netMarginNote}</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {report.netMarginAvailable
            ? "Próximamente con política de gastos generales [Q-013]."
            : "Consultá con un perfil FINANCE o administrador para ver MN cuando esté disponible."}
        </CardContent>
      </Card>
    </div>
  );
}
