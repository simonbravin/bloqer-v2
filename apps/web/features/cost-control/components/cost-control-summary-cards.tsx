import type { CostControlTotals } from "@bloqer/services";
import { KpiStatCard } from "@/components/ui/kpi-stat-card";
import { KpiStatGrid } from "@/components/ui/kpi-stat-grid";

function fmt(v: string) {
  return parseFloat(v).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type Props = { totals: CostControlTotals };

export function CostControlSummaryCards({ totals }: Props) {
  const variance = parseFloat(totals.costVariance);
  const varianceTone = variance >= 0 ? "success" : "danger";

  return (
    <KpiStatGrid title={null} columns={4}>
      <KpiStatCard
        label="Presupuesto costo"
        value={fmt(totals.budgetTotalCost)}
        subtitle={`Venta: ${fmt(totals.budgetTotalSale)}`}
      />
      <KpiStatCard
        label="Exposición esperada"
        value={fmt(totals.expectedCostExposure)}
        subtitle={`Certificado: ${fmt(totals.certifiedApproved)}`}
      />
      <KpiStatCard
        label="Certificado aprobado"
        value={fmt(totals.certifiedApproved)}
        subtitle={`Emitido: ${fmt(totals.certifiedIssued)}`}
      />
      <KpiStatCard
        label="Variación de costo"
        value={fmt(totals.costVariance)}
        subtitle={`Margen proyectado: ${fmt(totals.projectedMargin)}`}
        tone={varianceTone}
      />
    </KpiStatGrid>
  );
}
