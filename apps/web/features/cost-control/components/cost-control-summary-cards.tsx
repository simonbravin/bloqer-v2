import type { CostControlTotals } from "@bloqer/services";
import { KpiStatCard } from "@/components/ui/kpi-stat-card";
import { KpiStatGrid } from "@/components/ui/kpi-stat-grid";
import { formatMoneyAmount, isPositiveMoneyAmount, isZeroMoneyAmount } from "@/lib/format-money";

type Props = {
  totals: CostControlTotals;
  /** When set, KPIs are scoped to one CostCategory ([D-099]). Sale / certified / margin are not sliced. */
  costTypeLabel?: string;
};

export function CostControlSummaryCards({ totals, costTypeLabel }: Props) {
  const varianceTone = isZeroMoneyAmount(totals.costVariance)
    ? "muted"
    : isPositiveMoneyAmount(totals.costVariance)
      ? "success"
      : "danger";
  const scoped = Boolean(costTypeLabel);

  return (
    <KpiStatGrid title={null} columns={5}>
      <KpiStatCard
        compact
        iconKey="cost_budget"
        label={scoped ? `Presupuesto · ${costTypeLabel}` : "Presupuesto costo"}
        value={formatMoneyAmount(totals.budgetTotalCost)}
        subtitle={scoped ? "Solo este tipo de costo" : `Venta: ${formatMoneyAmount(totals.budgetTotalSale)}`}
      />
      <KpiStatCard
        compact
        iconKey="cost_exposure"
        label="Exposición esperada"
        value={formatMoneyAmount(totals.expectedCostExposure)}
        subtitle={`Abierto: ${formatMoneyAmount(totals.openCommittedCost)}`}
      />
      <KpiStatCard
        compact
        iconKey="cost_certified"
        label="Certificado aprobado"
        value={scoped ? "—" : formatMoneyAmount(totals.certifiedApproved)}
        subtitle={scoped ? "No se parte por tipo" : `Emitido: ${formatMoneyAmount(totals.certifiedIssued)}`}
      />
      <KpiStatCard
        compact
        iconKey="cost_variance"
        label="Variación de costo"
        value={formatMoneyAmount(totals.costVariance)}
        subtitle={scoped ? `Restante: ${formatMoneyAmount(totals.remainingBudgetCost)}` : `Margen: ${formatMoneyAmount(totals.projectedMargin)}`}
        tone={varianceTone}
      />
      <KpiStatCard
        compact
        iconKey="cost_budget"
        label="Consumo inventario"
        value={formatMoneyAmount(totals.inventoryConsumedCost)}
        subtitle={`Dev. ${formatMoneyAmount(totals.accruedCost)} · Pag. ${formatMoneyAmount(totals.paidCost)}`}
      />
    </KpiStatGrid>
  );
}
