import type { CostControlTotals } from "@bloqer/services";

function fmt(v: string) {
  return parseFloat(v).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type Props = { totals: CostControlTotals };

export function CostControlSummaryCards({ totals }: Props) {
  const variance = parseFloat(totals.costVariance);
  const varianceColor = variance >= 0
    ? "text-green-700 dark:text-green-400"
    : "text-destructive";

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div className="rounded-lg border bg-card p-4">
        <p className="text-xs text-muted-foreground uppercase">Presupuesto costo</p>
        <p className="text-xl font-semibold mt-1">{fmt(totals.budgetTotalCost)}</p>
        <p className="text-xs text-muted-foreground mt-1">Venta: {fmt(totals.budgetTotalSale)}</p>
      </div>
      <div className="rounded-lg border bg-card p-4">
        <p className="text-xs text-muted-foreground uppercase">Exposición esperada</p>
        <p className="text-xl font-semibold mt-1">{fmt(totals.expectedCostExposure)}</p>
        <p className="text-xs text-muted-foreground mt-1">= max(comprometido, recibido, devengado)</p>
      </div>
      <div className="rounded-lg border bg-card p-4">
        <p className="text-xs text-muted-foreground uppercase">Certificado aprobado</p>
        <p className="text-xl font-semibold mt-1">{fmt(totals.certifiedApproved)}</p>
        <p className="text-xs text-muted-foreground mt-1">Emitido: {fmt(totals.certifiedIssued)}</p>
      </div>
      <div className="rounded-lg border bg-card p-4">
        <p className="text-xs text-muted-foreground uppercase">Variación de costo</p>
        <p className={`text-xl font-semibold mt-1 ${varianceColor}`}>{fmt(totals.costVariance)}</p>
        <p className="text-xs text-muted-foreground mt-1">Margen proyectado: {fmt(totals.projectedMargin)}</p>
      </div>
    </div>
  );
}
