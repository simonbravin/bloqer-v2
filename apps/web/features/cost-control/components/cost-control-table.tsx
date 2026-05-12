import Link from "next/link";
import type { CostControlRow, CostControlTotals } from "@bloqer/services";
import { CostVarianceBadge } from "./cost-variance-badge";

function fmt(v: string) {
  return parseFloat(v).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type Props = {
  rows: CostControlRow[];
  totals: CostControlTotals;
  projectId: string;
};

export function CostControlTable({ rows, totals, projectId }: Props) {
  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/50 text-xs uppercase sticky top-0">
            <tr>
              <th className="px-3 py-2 text-left w-28">WBS</th>
              <th className="px-3 py-2 text-left">Ítem</th>
              <th className="px-3 py-2 text-right">Pres. costo</th>
              <th className="px-3 py-2 text-right">Pres. venta</th>
              <th className="px-3 py-2 text-right">Cert. aprobado</th>
              <th className="px-3 py-2 text-right">Comprometido</th>
              <th className="px-3 py-2 text-right">Recibido</th>
              <th className="px-3 py-2 text-right">Devengado</th>
              <th className="px-3 py-2 text-right">Pagado</th>
              <th className="px-3 py-2 text-right">Exposición esp.</th>
              <th className="px-3 py-2 text-right">Variación</th>
              <th className="px-3 py-2 text-right">Avance físico</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.wbsNodeId} className={`border-t hover:bg-muted/30 ${row.flags.overBudget ? "bg-red-50/50 dark:bg-red-950/10" : ""}`}>
                <td className="px-3 py-2 font-mono font-medium">
                  <Link href={`/proyectos/${projectId}/control-costos/${row.wbsNodeId}`} className="hover:underline text-primary">
                    {row.wbsCode}
                  </Link>
                </td>
                <td className="px-3 py-2 max-w-48 truncate">
                  <Link href={`/proyectos/${projectId}/control-costos/${row.wbsNodeId}`} className="hover:underline">
                    {row.wbsName}
                  </Link>
                  {row.flags.missingBudget && <span className="ml-1 text-yellow-600 text-xs">(sin análisis)</span>}
                </td>
                <td className="px-3 py-2 text-right">{fmt(row.budgetTotalCost)}</td>
                <td className="px-3 py-2 text-right text-muted-foreground">{fmt(row.budgetTotalSale)}</td>
                <td className="px-3 py-2 text-right">
                  {fmt(row.certifiedApproved)}
                  {row.flags.overCertified && <span className="ml-1 text-destructive">!</span>}
                </td>
                <td className="px-3 py-2 text-right text-muted-foreground">{fmt(row.committedCost)}</td>
                <td className="px-3 py-2 text-right text-muted-foreground">{fmt(row.receivedCost)}</td>
                <td className="px-3 py-2 text-right text-muted-foreground">{fmt(row.accruedCost)}</td>
                <td className="px-3 py-2 text-right text-muted-foreground">{fmt(row.paidCost)}</td>
                <td className="px-3 py-2 text-right font-medium">{fmt(row.expectedCostExposure)}</td>
                <td className="px-3 py-2 text-right">
                  <CostVarianceBadge variance={row.costVariance} label={fmt(row.costVariance)} />
                </td>
                <td className="px-3 py-2 text-right text-muted-foreground">
                  {parseFloat(row.operationalProgressQty) > 0
                    ? `${parseFloat(row.operationalProgressQty).toLocaleString("es-AR")} ${row.unit}`
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 bg-muted/40 font-semibold">
            <tr>
              <td colSpan={2} className="px-3 py-2">Total</td>
              <td className="px-3 py-2 text-right">{fmt(totals.budgetTotalCost)}</td>
              <td className="px-3 py-2 text-right text-muted-foreground">{fmt(totals.budgetTotalSale)}</td>
              <td className="px-3 py-2 text-right">{fmt(totals.certifiedApproved)}</td>
              <td className="px-3 py-2 text-right text-muted-foreground">{fmt(totals.committedCost)}</td>
              <td className="px-3 py-2 text-right text-muted-foreground">{fmt(totals.receivedCost)}</td>
              <td className="px-3 py-2 text-right text-muted-foreground">{fmt(totals.accruedCost)}</td>
              <td className="px-3 py-2 text-right text-muted-foreground">{fmt(totals.paidCost)}</td>
              <td className="px-3 py-2 text-right">{fmt(totals.expectedCostExposure)}</td>
              <td className="px-3 py-2 text-right">
                <CostVarianceBadge variance={totals.costVariance} label={fmt(totals.costVariance)} />
              </td>
              <td className="px-3 py-2" />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
