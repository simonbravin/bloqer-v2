import Link from "next/link";
import type { CostControlRow, CostControlTotals } from "@bloqer/services";
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
import { CostVarianceBadge } from "./cost-variance-badge";

function formatAmount(value: string) {
  return new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(parseFloat(value));
}

type Props = {
  rows: CostControlRow[];
  totals: CostControlTotals;
  projectId: string;
};

export function CostControlTable({ rows, totals, projectId }: Props) {
  return (
    <TableScroll>
        <Table className="text-xs">
          <TableHeader className="sticky top-0 z-10 bg-muted/50">
            <TableRow>
              <TableHead className="w-28">WBS</TableHead>
              <TableHead>Ítem</TableHead>
              <TableHead className="text-right">Pres. costo</TableHead>
              <TableHead className="text-right">Pres. venta</TableHead>
              <TableHead className="text-right">Cert. aprobado</TableHead>
              <TableHead className="text-right">Comprometido</TableHead>
              <TableHead className="text-right">Recibido</TableHead>
              <TableHead className="text-right">Devengado</TableHead>
              <TableHead className="text-right">Pagado</TableHead>
              <TableHead className="text-right">Exposición esp.</TableHead>
              <TableHead className="text-right">Variación</TableHead>
              <TableHead className="text-right">Avance físico</TableHead>
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
                    href={`/proyectos/${projectId}/control-costos/${row.wbsNodeId}`}
                    className="hover:underline text-primary"
                  >
                    {row.wbsCode}
                  </Link>
                </TableCell>
                <TableCell className="max-w-48 truncate">
                  <Link
                    href={`/proyectos/${projectId}/control-costos/${row.wbsNodeId}`}
                    className="hover:underline"
                  >
                    {row.wbsName}
                  </Link>
                  {row.flags.missingBudget && (
                    <span className="ml-1 text-yellow-600 text-xs">(sin análisis)</span>
                  )}
                </TableCell>
                <TableCell className="text-right">{formatAmount(row.budgetTotalCost)}</TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {formatAmount(row.budgetTotalSale)}
                </TableCell>
                <TableCell className="text-right">
                  {formatAmount(row.certifiedApproved)}
                  {row.flags.overCertified && <span className="ml-1 text-destructive">!</span>}
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {formatAmount(row.committedCost)}
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {formatAmount(row.receivedCost)}
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {formatAmount(row.accruedCost)}
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {formatAmount(row.paidCost)}
                </TableCell>
                <TableCell className="text-right font-medium">
                  {formatAmount(row.expectedCostExposure)}
                </TableCell>
                <TableCell className="text-right">
                  <CostVarianceBadge
                    variance={row.costVariance}
                    label={formatAmount(row.costVariance)}
                  />
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {parseFloat(row.operationalProgressQty) > 0
                    ? `${formatAmount(row.operationalProgressQty)} ${row.unit}`
                    : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter className="bg-muted/40 font-semibold">
            <TableRow>
              <TableCell colSpan={2}>Total</TableCell>
              <TableCell className="text-right">{formatAmount(totals.budgetTotalCost)}</TableCell>
              <TableCell className="text-right text-muted-foreground">
                {formatAmount(totals.budgetTotalSale)}
              </TableCell>
              <TableCell className="text-right">{formatAmount(totals.certifiedApproved)}</TableCell>
              <TableCell className="text-right text-muted-foreground">
                {formatAmount(totals.committedCost)}
              </TableCell>
              <TableCell className="text-right text-muted-foreground">
                {formatAmount(totals.receivedCost)}
              </TableCell>
              <TableCell className="text-right text-muted-foreground">
                {formatAmount(totals.accruedCost)}
              </TableCell>
              <TableCell className="text-right text-muted-foreground">
                {formatAmount(totals.paidCost)}
              </TableCell>
              <TableCell className="text-right">{formatAmount(totals.expectedCostExposure)}</TableCell>
              <TableCell className="text-right">
                <CostVarianceBadge
                  variance={totals.costVariance}
                  label={formatAmount(totals.costVariance)}
                />
              </TableCell>
              <TableCell />
            </TableRow>
          </TableFooter>
        </Table>
      </TableScroll>
  );
}
