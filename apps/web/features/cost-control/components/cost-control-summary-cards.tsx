import type { CostControlTotals } from "@bloqer/services";
import { KpiStatCard } from "@/components/ui/kpi-stat-card";
import { KpiStatGrid } from "@/components/ui/kpi-stat-grid";
import { formatMoneyAmount, formatMoneyDisplay, isPositiveMoneyAmount, isZeroMoneyAmount } from "@/lib/format-money";

type Props = {
  totals: CostControlTotals;
  currency: string;
  /** When set, KPIs are scoped to one CostCategory ([D-099]). Sale / certified / margin are not sliced. */
  costTypeLabel?: string;
};

export function CostControlSummaryCards({ totals, currency, costTypeLabel }: Props) {
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
        value={formatMoneyAmount(totals.budgetTotalCost, currency)}
        subtitle={scoped ? "Solo este tipo de costo" : `Venta: ${formatMoneyAmount(totals.budgetTotalSale, currency)}`}
      />
      <KpiStatCard
        compact
        iconKey="cost_exposure"
        label="Exposición esperada"
        value={formatMoneyAmount(totals.expectedCostExposure, currency)}
        subtitle={`Abierto: ${formatMoneyAmount(totals.openCommittedCost, currency)}`}
      />
      <KpiStatCard
        compact
        iconKey="cost_certified"
        label="Certificado aprobado"
        value={scoped ? "—" : formatMoneyAmount(totals.certifiedApproved, currency)}
        subtitle={scoped ? "No se parte por tipo" : `Emitido: ${formatMoneyAmount(totals.certifiedIssued, currency)}`}
      />
      <KpiStatCard
        compact
        iconKey="cost_variance"
        label="Variación de costo"
        value={formatMoneyAmount(totals.costVariance, currency)}
        helper="Según exposición documental; no es valuación del consumo."
        subtitle={scoped ? `Restante: ${formatMoneyAmount(totals.remainingBudgetCost, currency)}` : `Margen: ${formatMoneyAmount(totals.projectedMargin, currency)}`}
        tone={varianceTone}
      />
      <KpiStatCard
        compact
        iconKey="cost_budget"
        label="Consumo inventario"
        value={formatMoneyDisplay(totals.inventoryConsumedCost, currency)}
        subtitle={`${totals.inventoryConsumedCost == null ? "Sin valuación · " : ""}Dev. ${formatMoneyAmount(totals.accruedCost, currency)} · Pag. ${formatMoneyAmount(totals.paidCost, currency)}`}
      />
    </KpiStatGrid>
  );
}
