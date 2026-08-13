import type { CostControlTotals } from "@bloqer/services";
import { KpiStatCard } from "@/components/ui/kpi-stat-card";
import { KpiStatGrid } from "@/components/ui/kpi-stat-grid";
import { formatMoneyAmount, isPositiveMoneyAmount, isZeroMoneyAmount } from "@/lib/format-money";

type Props = { totals: CostControlTotals };

export function CostControlSummaryCards({ totals }: Props) {
  const varianceTone = isZeroMoneyAmount(totals.costVariance)
    ? "muted"
    : isPositiveMoneyAmount(totals.costVariance)
      ? "success"
      : "danger";

  return (
    <KpiStatGrid title={null} columns={5}>
      <KpiStatCard
        iconKey="cost_budget"
        label="Presupuesto costo"
        value={formatMoneyAmount(totals.budgetTotalCost)}
        subtitle={`Venta: ${formatMoneyAmount(totals.budgetTotalSale)}`}
      />
      <KpiStatCard
        iconKey="cost_exposure"
        label="Exposición esperada"
        value={formatMoneyAmount(totals.expectedCostExposure)}
        subtitle={`Comp. abierto: ${formatMoneyAmount(totals.openCommittedCost)} · Devengado + abierto`}
      />
      <KpiStatCard
        iconKey="cost_certified"
        label="Certificado aprobado"
        value={formatMoneyAmount(totals.certifiedApproved)}
        subtitle={`Emitido: ${formatMoneyAmount(totals.certifiedIssued)}`}
      />
      <KpiStatCard
        iconKey="cost_variance"
        label="Variación de costo"
        value={formatMoneyAmount(totals.costVariance)}
        subtitle={`Margen proyectado: ${formatMoneyAmount(totals.projectedMargin)}`}
        tone={varianceTone}
      />
      <KpiStatCard
        iconKey="cost_budget"
        label="Consumo inventario"
        value={formatMoneyAmount(totals.inventoryConsumedCost)}
        subtitle={`Devengado: ${formatMoneyAmount(totals.accruedCost)} · Pagado: ${formatMoneyAmount(totals.paidCost)}`}
      />
    </KpiStatGrid>
  );
}
