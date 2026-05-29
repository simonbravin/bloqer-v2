"use client";

import Link from "next/link";
import type { BudgetVarianceRow, BudgetVarianceReport } from "@bloqer/services";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableScroll } from "@/components/ui/table-scroll";
import { CostVarianceBadge } from "@/features/cost-control/components/cost-variance-badge";
import { cn } from "@/lib/utils";

function formatAmount(value: string) {
  return new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(parseFloat(value));
}

const STATUS_LABEL: Record<BudgetVarianceRow["varianceStatus"], string> = {
  favorable: "A favor",
  unfavorable: "En contra",
  on_budget: "En línea",
  no_baseline: "Sin baseline",
};

type Props = {
  report: BudgetVarianceReport;
  projectId: string;
};

export function BudgetVarianceTable({ report, projectId }: Props) {
  const { rows, totals, costLayer } = report;

  const layerLabel =
    costLayer === "committed"
      ? "Comprometido"
      : costLayer === "accrued"
        ? "Devengado"
        : costLayer === "paid"
          ? "Pagado"
          : "Exposición esp.";

  return (
    <TableScroll>
      <Table className="text-xs">
        <TableHeader className="sticky top-0 z-10 bg-muted/50">
          <TableRow>
            <TableHead className="w-28">Partida</TableHead>
            <TableHead>Ítem</TableHead>
            <TableHead className="text-right">Pres. costo</TableHead>
            <TableHead className="text-right">Real ({layerLabel})</TableHead>
            <TableHead className="text-right">Variación $</TableHead>
            <TableHead className="text-right">Variación %</TableHead>
            <TableHead className="text-right">Estado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow
              key={row.wbsNodeId}
              className={row.flags.overBudget ? "bg-red-50/50 dark:bg-red-950/10" : ""}
            >
              <TableCell className="font-mono font-medium">
                <Link
                  href={`/proyectos/${projectId}/control-costos/${row.wbsNodeId}?budgetId=${report.budgetId}`}
                  className="hover:underline text-primary"
                >
                  {row.wbsCode}
                </Link>
              </TableCell>
              <TableCell className="max-w-[min(22rem,40vw)]">
                <div className="overflow-x-auto overscroll-x-contain [scrollbar-width:thin]">
                  <span className="whitespace-nowrap pr-1">{row.wbsName}</span>
                </div>
              </TableCell>
              <TableCell className="text-right">{formatAmount(row.budgetTotalCost)}</TableCell>
              <TableCell className="text-right font-medium">{formatAmount(row.actualCost)}</TableCell>
              <TableCell className="text-right">
                <CostVarianceBadge variance={row.costVariance} label={formatAmount(row.costVariance)} />
              </TableCell>
              <TableCell className="text-right text-muted-foreground">
                {row.variancePct != null ? `${row.variancePct}%` : "—"}
              </TableCell>
              <TableCell className="text-right">
                <span
                  className={cn(
                    "text-xs font-medium",
                    row.varianceStatus === "favorable" && "text-emerald-600",
                    row.varianceStatus === "unfavorable" && "text-destructive",
                    row.varianceStatus === "on_budget" && "text-muted-foreground",
                    row.varianceStatus === "no_baseline" && "text-amber-600",
                  )}
                >
                  {STATUS_LABEL[row.varianceStatus]}
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter className="bg-muted/40 font-semibold">
          <TableRow>
            <TableCell colSpan={2}>Total</TableCell>
            <TableCell className="text-right">{formatAmount(totals.budgetTotalCost)}</TableCell>
            <TableCell className="text-right">{formatAmount(totals.actualCost)}</TableCell>
            <TableCell className="text-right">
              <CostVarianceBadge variance={totals.costVariance} label={formatAmount(totals.costVariance)} />
            </TableCell>
            <TableCell className="text-right text-muted-foreground">
              {totals.variancePct != null ? `${totals.variancePct}%` : "—"}
            </TableCell>
            <TableCell />
          </TableRow>
        </TableFooter>
      </Table>
    </TableScroll>
  );
}
